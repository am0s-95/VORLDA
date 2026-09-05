import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,client} from './support.mjs';
test('testing uses its own administrator, database, objects and wallet, never original workspace data',async()=>{
 const original=fixture(),testing=fixture();try{
  const before=await client(original,'/api/bootstrap');const originalProject=(await client(original,'/api/projects','POST',{name:'Original untouched'})).body;
  testing.env.APP_OWNER_EMAIL='qa-admin@example.test';const qa={'oai-authenticated-user-id':'isolated-qa-admin','oai-authenticated-user-email':'qa-admin@example.test'};
  const context=(await client(testing,'/api/bootstrap','GET',undefined,qa)).body;assert.equal(context.user.admin,true);assert.equal(context.wallet.mode,'test');
  const project=(await client(testing,'/api/projects','POST',{name:'Disposable test'},qa)).body;await client(testing,'/api/wallet/test-grant','POST',{},qa);assert.equal((await client(testing,'/api/projects/'+originalProject.id,'GET',undefined,qa)).status,404);
  assert.equal(original.sqlite.prepare('SELECT count(*) AS n FROM projects').get().n,1);assert.equal(original.sqlite.prepare('SELECT count(*) AS n FROM users WHERE id=?').get(qa['oai-authenticated-user-id']).n,0);assert.equal((await client(original,'/api/wallet')).body.total,before.body.wallet.total);assert.equal((await client(original,'/api/projects/'+project.id)).status,404);assert.notEqual(original.files,testing.files);
 }finally{original.close();testing.close();}
});
