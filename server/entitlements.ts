import { ApiError, db, now, billingMode, type Env } from './db.ts';
import { TIERS, isTier, type Tier } from '../lib/plans.ts';
import { id } from '../lib/world.ts';
export async function entitlement(env: Env, owner: string) {
    let tier: Tier = 'wallet';
    if (billingMode(env) === 'test') {
        const trial = await db(env).prepare('SELECT plan_id FROM plan_trials WHERE owner=?').bind(owner).first<{plan_id:string}>();
        if (trial && isTier(trial.plan_id)) tier = trial.plan_id;
    } else {
        const s = await db(env).prepare("SELECT plan_id FROM subscriptions WHERE owner=? AND mode='live' AND status='active' AND paid_until>? ORDER BY updated_at DESC LIMIT 1").bind(owner, Date.now()).first<{plan_id:string}>();
        if (s && isTier(s.plan_id)) tier = s.plan_id;
    }
    return { tier, ...TIERS[tier] };
}
export async function storageUsage(env: Env, owner: string) {
    const row = await db(env).prepare('SELECT COALESCE((SELECT SUM(a.size) FROM assets a JOIN projects p ON p.id=a.project_id WHERE p.owner=?),0)+COALESCE((SELECT SUM(bytes) FROM resource_reservations WHERE owner=?),0) AS used').bind(owner, owner).first<{used:number}>();
    return row?.used || 0;
}
export async function reserveStorage(env: Env, owner: string, projectId: string, bytes: number) {
    const e = await entitlement(env, owner), key = id();
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new ApiError(400, 'Invalid file size.');
    const r = await db(env).prepare('INSERT INTO resource_reservations(id,owner,project_id,bytes,created_at) SELECT ?,?,?,?,? WHERE COALESCE((SELECT SUM(a.size) FROM assets a JOIN projects p ON p.id=a.project_id WHERE p.owner=?),0)+COALESCE((SELECT SUM(bytes) FROM resource_reservations WHERE owner=?),0)+?<=?').bind(key,owner,projectId,bytes,now(),owner,owner,bytes,e.storageBytes).run();
    if (!r.meta.changes) throw new ApiError(409, 'Your file storage is full. Remove unused files or choose a larger plan.');
    return key;
}
export async function releaseStorage(env: Env, key: string) { await db(env).prepare('DELETE FROM resource_reservations WHERE id=?').bind(key).run(); }
export async function requireStudio(env: Env, owner: string) { const e = await entitlement(env,owner); if (e.tier !== 'studio') throw new ApiError(403,'Shared team controls require the Studio plan.'); return e; }
