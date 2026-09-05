import { ApiError, type Env } from './db.ts';

const PREFIX = 'vorlda-r2-json:v1:';
export const INLINE_JSON_BYTES = 128_000;
const MAX_JSON_BYTES = 8_000_000;
const encoder = new TextEncoder();
const hash = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))).map(x=>x.toString(16).padStart(2,'0')).join('');
function scopePath(scope: string) {
    if (!/^(projects|resources)\/[a-zA-Z0-9_-]{1,100}$/.test(scope)) throw new ApiError(500,'Invalid storage scope.');
    return `payloads/v1/${scope}/`;
}
// Immutable object first, then a small pointer in the existing atomic D1 write.
// Old inline JSON remains readable. Never delete on a failed/ambiguous CAS:
// snapshots, publications or a committed transaction can still reference it.
export async function storeJson(env: Env, scope: string, value: unknown, force = false): Promise<string> {
    const prefix = scopePath(scope), raw = JSON.stringify(value), bytes = encoder.encode(raw);
    if (bytes.byteLength > MAX_JSON_BYTES) throw new ApiError(413,'This project payload exceeds the storage budget.');
    if (!force && bytes.byteLength <= INLINE_JSON_BYTES) return raw;
    const checksum = await hash(bytes), key = prefix+crypto.randomUUID()+'.json';
    try { await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/json'}}); }
    catch { throw new ApiError(503,'Project storage is unavailable. Your current saved version was not replaced.'); }
    return PREFIX+JSON.stringify({key,bytes:bytes.byteLength,sha256:checksum});
}
export async function loadJson<T = any>(env: Env, scope: string, stored: string): Promise<T> {
    const prefix = scopePath(scope);
    if (!stored.startsWith(PREFIX)) {
        try { return JSON.parse(stored); } catch { throw new ApiError(503,'The saved project payload is invalid.'); }
    }
    let ref: { key: string; bytes: number; sha256: string };
    try { ref = JSON.parse(stored.slice(PREFIX.length)); } catch { throw new ApiError(503,'The saved project reference is invalid.'); }
    if (!ref || !new RegExp('^'+prefix+'[a-f0-9-]{36}\\.json$').test(ref.key) || !Number.isSafeInteger(ref.bytes) || ref.bytes<0 || ref.bytes>MAX_JSON_BYTES || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw new ApiError(503,'The saved project reference is invalid.');
    let file;
    try { file = await env.BUCKET.get(ref.key); } catch { throw new ApiError(503,'Project storage is temporarily unavailable.'); }
    if (!file || file.size !== ref.bytes) throw new ApiError(503,'A saved project object is unavailable. No empty replacement was created.');
    const reader=file.body.getReader(), chunks:Uint8Array[]=[];let size=0;
    for (;;) { const part=await reader.read(); if(part.done)break;size+=part.value.byteLength;if(size>ref.bytes){await reader.cancel();throw new ApiError(503,'The saved project object has an invalid size.');}chunks.push(part.value); }
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
    if(size!==ref.bytes || await hash(bytes)!==ref.sha256) throw new ApiError(503,'The saved project object failed its integrity check.');
    try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { throw new ApiError(503,'The saved project object is invalid.'); }
}
export async function copyJson(env: Env, scope: string, stored: string): Promise<string> {
    const value=await loadJson(env,scope,stored);
    return stored.startsWith(PREFIX) ? stored : storeJson(env,scope,value);
}
