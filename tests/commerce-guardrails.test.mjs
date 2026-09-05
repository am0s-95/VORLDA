import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,client,ownerHeaders,otherHeaders} from './support.mjs';
import {templateGraph,TEMPLATES} from '../server/templates.ts';
import {validateAllForms,validateFormResponse} from '../lib/forms.ts';
import {checkPublish} from '../lib/world.ts';
import {digest} from '../server/auth.ts';
import {grantFunds} from '../server/wallet.ts';

const buy=(f,templateId='launch',requestId='buy-1',headers=ownerHeaders)=>client(f,'/api/templates/purchase','POST',{templateId,version:1,expectedAmount:TEMPLATES.find(t=>t.id===templateId)?.amount,requestId,language:'ar'},headers);
const claim=(f,headers=ownerHeaders)=>client(f,'/api/wallet/welcome','POST',{},headers);
test('welcome claims are concurrent, one-time, non-cash and do not inflate production balance',async()=>{
 const f=fixture();try{const r=await Promise.all(Array.from({length:10},()=>claim(f)));assert.ok(r.every(x=>x.status===200));const w=(await client(f,'/api/wallet')).body;assert.equal(w.promotion.balance,10_000_000);assert.equal(w.total,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM promotion_claims').get().n,1);assert.equal(w.ledger.filter(x=>x.kind==='promotion').length,1);
 const p=(await client(f,'/api/projects','POST',{kind:'blank'})).body,q=(await client(f,`/api/projects/${p.id}/production/quote`,'POST',{kind:'billing-test'})).body;assert.equal((await client(f,`/api/projects/${p.id}/production/execute`,'POST',{quoteId:q.id})).status,409);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM production_tasks').get().n,0);
 }finally{f.close();}
});
test('normalized email and stable user identity independently prevent a second welcome grant',async()=>{
 const f=fixture();try{assert.equal((await claim(f,{'oai-authenticated-user-id':'one','oai-authenticated-user-email':' Person@Example.test '})).status,200);
 await claim(f,{'oai-authenticated-user-id':'two','oai-authenticated-user-email':'person@example.test'});await claim(f,{'oai-authenticated-user-id':'one','oai-authenticated-user-email':'new@example.test'});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM promotion_claims').get().n,1);assert.equal(f.sqlite.prepare('SELECT SUM(balance) total FROM promo_balances').get().total,10_000_000);
 f.sqlite.prepare('DELETE FROM wallets WHERE owner=?').run('one');f.sqlite.prepare('DELETE FROM users WHERE id=?').run('one');await claim(f,{'oai-authenticated-user-id':'one','oai-authenticated-user-email':'person@example.test'});assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM promotion_claims').get().n,1);
 }finally{f.close();}
});
test('campaign budget is atomic across different identities and cannot be reset by disabling the offer',async()=>{
 const f=fixture();try{await client(f,'/api/admin/commerce','PUT',{policy:{templatesEnabled:true,welcomeEnabled:true,dailyGrantLimitMicros:10_000_000,totalGrantLimitMicros:10_000_000}});const r=await Promise.all(Array.from({length:8},(_,i)=>claim(f,{'oai-authenticated-user-id':'user-'+i,'oai-authenticated-user-email':`user${i}@example.test`})));assert.equal(r.filter(x=>x.status===200).length,1);assert.equal(r.filter(x=>x.status===409).length,7);assert.equal(f.sqlite.prepare('SELECT SUM(amount) n FROM promotion_claims').get().n,10_000_000);
 for(const enabled of [false,true])await client(f,'/api/admin/commerce','PUT',{policy:{templatesEnabled:true,welcomeEnabled:enabled,dailyGrantLimitMicros:10_000_000,totalGrantLimitMicros:10_000_000}});assert.equal((await claim(f)).status,409);
 }finally{f.close();}
});
test('anonymous and integration identities cannot claim credit or purchase templates; live settings start disabled',async()=>{
 const f=fixture();try{assert.equal((await claim(f,{})).status,401);await client(f,'/api/bootstrap');const token='vw_fixture';f.sqlite.prepare('INSERT INTO api_tokens(id,owner,project_id,hash,name,scopes,max_charge,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('token','owner-id','any',await digest(token),'Test','["read","write","execute"]',99_000_000,Date.now()+100000,new Date().toISOString());assert.equal((await claim(f,{authorization:'Bearer '+token})).status,403);assert.equal((await buy(f,'launch','token-buy',{authorization:'Bearer '+token})).status,403);
 await claim(f);f.env.BILLING_MODE='live';assert.equal((await claim(f)).status,409);const w=(await client(f,'/api/wallet')).body;assert.equal(w.promotion.balance,0);assert.equal(w.total,0);assert.equal((await client(f,'/api/admin/commerce','PUT',{policy:{}},otherHeaders)).status,403);
 }finally{f.close();}
});
test('concurrent purchase retries deliver one project, one debit and one physical payload',async()=>{
 const f=fixture();try{await claim(f);const r=await Promise.all(Array.from({length:6},()=>buy(f)));assert.ok(r.every(x=>x.status===200));assert.equal(new Set(r.map(x=>x.body.project_id)).size,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM projects').get().n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM snapshots').get().n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM template_purchases').get().n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payload_objects').get().n,1);assert.equal(f.files.size,1);assert.equal((await client(f,'/api/wallet')).body.promotion.balance,8_000_000);
 const p=(await client(f,'/api/projects/'+r[0].body.project_id)).body;assert.equal(p.graph.pieces.filter(x=>x.type==='page').length,2);assert.equal(p.revision,1);assert.equal((await client(f,'/api/projects/'+p.id+'/export')).status,200);assert.equal((await client(f,'/api/projects/'+p.id,'GET',undefined,otherHeaders)).status,404);await client(f,'/api/projects/'+p.id,'DELETE');assert.equal((await client(f,'/api/wallet')).body.promotion.balance,8_000_000);
 }finally{f.close();}
});
test('request IDs bind one purchase; already-owned projects reopen through reads without purchasing',async()=>{
 const f=fixture();try{await claim(f);const r=await Promise.all([buy(f,'launch','shared'),buy(f,'catalog','shared')]);assert.equal(r.filter(x=>x.status===200).length,1);assert.equal(r.filter(x=>x.status===409).length,1);const winner=r.find(x=>x.status===200).body;assert.equal((await buy(f,winner.template_id,'shared')).status,200);assert.equal((await buy(f,winner.template_id,'fresh')).status,409);const catalog=(await client(f,'/api/templates')).body;assert.equal(catalog.items.find(x=>x.id===winner.template_id).projectId,winner.project_id);assert.equal((await client(f,'/api/projects/'+winner.project_id)).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM ledger WHERE kind=?').get('template').n,1);
 }finally{f.close();}
});
test('purchases allocate promo then subscription then topup, and insufficient competing purchases cannot overdraw',async()=>{
 const f=fixture();try{await claim(f);f.sqlite.prepare('UPDATE promo_balances SET balance=?').run(1_000_000);await grantFunds(f.env,'owner-id','test',1_000_000,'subscription','sub','Subscription');await grantFunds(f.env,'owner-id','test',2_000_000,'topup','top','Topup');const r=await buy(f,'catalog');assert.equal(r.status,200);assert.deepEqual([r.body.from_promo,r.body.from_subscription,r.body.from_topup],[1_000_000,1_000_000,1_000_000]);assert.equal((await client(f,'/api/wallet')).body.total,1_000_000);assert.equal((await buy(f,'portfolio','expensive')).status,409);
 }finally{f.close();}
 const f2=fixture();try{await claim(f2);f2.sqlite.prepare('UPDATE promo_balances SET balance=?').run(3_000_000);const r=await Promise.all([buy(f2,'catalog','first'),buy(f2,'portfolio','second')]);assert.equal(r.filter(x=>x.status===200).length,1);assert.equal((await client(f2,'/api/wallet')).body.promotion.balance,0);assert.equal(f2.files.size,1);}finally{f2.close();}
});
test('transactional delivery failure rolls back charges, projects, entitlements and ledger',async()=>{
 const f=fixture();try{await claim(f);f.sqlite.exec("CREATE TRIGGER block_template BEFORE INSERT ON snapshots BEGIN SELECT RAISE(ABORT,'injected'); END");assert.equal((await buy(f)).status,500);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM template_purchases').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM projects').get().n,0);assert.equal((await client(f,'/api/wallet')).body.promotion.balance,10_000_000);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM ledger WHERE kind=?').get('template').n,0);f.sqlite.exec('DROP TRIGGER block_template');assert.equal((await buy(f)).status,200);
 }finally{f.close();}
});
test('unknown templates, stale prices/versions and injected destination data cannot trigger a charge',async()=>{
 const f=fixture();try{await claim(f);for(const change of [{version:2},{expectedAmount:1},{templateId:'unknown'}])assert.ok((await client(f,'/api/templates/purchase','POST',{templateId:'launch',version:1,expectedAmount:2_000_000,requestId:'bad',...change})).status>=400);assert.equal((await client(f,'/api/wallet')).body.promotion.balance,10_000_000);assert.equal(f.files.size,0);const r=await client(f,'/api/templates/purchase','POST',{templateId:'launch',version:1,expectedAmount:2_000_000,requestId:'safe',owner:'another-user',projectId:'foreign',amount:0});assert.equal(r.status,200);assert.equal(r.body.owner,'owner-id');assert.notEqual(r.body.project_id,'foreign');assert.equal(r.body.amount,2_000_000);
 }finally{f.close();}
});
test('every template validates, exports and has unique working form fields on desktop and mobile',()=>{
 for(const ar of [true,false])for(const spec of TEMPLATES){const g=templateGraph(spec.id,ar);validateAllForms(g);assert.deepEqual(checkPublish(g).filter(x=>x.severity==='error'),[]);for(const form of g.pieces.filter(x=>x.type==='form'))for(const device of ['desktop','mobile'])assert.deepEqual(validateFormResponse(g,form.id,{name:'Customer',email:'customer@example.test',message:'Hello'},device),{name:'Customer',email:'customer@example.test',message:'Hello'});}
});
