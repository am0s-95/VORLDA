import { ApiError, db, now, billingMode, setting, type Env } from './db.ts';
import { type User } from './auth.ts';
import { id } from '../lib/world.ts';
import { draftPlans, PLAN_IDS, type Plan, type Tariffs, testTariffs } from '../lib/money.ts';
import { grantFunds } from './wallet.ts';
async function stripe(env: Env, path: string, params?: URLSearchParams, key?: string) { if (!env.STRIPE_SECRET_KEY)
    throw new ApiError(409, 'A payment provider has not been connected.'); const response = await fetch('https://api.stripe.com/v1/' + path, { method: params ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, body: params, redirect: 'error' }); const data = await response.json() as any; if (!response.ok)
    throw new ApiError(502, 'The payment provider could not complete this request.'); return data; }
function paymentReady(env: Env) { if (billingMode(env) !== 'live' || !env.STRIPE_SECRET_KEY?.startsWith('sk_live_') || !env.STRIPE_WEBHOOK_SECRET)
    throw new ApiError(409, 'Real payments are not enabled. Test balance is not money.'); if (!env.APP_ORIGIN || !/^https:\/\//.test(env.APP_ORIGIN))
    throw new ApiError(409, 'The payment return address has not been configured.'); }
export async function checkout(env: Env, user: User, data: Record<string, any>) {
    paymentReady(env);
    if (user.token)
        throw new ApiError(403, 'Checkout requires an interactive account.');
    const tariff = await setting<Tariffs>(env, 'tariffs', testTariffs);
    if (!tariff.approved)
        throw new ApiError(409, 'The owner must approve usage prices before accepting payments.');
    const plans = await setting<Plan[]>(env, 'plans-v2', draftPlans), kind = data.kind === 'subscription' ? 'subscription' : 'topup', nonce = String(data.requestId || '');
    if (!/^[-a-zA-Z0-9_]{16,100}$/.test(nonce))
        throw new ApiError(400, 'A checkout request identifier is required.');
    const checkoutId = `${user.id}:${nonce}`, prior = await db(env).prepare('SELECT * FROM checkouts WHERE id=?').bind(checkoutId).first<any>();
    if (prior?.url)
        return { url: prior.url };
    let cents = 0, grant = 0, plan: Plan | undefined;
    if (kind === 'subscription') {
        plan = plans.find(p => p.id === data.planId && p.active);
        if (!plan || !plan.stripePriceId || !PLAN_IDS.includes(plan.id))
            throw new ApiError(409, 'This subscription has not been priced and enabled yet.');
        const pending = await db(env).prepare("SELECT url FROM checkouts WHERE owner=? AND mode='live' AND kind='subscription' AND status IN ('pending','open') AND id<>?").bind(user.id, checkoutId).first<any>();
        if (pending)
            throw new ApiError(409, 'An existing subscription checkout is still open. Complete it or let it expire before starting another.');
        const active = await db(env).prepare("SELECT id FROM subscriptions WHERE owner=? AND mode='live' AND status IN ('active','trialing','past_due','unpaid')").bind(user.id).first();
        if (active)
            throw new ApiError(409, 'Manage your existing subscription before starting another.');
        cents = Math.round(plan.monthlyMicros / 10000);
        grant = plan.grantMicros;
        const price = await stripe(env, `prices/${encodeURIComponent(plan.stripePriceId)}`);
        if (!price.active || price.currency !== 'usd' || price.unit_amount !== cents || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1)
            throw new ApiError(409, 'The provider price does not match this approved monthly plan.');
    }
    else {
        cents = Number(data.amountCents);
        if (!Number.isSafeInteger(cents) || cents < 500 || cents > 100000)
            throw new ApiError(400, 'Top up between $5 and $1,000, in cents.');
        grant = cents * 10000;
    }
    await db(env).prepare('INSERT INTO checkouts(id,owner,mode,kind,plan_id,amount_cents,grant_micros,status,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(checkoutId, user.id, 'live', kind, plan?.id || null, cents, grant, 'pending', now()).run();
    const saved = await db(env).prepare('SELECT * FROM checkouts WHERE id=?').bind(checkoutId).first<any>();
    if (saved.kind !== kind || saved.amount_cents !== cents || saved.plan_id !== (plan?.id || null))
        throw new ApiError(409, 'This checkout identifier already has different details.');
    const p = new URLSearchParams({ mode: kind === 'subscription' ? 'subscription' : 'payment', success_url: new URL('/?payment=success', env.APP_ORIGIN).href, cancel_url: new URL('/?payment=cancelled', env.APP_ORIGIN).href, client_reference_id: checkoutId, 'metadata[checkout_id]': checkoutId, 'line_items[0][quantity]': '1', customer_email: user.email });
    if (plan) {
        p.set('line_items[0][price]', plan.stripePriceId);
        p.set('subscription_data[metadata][checkout_id]', checkoutId);
    }
    else {
        p.set('line_items[0][price_data][currency]', 'usd');
        p.set('line_items[0][price_data][unit_amount]', String(cents));
        p.set('line_items[0][price_data][product_data][name]', 'VORLDA wallet balance');
        p.set('payment_intent_data[metadata][checkout_id]', checkoutId);
    }
    const session = await stripe(env, 'checkout/sessions', p, checkoutId);
    await db(env).prepare('UPDATE checkouts SET provider_id=?,url=?,status=? WHERE id=?').bind(session.id, session.url, 'open', checkoutId).run();
    return { url: session.url };
}
export async function portal(env: Env, user: User) { paymentReady(env); if (user.token)
    throw new ApiError(403, 'Sign in to manage billing.'); const s = await db(env).prepare("SELECT customer_id FROM subscriptions WHERE owner=? AND mode='live' ORDER BY updated_at DESC LIMIT 1").bind(user.id).first<any>(); if (!s)
    throw new ApiError(404, 'No subscription is connected to this account.'); const p = await stripe(env, 'billing_portal/sessions', new URLSearchParams({ customer: s.customer_id, return_url: new URL('/?billing=1', env.APP_ORIGIN).href })); return { url: p.url }; }
export async function verifySignature(raw: string, header: string, secret: string, clock = Date.now()) {
    const parts = header.split(',').map(p => p.split('=')), t = parts.find(p => p[0] === 't')?.[1], sigs = parts.filter(p => p[0] === 'v1').map(p => p[1]);
    if (!t || !/^\d+$/.test(t) || Math.abs(clock / 1000 - Number(t)) > 300)
        throw new ApiError(400, 'Invalid webhook timestamp.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    let verified = false;
    for (const s of sigs) {
        if (!/^[0-9a-f]{64}$/i.test(s))
            continue;
        const bytes = new Uint8Array(s.match(/../g)!.map(x => parseInt(x, 16)));
        if (await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(t + '.' + raw)))
            verified = true;
    }
    if (!verified)
        throw new ApiError(400, 'Invalid webhook signature.');
}
export async function webhook(request: Request, env: Env) {
    if (!env.STRIPE_WEBHOOK_SECRET)
        throw new ApiError(503, 'Webhooks are not configured.');
    const raw = await request.text();
    if (raw.length > 1000000)
        throw new ApiError(413, 'Webhook too large.');
    await verifySignature(raw, request.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET);
    let event: any;
    try {
        event = JSON.parse(raw);
    }
    catch {
        throw new ApiError(400, 'Invalid webhook.');
    }
    if (!event.id || !event.type)
        throw new ApiError(400, 'Invalid webhook event.');
    if (!event.livemode || billingMode(env) !== 'live')
        return { received: true, ignored: 'not-live' };
    const done = await db(env).prepare('SELECT id FROM payment_events WHERE id=?').bind(event.id).first();
    if (done)
        return { received: true, replayed: true };
    const obj = event.data?.object;
    if (!obj)
        throw new ApiError(400, 'Missing event object.');
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
        const c = await db(env).prepare('SELECT * FROM checkouts WHERE id=? AND mode=?').bind(obj.metadata?.checkout_id || obj.client_reference_id || '', 'live').first<any>();
        if (c && c.kind === 'topup' && obj.mode === 'payment' && obj.payment_status === 'paid') {
            if (obj.currency !== 'usd' || obj.amount_total !== c.amount_cents || c.provider_id && c.provider_id !== obj.id)
                throw new ApiError(400, 'Checkout amount does not match the approved purchase.');
            await grantFunds(env, c.owner, 'live', c.grant_micros, 'topup', `stripe:checkout:${obj.id}`, 'Wallet top-up');
            await db(env).prepare('UPDATE checkouts SET status=?,provider_id=? WHERE id=?').bind('paid', obj.id, c.id).run();
        }
    }
    if (event.type === 'invoice.paid') {
        const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : obj.parent?.subscription_details?.subscription;
        if (subscriptionId && obj.status === 'paid' && obj.currency === 'usd' && obj.amount_paid > 0) {
            const s = await stripe(env, `subscriptions/${encodeURIComponent(subscriptionId)}`);
            const c = await db(env).prepare("SELECT * FROM checkouts WHERE id=? AND kind='subscription' AND mode='live'").bind(s.metadata?.checkout_id || '').first<any>();
            if (c) {
                if (!['subscription_create', 'subscription_cycle'].includes(obj.billing_reason)) { /* Proration invoices do not buy a second monthly grant. */ }
                else {
                    const existing = await db(env).prepare('SELECT * FROM subscriptions WHERE id=?').bind(s.id).first<any>();
                    const grant = existing?.grant_micros ?? c.grant_micros;
                    await grantFunds(env, c.owner, 'live', grant, 'subscription', `stripe:invoice:${obj.id}`, 'Monthly subscription balance');
                }
                await db(env).prepare('INSERT INTO subscriptions(id,owner,mode,plan_id,status,customer_id,grant_micros,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at').bind(s.id, c.owner, 'live', c.plan_id, s.status, typeof s.customer === 'string' ? s.customer : s.customer.id, c.grant_micros, now()).run();
                const period = s.current_period_end || s.items?.data?.[0]?.current_period_end || 0;
                if (['subscription_create','subscription_cycle'].includes(obj.billing_reason)) await db(env).prepare('UPDATE subscriptions SET paid_until=MAX(paid_until,?) WHERE id=?').bind(period * 1000, s.id).run();
                await db(env).prepare('UPDATE checkouts SET status=? WHERE id=?').bind('paid', c.id).run();
            }
        }
    }
    if (['customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) { // Fetch current state so an older delivered event cannot resurrect a cancelled subscription.
        const current = await stripe(env, `subscriptions/${encodeURIComponent(obj.id)}`);
        await db(env).prepare('UPDATE subscriptions SET status=?,updated_at=? WHERE id=?').bind(current.status, now(), obj.id).run();
    }
    if (event.type === 'checkout.session.expired') {
        await db(env).prepare("UPDATE checkouts SET status='expired' WHERE provider_id=? AND status IN ('pending','open')").bind(obj.id).run();
    }
    if (['charge.dispute.created', 'charge.refunded'].includes(event.type)) {
        await db(env).prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind('payment_review:' + obj.id, JSON.stringify({ type: event.type, id: obj.id, createdAt: now() }), now()).run();
    }
    await db(env).prepare('INSERT INTO payment_events(id,type,processed_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(event.id, event.type, now()).run();
    return { received: true };
}
