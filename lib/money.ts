export const USD_SCALE = 1000000;
export function usd(value: string | number): number { const s = String(value).trim(); if (!/^\d+(\.\d{1,6})?$/.test(s))
    throw Error('Enter a positive USD amount with at most six decimal places.'); const [a, b = ''] = s.split('.'); const n = Number(a) * USD_SCALE + Number(b.padEnd(6, '0')); if (!Number.isSafeInteger(n) || n > 1000000 * USD_SCALE)
    throw Error('Amount is outside the supported range.'); return n; }
export function money(amount: number, digits = 2): string { if (!Number.isSafeInteger(amount))
    throw Error('Invalid money amount.'); const precision = Math.abs(amount) > 0 && Math.abs(amount) < 10000 ? Math.max(digits, 4) : digits; return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: precision, maximumFractionDigits: Math.max(precision, 6) }).format(amount / USD_SCALE); }
export function splitDebit(subscription: number, topup: number, charge: number) { if (![subscription, topup, charge].every(n => Number.isSafeInteger(n) && n >= 0))
    throw Error('Invalid balance.'); if (subscription + topup < charge)
    throw Error('Insufficient wallet balance.'); const fromSubscription = Math.min(subscription, charge); return { subscription: subscription - fromSubscription, topup: topup - (charge - fromSubscription), fromSubscription, fromTopup: charge - fromSubscription }; }
export const PLAN_IDS = ['starter', 'pro', 'studio'] as const;
export type Plan = {
    id: typeof PLAN_IDS[number];
    name: string;
    monthlyMicros: number;
    grantMicros: number;
    active: boolean;
    description: string;
    stripePriceId: string;
};
export const draftPlans: Plan[] = [{ id: 'starter', name: 'Starter', monthlyMicros: 29000000, grantMicros: 30000000, active: false, description: 'A personal production workspace', stripePriceId: '' }, { id: 'pro', name: 'Pro', monthlyMicros: 79000000, grantMicros: 90000000, active: false, description: 'Reusable brands and batch production', stripePriceId: '' }, { id: 'studio', name: 'Studio', monthlyMicros: 199000000, grantMicros: 250000000, active: false, description: 'Shared projects with controlled approvals', stripePriceId: '' }];
export type Tariffs = {
    add: number;
    edit: number;
    connect: number;
    rule: number;
    run: number;
    revision: number;
    approved: boolean;
};
export const testTariffs: Tariffs = { add: 0, edit: 0, connect: 0, rule: 0, run: 120000, revision: 2, approved: false };
export function priceDiff(d: {
    added: string[];
    changed: string[];
    connections: number;
    rules: number;
}, t: Tariffs) { const lines = [{ name: 'New parts', count: d.added.length, unit: t.add }, { name: 'Part edits', count: d.changed.length, unit: t.edit }, { name: 'Connections', count: d.connections, unit: t.connect }, { name: 'Rules', count: d.rules, unit: t.rule }].filter(x => x.count); const total = lines.reduce((a, l) => a + l.count * l.unit, 0); if (!Number.isSafeInteger(total) || total < 0)
    throw Error('Invalid quote.'); return { lines, total }; }
