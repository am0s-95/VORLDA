import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,client,otherHeaders} from './support.mjs';
import {emptyGraph,makePiece,validateGraph} from '../lib/world.ts';
import {loadJson,storeJson,copyJson} from '../server/payloads.ts';

const bigGraph=()=>{const g=emptyGraph(),page=makePiece('page'),text=makePiece('text',page.id);text.props.text='ع'.repeat(600000);g.pieces.push(page,text);g.entries=[page.id];return g;};
function assertSmallRows(f){for(const table of ['projects','snapshots','publications','quotes','studio_resources'])for(const row of f.sqlite.prepare('SELECT * FROM '+table).all())assert.ok(Object.values(row).reduce((n,v)=>n+(typeof v==='string'?Buffer.byteLength(v):8),0)<2000000,table+' exceeds D1 row limit');}
test('large UTF-8 graphs persist, apply, snapshot and publish with small database rows',async()=>{
 const f=fixture();try{const g=bigGraph(),p=(await client(f,'/api/projects','POST',{name:'Large Arabic project',graph:g})).body;
 assert.deepEqual(p.draft,g);assertSmallRows(f);assert.ok(f.files.size);
 const q=(await client(f,'/api/projects/'+p.id+'/quote','POST',{graph:g,revision:0})).body;
 assert.equal((await client(f,'/api/quotes/apply','POST',{quoteId:q.id,requestId:'large-first'})).status,200);
 const applied=(await client(f,'/api/projects/'+p.id)).body;assert.deepEqual(applied.graph,g);assertSmallRows(f);
 const pub=(await client(f,'/api/projects/'+p.id+'/publish','POST',{})).body;assert.equal((await client(f,pub.url)).status,200);
 const old=(await client(f,'/api/projects/'+p.id+'/snapshots/'+applied.snapshots[0].id)).body;
 const next=structuredClone(g);next.pieces[1].props.text='new';const q2=(await client(f,'/api/projects/'+p.id+'/quote','POST',{graph:next,revision:1})).body;await client(f,'/api/quotes/apply','POST',{quoteId:q2.id,requestId:'next'});
 assert.deepEqual(old.graph,g);assert.deepEqual((await client(f,'/api/projects/'+p.id+'/snapshots/'+applied.snapshots[0].id)).body.graph,g);
 assert.equal((await client(f,pub.url)).status,200);assert.equal((await client(f,'/api/projects/'+p.id,'GET',undefined,otherHeaders)).status,404);assertSmallRows(f);
 }finally{f.close();}
});
test('object PUT failure and stale draft never replace saved graph or increment revisions',async()=>{
 const f=fixture();try{const p=(await client(f,'/api/projects','POST',{name:'Safe',kind:'blank'})).body;
 f.env.BUCKET.put=async()=>{throw Error('injected outage')};
 assert.equal((await client(f,'/api/projects/'+p.id,'PATCH',{draft:bigGraph(),revision:0,draftRevision:0})).status,503);
 let row=f.sqlite.prepare('SELECT * FROM projects WHERE id=?').get(p.id);assert.equal(row.draft_revision,0);assert.equal((await loadJson(f.env,'projects/'+p.id,row.draft)).pieces.length,0);
 assert.equal((await client(f,'/api/projects/'+p.id,'PATCH',{draft:bigGraph(),revision:0,draftRevision:2})).status,409);
 }finally{f.close();}
});
test('legacy large inline quote is converted before atomic apply; rollback keeps original',async()=>{
 const f=fixture();try{const p=(await client(f,'/api/projects','POST',{name:'Legacy',kind:'blank'})).body,g=bigGraph();
 const q=(await client(f,'/api/projects/'+p.id+'/quote','POST',{graph:g,revision:0})).body;
 f.sqlite.prepare('UPDATE quotes SET payload=? WHERE id=?').run(JSON.stringify(g),q.id);
 f.sqlite.exec("CREATE TRIGGER block_snapshot BEFORE INSERT ON snapshots BEGIN SELECT RAISE(ABORT,'injected'); END");
 assert.equal((await client(f,'/api/quotes/apply','POST',{quoteId:q.id,requestId:'rollback'})).status,500);
 assert.equal(f.sqlite.prepare('SELECT revision FROM projects WHERE id=?').get(p.id).revision,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM operations').get().n,0);
 f.sqlite.exec('DROP TRIGGER block_snapshot');assert.equal((await client(f,'/api/quotes/apply','POST',{quoteId:q.id,requestId:'retry'})).status,200);assertSmallRows(f);
 }finally{f.close();}
});
test('payload references reject scope substitution, missing files and corrupt bytes',async()=>{
 const f=fixture();try{const scope='projects/test',value={text:'x'.repeat(150000)},ref=await storeJson(f.env,scope,value,false,'owner-id');
 assert.deepEqual(await loadJson(f.env,scope,ref),value);assert.equal(await copyJson(f.env,scope,ref),ref);
 await assert.rejects(()=>loadJson(f.env,'projects/other',ref),/reference/);
 const key=[...f.files.keys()][0],file=f.files.get(key);const bytes=new Uint8Array(file.bytes);bytes[30]^=1;file.bytes=bytes.buffer;
 await assert.rejects(()=>loadJson(f.env,scope,ref),/integrity/);f.files.delete(key);await assert.rejects(()=>loadJson(f.env,scope,ref),/unavailable/);
 assert.deepEqual(await loadJson(f.env,scope,'{"legacy":true}'),{legacy:true});
 }finally{f.close();}
});
test('competing imports produce exactly one original checkpoint',async()=>{
 const f=fixture();try{const p=(await client(f,'/api/projects','POST',{name:'Race',kind:'blank'})).body,g=emptyGraph();g.pieces.push(makePiece('page'));
 const results=await Promise.all(Array.from({length:6},()=>client(f,'/api/projects/'+p.id+'/import','POST',{graph:g})));
 assert.equal(results.filter(x=>x.status===200).length,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM snapshots WHERE project_id=?').get(p.id).n,1);
 }finally{f.close();}
});
test('graph budget measures UTF-8 bytes, not JavaScript string length',()=>{const g=emptyGraph(),p=makePiece('text');g.pieces.push(p);p.props.text='ع'.repeat(2100000);assert.throws(()=>validateGraph(g),/budget/);});
test('saving a small draft normalizes a near-limit legacy applied graph',async()=>{
 const f=fixture();try{const p=(await client(f,'/api/projects','POST',{name:'Near limit'})).body,g=bigGraph();g.pieces[1].props.text='x'.repeat(1949000);f.sqlite.prepare('UPDATE projects SET graph=? WHERE id=?').run(JSON.stringify(g),p.id);const draft=structuredClone(g);draft.pieces[1].props.text='x'.repeat(100000);
 assert.equal((await client(f,'/api/projects/'+p.id,'PATCH',{draft,revision:0,draftRevision:0})).status,200);assertSmallRows(f);assert.deepEqual((await client(f,'/api/projects/'+p.id)).body.graph,g);
 }finally{f.close();}
});
test('preset listing is metadata-only; stale writes do not upload objects and reads remain scoped',async()=>{
 const f=fixture();try{await client(f,'/api/bootstrap');await client(f,'/api/wallet/preview-plan','POST',{planId:'studio'});const g=bigGraph(),res=await client(f,'/api/resources','POST',{kind:'preset',name:'Large preset',data:g});assert.equal(res.status,201);const key=res.body.id,count=f.files.size;
 const list=await client(f,'/api/resources');assert.equal(list.body.items[0].data,undefined);assert.deepEqual((await client(f,'/api/resources/'+key)).body.data,g);assert.equal((await client(f,'/api/resources/'+key,'GET',undefined,otherHeaders)).status,404);
 assert.equal((await client(f,'/api/resources/'+key,'PUT',{name:'Stale',data:g,revision:0})).status,409);assert.equal(f.files.size,count);assertSmallRows(f);
 }finally{f.close();}
});
