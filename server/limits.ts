import { ApiError, db, type Env } from './db.ts';

// A bounded number of fixed-window counters per identity, shared by its API tokens.
export async function rateLimit(env: Env, owner: string, bucket: 'read'|'write'|'upload'|'purchase'|'claim', limit?: number) {
    const maximum = limit ?? ({read: 600, write: 180, upload: 12, purchase: 20, claim: 10}[bucket]);
    const time = Date.now(), window = 60_000;
    const result = await db(env).prepare(`INSERT INTO request_limits(owner,bucket,started_at,requests) VALUES(?,?,?,1)
        ON CONFLICT(owner,bucket) DO UPDATE SET
        requests=CASE WHEN started_at<=? THEN 1 ELSE requests+1 END,
        started_at=CASE WHEN started_at<=? THEN excluded.started_at ELSE started_at END
        WHERE started_at<=? OR requests<?`).bind(owner,bucket,time,time-window,time-window,time-window,maximum).run();
    if (!result.meta.changes) throw new ApiError(429,'Too many requests. Please wait a minute; your saved work is safe.');
}

export async function boundedFormData(request: Request, maxBytes: number) {
    const reader=request.body?.getReader(); if(!reader)throw new ApiError(400,'Choose a file.');
    const chunks:Uint8Array[]=[];let bytes=0;
    for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
        if(bytes>maxBytes){await reader.cancel();throw new ApiError(413,'The upload limit is 25 MB.');}chunks.push(part.value);}
    // Bound the stream itself, including requests without Content-Length.
    const blob=new Blob(chunks as BlobPart[]);
    return new Response(blob,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
}
