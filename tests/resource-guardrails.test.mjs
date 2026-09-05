import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,client,otherHeaders} from './support.mjs';
import {storageUsage,reserveStorage,releaseStorage} from '../server/entitlements.ts';
import {storageBreakdown,indexStoredObjects} from '../server/storage-accounting.ts';
import {storeJson,loadJson} from '../server/payloads.ts';
import {boundedFormData,rateLimit} from '../server/limits.ts';
import {emptyGraph,makePiece} from '../lib/world.ts';
import {digest} from '../server/auth.ts';

async function setup(){const f=fixture();f.p=(await client(f,'/api/projects','POST',{name:'Storage',kind:'blank'})).body;return f;}
test('small drafts and empty applied graphs count once; identical saves reuse healthy objects',async()=>{
 const f=await setup();try{const stored=f.sqlite.prepare('SELECT graph,draft FROM projects').get();assert.equal(stored.graph,stored.draft);assert.equal(f.files.size,1);const bytes=new TextEncoder().encode(JSON.stringify(emptyGraph())).length;assert.equal(await storageUsage(f.env,'owner-id'),bytes);const repeated=await storeJson(f.env,'projects/'+f.p.id,emptyGraph());assert.equal(repeated,stored.graph);assert.equal(f.files.size,1);assert.equal(await storageUsage(f.env,'owner-id'),bytes);
 }finally{f.close();}
});
test('dedup repairs a missing object without falsely reporting an unreadable successful save',async()=>{
 const f=await setup();try{const scope='projects/'+f.p.id,old=f.sqlite.prepare('SELECT draft FROM projects').get().draft;f.files.clear();const fresh=await storeJson(f.env,scope,emptyGraph());assert.notEqual(fresh,old);assert.deepEqual(await loadJson(f.env,scope,fresh),emptyGraph());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payload_objects').get().n,2);
 }finally{f.close();}
});
test('quota admission includes retained payloads and serializes concurrent payload/upload reservations',async()=>{
 const f=await setup();try{const base=await storageUsage(f.env,'owner-id'),occupied=await reserveStorage(f.env,'owner-id',f.p.id,1_000_000_000-base-100);const r=await Promise.allSettled([reserveStorage(f.env,'owner-id',f.p.id,80),storeJson(f.env,'projects/'+f.p.id,{text:'x'.repeat(70)})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.ok(await storageUsage(f.env,'owner-id')<=1_000_000_000);await releaseStorage(f.env,occupied);
 }finally{f.close();}
});
test('a nonempty project cannot smuggle an unreserved empty applied graph past its quota',async()=>{
 const f=await setup();try{const g=emptyGraph();g.pieces.push(makePiece('page'));const bytes=new TextEncoder().encode(JSON.stringify(g)).length,base=await storageUsage(f.env,'owner-id');await reserveStorage(f.env,'owner-id',f.p.id,1_000_000_000-base-bytes);const r=await client(f,'/api/projects','POST',{graph:g});assert.equal(r.status,409);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM projects').get().n,1);assert.ok(await storageUsage(f.env,'owner-id')<=1_000_000_000);
 }finally{f.close();}
});
test('legacy references across archived projects, quotes, snapshots and publications index once before direct admission',async()=>{
 const f=await setup();try{const scope='projects/'+f.p.id,ref=await storeJson(f.env,scope,{legacy:'large retained object'});f.sqlite.prepare('UPDATE projects SET graph=?,draft=?,archived=1 WHERE id=?').run(ref,ref,f.p.id);f.sqlite.prepare('INSERT INTO snapshots(id,project_id,graph,label,revision,actor,created_at) VALUES(?,?,?,?,?,?,?)').run('snap',f.p.id,ref,'Old',1,'owner-id','2026');f.sqlite.prepare('INSERT INTO publications(id,project_id,owner,graph,revision,name,enabled,created_at) VALUES(?,?,?,?,?,?,?,?)').run('pub',f.p.id,'owner-id',ref,1,'Old',0,'2026');
 f.sqlite.exec('DELETE FROM payload_objects; DELETE FROM storage_indexes;');await Promise.all([indexStoredObjects(f.env,'owner-id'),indexStoredObjects(f.env,'owner-id')]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payload_objects').get().n,1);const indexed=await storageUsage(f.env,'owner-id');assert.equal(indexed,new TextEncoder().encode(JSON.stringify({legacy:'large retained object'})).length);await reserveStorage(f.env,'owner-id',f.p.id,1_000_000_000-indexed);await assert.rejects(()=>reserveStorage(f.env,'owner-id',f.p.id,1),/full/);
 }finally{f.close();}
});
test('invalid legacy metadata fails admission explicitly and never contaminates the object index',async()=>{
 const f=await setup();try{for(const bad of ['invalid-json',JSON.stringify({key:'payloads/v1/projects/foreign/00000000-0000-0000-0000-000000000000.json',bytes:1,sha256:'a'.repeat(64)})]){f.sqlite.prepare('UPDATE projects SET draft=?').run('vorlda-r2-json:v1:'+bad);f.sqlite.exec('DELETE FROM storage_indexes; DELETE FROM payload_objects;');await assert.rejects(()=>indexStoredObjects(f.env,'owner-id'),e=>e.status===503);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payload_objects').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM storage_indexes').get().n,0);}}
 finally{f.close();}
});
test('editor payloads consume owner storage; over-quota retained work is still readable and exportable',async()=>{
 const f=await setup();try{await client(f,'/api/wallet/preview-plan','POST',{planId:'studio'});f.sqlite.prepare('INSERT INTO members(id,project_id,email,role) VALUES(?,?,?,?)').run('editor',f.p.id,'other@example.test','editor');const g=emptyGraph();g.pieces.push(makePiece('page'));assert.equal((await client(f,'/api/projects/'+f.p.id,'PATCH',{draft:g,revision:0,draftRevision:0},otherHeaders)).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payload_objects WHERE owner=?').get('other-id').n,0);assert.ok(f.sqlite.prepare('SELECT COUNT(*) n FROM payload_objects WHERE owner=?').get('owner-id').n>1);await reserveStorage(f.env,'owner-id',f.p.id,2_000_000_000);await client(f,'/api/wallet/preview-plan','POST',{planId:'wallet'});assert.equal((await client(f,'/api/projects/'+f.p.id)).status,200);assert.equal((await client(f,'/api/projects/'+f.p.id+'/export')).status,200);await assert.rejects(()=>storeJson(f.env,'projects/'+f.p.id,{new:'blocked'}),/full/);
 }finally{f.close();}
});
test('PUT and accounting failures preserve saved revisions and retain uncertain bytes',async()=>{
 const f=await setup();try{const before=await storageUsage(f.env,'owner-id');f.env.BUCKET.put=async()=>{throw Error('PUT failure')};await assert.rejects(()=>storeJson(f.env,'projects/'+f.p.id,{new:'failed'}),e=>e.status===503);assert.equal(await storageUsage(f.env,'owner-id'),before);assert.equal((await client(f,'/api/projects/'+f.p.id)).body.draft_revision,0);
 }finally{f.close();}
 const f2=await setup();try{f2.sqlite.exec("CREATE TRIGGER block_payload BEFORE INSERT ON payload_objects BEGIN SELECT RAISE(ABORT,'injected'); END");await assert.rejects(()=>storeJson(f2.env,'projects/'+f2.p.id,{new:'ambiguous'}));const usage=await storageBreakdown(f2.env,'owner-id');assert.ok(usage.pending>0);assert.equal(f2.files.size,2);assert.equal((await client(f2,'/api/projects/'+f2.p.id)).body.draft_revision,0);}finally{f2.close();}
});
test('rate budgets apply before resources and production dispatch; API tokens share their owner budget',async()=>{
 const f=await setup();try{f.sqlite.prepare('INSERT INTO request_limits(owner,bucket,started_at,requests) VALUES(?,?,?,?) ON CONFLICT(owner,bucket) DO UPDATE SET requests=excluded.requests,started_at=excluded.started_at').run('owner-id','write',Date.now(),180);for(const path of ['/api/resources','/api/projects/'+f.p.id+'/production/quote','/api/wallet/welcome']){const r=await client(f,path,'POST',{});assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');}assert.equal((await client(f,'/api/projects/'+f.p.id+'/export')).status,200);
 f.sqlite.prepare('INSERT INTO api_tokens(id,owner,project_id,hash,name,scopes,max_charge,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('rate-token','owner-id',f.p.id,await digest('vw_rate'),'Test','["read"]',0,Date.now()+100000,'2026');f.sqlite.prepare('UPDATE request_limits SET requests=600,started_at=? WHERE owner=? AND bucket=?').run(Date.now(),'owner-id','read');for(const path of ['/api/assets/missing','/p/missing','/api/resources'])assert.equal((await client(f,path,'GET',undefined,{authorization:'Bearer vw_rate'})).status,429);
 f.sqlite.prepare('UPDATE request_limits SET started_at=?').run(Date.now()-61000);assert.equal((await client(f,'/api/projects/'+f.p.id)).status,200);
 }finally{f.close();}
});
test('multipart without a Content-Length is bounded before parsing and cancels its stream',async()=>{
 let cancelled=false;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(80));},cancel(){cancelled=true;}});const request=new Request('https://app.test/upload',{method:'POST',duplex:'half',body:stream,headers:{'content-type':'multipart/form-data; boundary=test'}});await assert.rejects(()=>boundedFormData(request,100),e=>e.status===413);assert.equal(cancelled,true);
});
