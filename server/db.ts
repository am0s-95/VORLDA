export type D1Result<T = Record<string, unknown>> = {
    results: T[];
    success: boolean;
    meta: {
        changes: number;
    };
};
export interface Statement {
    bind(...v: unknown[]): Statement;
    first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    run(): Promise<D1Result>;
}
export interface Database {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<D1Result[]>;
}
export interface Bucket {
    put(key: string, value: ReadableStream | ArrayBuffer | Uint8Array | string, options?: unknown): Promise<unknown>;
    get(key: string, options?: unknown): Promise<{
        body: ReadableStream;
        size: number;
        httpMetadata?: {
            contentType?: string;
        };
    } | null>;
    delete(key: string): Promise<void>;
}
export type Env = {
    DB: Database;
    BUCKET: Bucket;
    ASSETS: {
        fetch(request: Request): Promise<Response>;
    };
    APP_OWNER_EMAIL?: string;
    BILLING_MODE?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    APP_ORIGIN?: string;
    PROVIDER_ALLOWED_HOSTS?: string;
    [key: string]: unknown;
};
export type Context = {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
};
export function db(env: Env) { if (!env.DB)
    throw new ApiError(503, 'Project storage is temporarily unavailable.'); return env.DB; }
export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
}
export const now = () => new Date().toISOString();
export const billingMode = (env: Env): 'live' | 'test' => env.BILLING_MODE === 'live' ? 'live' : 'test';
export async function setting<T>(env: Env, key: string, fallback: T): Promise<T> { const row = await db(env).prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{
    value: string;
}>(); return row ? JSON.parse(row.value) : fallback; }
export async function setSetting(env: Env, key: string, value: unknown) { await db(env).prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key, JSON.stringify(value), now()).run(); }
export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function body(request: Request, max = 4200000): Promise<Record<string, any>> { const text = await request.text(); if (text.length > max)
    throw new ApiError(413, 'This request is too large.'); try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v))
        throw Error();
    return v;
}
catch {
    throw new ApiError(400, 'Invalid request data.');
} }
export function identifier(v: unknown): string { if (typeof v !== 'string' || !/^[-a-zA-Z0-9_]{1,100}$/.test(v))
    throw new ApiError(400, 'Invalid identifier.'); return v; }
export function cleanName(v: unknown, max = 200) { if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw new ApiError(400, 'Enter a valid name.'); return v.trim(); }
