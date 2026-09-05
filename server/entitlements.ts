import { ApiError, db, now, billingMode, type Env } from './db.ts';
import { TIERS, isTier, type Tier } from '../lib/plans.ts';
import { indexStoredObjects,storageBreakdown,storageTotalSQL } from './storage-accounting.ts';
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
    return (await storageBreakdown(env,owner)).total;
}
export async function reserveStorage(env: Env, owner: string, projectId: string, bytes: number) {
    const e = await entitlement(env, owner), key = id();
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new ApiError(400, 'Invalid file size.');
    await indexStoredObjects(env,owner);
    const r = await db(env).prepare(`INSERT INTO resource_reservations(id,owner,project_id,bytes,created_at) SELECT ?,?,?,?,? WHERE ${storageTotalSQL}+?<=?`).bind(key,owner,projectId,bytes,now(),owner,owner,owner,owner,bytes,e.storageBytes).run();
    if (!r.meta.changes) throw new ApiError(409, 'Workspace storage is full, including retained versions. Existing work remains available to read and export.');
    return key;
}
export async function releaseStorage(env: Env, key: string) { await db(env).prepare('DELETE FROM resource_reservations WHERE id=?').bind(key).run(); }
export async function requireStudio(env: Env, owner: string) { const e = await entitlement(env,owner); if (e.tier !== 'studio') throw new ApiError(403,'Shared team controls require the Studio plan.'); return e; }
