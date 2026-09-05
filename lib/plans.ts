export type Tier = 'wallet' | 'starter' | 'pro' | 'studio';
export const GB = 1000 ** 3;
export const TIERS = {
    wallet: { name: 'Wallet', storageBytes: GB, concurrency: 1, presets: 0, brands: 0, members: 0, batch: 1 },
    starter: { name: 'Starter', storageBytes: 20 * GB, concurrency: 2, presets: 30, brands: 0, members: 0, batch: 1 },
    pro: { name: 'Pro', storageBytes: 100 * GB, concurrency: 5, presets: 150, brands: 10, members: 0, batch: 20 },
    studio: { name: 'Studio', storageBytes: 500 * GB, concurrency: 10, presets: 500, brands: 50, members: 4, batch: 50 },
} as const;
export function isTier(v: unknown): v is Tier { return typeof v === 'string' && Object.hasOwn(TIERS, v); }
export const tierFeatures = (tier: Exclude<Tier, 'wallet'>, ar: boolean) => {
    const p = TIERS[tier];
    return [ar ? `${p.storageBytes / GB} GB للملفات` : `${p.storageBytes / GB} GB file storage`,
        ar ? `${p.concurrency} عمليات متزامنة` : `${p.concurrency} concurrent operations`,
        ar ? `${p.presets} إعداد إنتاج محفوظ` : `${p.presets} saved production presets`,
        ...(p.brands ? [ar ? `${p.brands} هويات للمشاريع` : `${p.brands} brand kits`, ar ? 'تجهيز دفعات من الأعمال' : 'Batch production'] : []),
        ...(p.members ? [ar ? 'خمسة أعضاء بمن فيهم المالك' : 'Five members including the owner', ar ? 'صلاحيات ومراجعات قبل النشر' : 'Roles and publication approvals'] : [])];
};
