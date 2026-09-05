import type { Graph } from './world';
export type Project = {
    id: string;
    name: string;
    owner: string;
    role: string;
    revision: number;
    draft_revision: number;
    graph: Graph;
    draft: Graph;
    updated_at: string;
    assets: any[];
    snapshots: any[];
    comments: any[];
    members: any[];
    publications: any[];
    submissions: any[];
    tokens: any[];
    entitlement: any;
    requireReview: boolean;
    reviews: any[];
};
export async function api<T = any>(path: string, options: {
    method?: string;
    body?: unknown;
} = {}): Promise<T> { const r = await fetch(path, { method: options.method || 'GET', headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }, body: options.body === undefined ? undefined : options.body instanceof FormData ? options.body : JSON.stringify(options.body) }); const data = await r.json(); if (!r.ok) {
    const e = Object.assign(new Error(data.error || 'The request failed.'), { status: r.status, details: data });
    throw e;
} return data; }
