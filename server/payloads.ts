import { ApiError, db, now, type Env } from './db.ts';

import { reserveStorage,releaseStorage } from './entitlements.ts';
import { PAYLOAD_PREFIX as PREFIX } from './storage-accounting.ts';
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
export async function storeJson(env: Env, scope: string, value: unknown, _force = false, newOwner?: string): Promise<string> {
    const prefix = scopePath(scope), raw = JSON.stringify(value), bytes = encoder.encode(raw);
    if (bytes.byteLength > MAX_JSON_BYTES) throw new ApiError(413,'This project payload exceeds the storage budget.');
    const [kind,scopeId]=scope.split('/');
    const existingOwner=await db(env).prepare(`SELECT owner FROM ${kind==='projects'?'projects':'studio_resources'} WHERE id=?`).bind(scopeId).first<{owner:string}>();
    const owner=existingOwner?.owner||newOwner;
    if(!owner)throw new ApiError(500,'A storage owner is required.');
    const checksum=await hash(bytes);
    const existing=await db(env).prepare('SELECT object_key,bytes FROM payload_objects WHERE owner=? AND scope=? AND sha256=? LIMIT 1').bind(owner,scope,checksum).first<any>();
    if(existing){const reference=PREFIX+JSON.stringify({key:existing.object_key,bytes:existing.bytes,sha256:checksum});try{await loadJson(env,scope,reference);return reference;}catch{/* Repair by writing a fresh object; retain historical accounting for review. */}}
    const key=prefix+crypto.randomUUID()+'.json',reservation=await reserveStorage(env,owner,scopeId,bytes.byteLength);
    try { await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/json'}}); }
    catch {
        // A rejected PUT may still have reached storage. Delete our unique unreferenced key
        // before releasing its quota. If deletion fails, keep the reservation for review.
        try { await env.BUCKET.delete(key);await releaseStorage(env,reservation); } catch {}
        throw new ApiError(503,'Project storage is unavailable. Your current saved version was not replaced.');
    }
    await db(env).batch([
        db(env).prepare('INSERT INTO payload_objects(object_key,owner,scope,bytes,sha256,created_at) VALUES(?,?,?,?,?,?)').bind(key,owner,scope,bytes.byteLength,checksum,now()),
        db(env).prepare('DELETE FROM resource_reservations WHERE id=?').bind(reservation)
    ]);
    // All new JSON uses immutable objects, including small drafts. A failed CAS keeps
    // its object accounted; snapshots and publications can share it without double charging.

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

// Only for a creation attempt whose transaction has returned a definite non-commit.
// Never use this for an ambiguous database response or for an existing project CAS.
export async function discardUncommittedProject(env:Env,owner:string,projectId:string){
    if(await db(env).prepare('SELECT id FROM projects WHERE id=?').bind(projectId).first())return;
    const objects=await db(env).prepare('SELECT object_key FROM payload_objects WHERE owner=? AND scope=?').bind(owner,'projects/'+projectId).all<{object_key:string}>();
    for(const object of objects.results){await env.BUCKET.delete(object.object_key);await db(env).prepare('DELETE FROM payload_objects WHERE object_key=? AND owner=?').bind(object.object_key,owner).run();}
}
