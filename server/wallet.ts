import { ApiError, db, now, billingMode, setting, type Env } from './db.ts';
import { projectAccess, type User } from './auth.ts';
import { id, validateGraph, diffGraph } from '../lib/world.ts';
import { draftPlans, testTariffs, priceDiff, type Tariffs, type Plan } from '../lib/money.ts';
export async function getWallet(env: Env, user: User) { const mode = billingMode(env); const wallet = await db(env).prepare('SELECT subscription,topup,mode FROM wallets WHERE owner=? AND mode=?').bind(user.id, mode).first<any>(); const ledger = await db(env).prepare('SELECT id,kind,amount,description,project_id,operation_id,created_at FROM ledger WHERE owner=? AND mode=? ORDER BY created_at DESC LIMIT 100').bind(user.id, mode).all(); const subs = await db(env).prepare('SELECT plan_id,status,id FROM subscriptions WHERE owner=? AND mode=? ORDER BY updated_at DESC').bind(user.id, mode).all(); return { ...(wallet || { subscription: 0, topup: 0, mode }), total: (wallet?.subscription || 0) + (wallet?.topup || 0), ledger: ledger.results, subscriptions: subs.results, plans: await setting<Plan[]>(env, 'plans', draftPlans), tariffs: await setting<Tariffs>(env, 'tariffs', testTariffs), paymentsReady: mode === 'live' && !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET }; }
export async function quoteGraph(env: Env, user: User, projectId: string, graph: unknown, revision: number) {
    const p = await projectAccess(env, user, projectId, true);
    if (p.revision !== revision)
        throw new ApiError(409, 'This project changed in another session. Reload it before applying edits.');
    const next = validateGraph(graph), previous = validateGraph(JSON.parse(p.graph));
    if (p.role !== 'owner')
        for (const part of previous.pieces.filter(x => x.locked)) {
            if (JSON.stringify(next.pieces.find(x => x.id === part.id)) !== JSON.stringify(part))
                throw new ApiError(403, `The canonical part “${part.name}” is locked. Ask the owner or create a variant.`);
        }
    const tariffs = await setting<Tariffs>(env, 'tariffs', testTariffs), diff = diffGraph(previous, next), price = priceDiff(diff, tariffs), mode = billingMode(env);
    if (mode === 'live' && !tariffs.approved)
        throw new ApiError(409, 'Usage prices must be approved before live execution.');
    const amount = price.total, quoteId = id(), details = { ...price, diff, mode };
    await db(env).prepare('INSERT INTO quotes(id,owner,project_id,revision,draft_revision,mode,kind,payload,amount,details,pricing_revision,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(quoteId, user.id, projectId, revision, p.draft_revision, mode, 'assembly', JSON.stringify(next), amount, JSON.stringify(details), tariffs.revision, Date.now() + 300000, now()).run();
    return { id: quoteId, amount, details, expiresAt: Date.now() + 300000, revision };
}
export async function applyQuote(env: Env, user: User, quoteId: string, requestId: string) {
    const q = await db(env).prepare('SELECT * FROM quotes WHERE id=? AND owner=?').bind(quoteId, user.id).first<any>();
    if (!q)
        throw new ApiError(404, 'Quote not found.');
    const p = await projectAccess(env, user, q.project_id, true);
    if (user.token && (!user.token.scopes.includes('execute') || q.amount > user.token.maxCharge))
        throw new ApiError(403, 'This integration is not approved to execute this charge.');
    const existing = await db(env).prepare('SELECT * FROM operations WHERE quote_id=? AND owner=?').bind(quoteId, user.id).first<any>();
    if (existing)
        return { operation: existing, replayed: true, projectId: q.project_id };
    if (q.used || q.expires_at < Date.now())
        throw new ApiError(409, 'This quote expired. Review a fresh quote.');
    if (q.mode !== billingMode(env))
        throw new ApiError(409, 'Billing mode changed. Request a new quote.');
    if (p.revision !== q.revision)
        throw new ApiError(409, 'This quote is for an older project revision.');
    const opId = id(), nonce = id(), time = now(), isAssembly = q.kind === 'assembly';
    const condition = 'EXISTS(SELECT 1 FROM operations WHERE id=? AND nonce=?)';
    const statements = [
        db(env).prepare(`INSERT INTO operations(id,owner,project_id,quote_id,nonce,mode,kind,amount,from_subscription,from_topup,status,created_at,completed_at) SELECT ?,?,?,?,?,?,?,?,MIN(w.subscription,?),?-MIN(w.subscription,?),?,?,? FROM wallets w JOIN projects p ON p.id=? JOIN quotes q ON q.id=? WHERE w.owner=? AND w.mode=? AND w.subscription+w.topup>=? AND p.revision=? AND p.draft_revision=q.draft_revision AND q.used=0 AND q.expires_at>? ON CONFLICT DO NOTHING`).bind(opId, user.id, q.project_id, quoteId, nonce, q.mode, q.kind, q.amount, q.amount, q.amount, q.amount, isAssembly ? 'completed' : 'reserved', time, isAssembly ? time : null, q.project_id, quoteId, user.id, q.mode, q.amount, q.revision, Date.now()),
        db(env).prepare(`UPDATE wallets SET topup=topup-(SELECT from_topup FROM operations WHERE id=?),subscription=subscription-(SELECT from_subscription FROM operations WHERE id=?),updated_at=? WHERE owner=? AND mode=? AND ${condition}`).bind(opId, opId, time, user.id, q.mode, opId, nonce),
        db(env).prepare(`INSERT INTO ledger(id,owner,mode,project_id,operation_id,event_key,kind,amount,description,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${condition}`).bind(id(), user.id, q.mode, q.project_id, opId, `operation:${opId}`, 'usage', -q.amount, isAssembly ? 'Apply assembly changes' : 'Run provider operation', time, opId, nonce),
        db(env).prepare(`UPDATE quotes SET used=1 WHERE id=? AND ${condition}`).bind(quoteId, opId, nonce)
    ];
    if (isAssembly)
        statements.push(db(env).prepare(`UPDATE projects SET graph=?,draft=?,revision=revision+1,draft_revision=draft_revision+1,updated_at=? WHERE id=? AND revision=? AND ${condition}`).bind(q.payload, q.payload, time, q.project_id, q.revision, opId, nonce), db(env).prepare(`INSERT INTO snapshots(id,project_id,graph,label,revision,actor,created_at) SELECT ?,id,graph,?,revision,?,? FROM projects WHERE id=? AND ${condition}`).bind(id(), 'Applied changes', user.id, time, q.project_id, opId, nonce));
    const result = await db(env).batch(statements);
    if (!result[0].meta.changes) {
        const winner = await db(env).prepare('SELECT * FROM operations WHERE quote_id=?').bind(quoteId).first<any>();
        if (winner)
            return { operation: winner, replayed: true, projectId: q.project_id };
        throw new ApiError(409, 'The balance or project changed. Reload your wallet and review a new quote.');
    }
    return { operation: await db(env).prepare('SELECT * FROM operations WHERE id=?').bind(opId).first<any>(), replayed: false, projectId: q.project_id, requestId };
}
export async function refundOperation(env: Env, operationId: string, reason: string) {
    const op = await db(env).prepare('SELECT * FROM operations WHERE id=?').bind(operationId).first<any>();
    if (!op || op.status === 'refunded' || op.status === 'completed')
        return;
    const time = now(), key = `refund:${operationId}`, nonce = id();
    await db(env).batch([
        db(env).prepare('INSERT INTO ledger(id,owner,mode,project_id,operation_id,event_key,kind,amount,description,created_at) SELECT ?,owner,mode,project_id,id,?,?,amount,?,? FROM operations WHERE id=? AND status IN (?,?) ON CONFLICT(event_key) DO NOTHING').bind(nonce, key, 'refund', reason, time, operationId, 'reserved', 'running'),
        db(env).prepare('UPDATE wallets SET subscription=subscription+?,topup=topup+?,updated_at=? WHERE owner=? AND mode=? AND EXISTS(SELECT 1 FROM ledger WHERE id=?)').bind(op.from_subscription, op.from_topup, time, op.owner, op.mode, nonce),
        db(env).prepare('UPDATE operations SET status=?,result=?,completed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM ledger WHERE id=?)').bind('refunded', JSON.stringify({ reason }), time, operationId, nonce)
    ]);
}
export async function grantFunds(env: Env, owner: string, mode: string, amount: number, bucket: 'subscription' | 'topup', eventKey: string, description: string) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || !['test', 'live'].includes(mode))
        throw new ApiError(400, 'Invalid balance grant.');
    const nonce = id(), time = now();
    await db(env).batch([
        db(env).prepare('INSERT INTO wallets(id,owner,mode,subscription,topup,updated_at) VALUES(?,?,?,0,0,?) ON CONFLICT(owner,mode) DO NOTHING').bind(`${owner}:${mode}`, owner, mode, time),
        db(env).prepare('INSERT INTO ledger(id,owner,mode,event_key,kind,amount,description,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING').bind(nonce, owner, mode, eventKey, bucket === 'subscription' ? 'subscription' : 'topup', amount, description, time),
        db(env).prepare(`UPDATE wallets SET ${bucket}=${bucket}+?,updated_at=? WHERE owner=? AND mode=? AND EXISTS(SELECT 1 FROM ledger WHERE id=?)`).bind(amount, time, owner, mode, nonce)
    ]);
}
