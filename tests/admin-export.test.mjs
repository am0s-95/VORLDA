import test from 'node:test';
import assert from 'node:assert/strict';
import {rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {example,writePortable,operator,runServer,adminClient,sources} from './portable-fixture.mjs';
import {portableFiles} from '../lib/portable.ts';
import {validateProjectBundle} from '../lib/project-io.ts';
const newPassword='A distinct acceptance passphrase 2026!';
const dbPath=(dir,profile='development')=>join(dir,'data',profile,'forms.sqlite');

test('optional admin initializes once, restricts first login, rotates sessions, and protects actual responses',{timeout:60000},async()=>{
 const project=example(true),dir=writePortable(project);let service;
 try{
  service=await runServer(dir);const client=adminClient(service);let r=await client.request('session');assert.equal(r.body.initialized,false);assert.equal((await client.request('responses')).status,403);
  const credentials=operator(dir);assert.throws(()=>operator(dir),/administrator already exists/);await client.request('session');
  assert.equal((await client.request('login',{username:'admin',password:credentials.temporaryPassword},{headers:{'x-csrf-token':'wrong'}})).status,403);
  assert.equal((await client.request('login',{username:'admin',password:credentials.temporaryPassword},{headers:{origin:'https://evil.example'}})).status,403);
  const preCookie=client.cookie;r=await client.request('login',{username:'admin',password:credentials.temporaryPassword});assert.equal(r.status,200);assert.equal(r.body.scope,'bootstrap');assert.notEqual(client.cookie,preCookie);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal((await client.request('responses')).status,403);
  const oldCookie=client.cookie;r=await client.request('password',{currentPassword:credentials.temporaryPassword,newPassword});assert.equal(r.status,200);assert.equal(r.body.scope,'admin');assert.notEqual(client.cookie,oldCookie);
  const stale=adminClient(service);stale.cookie=oldCookie;assert.equal((await stale.request('responses')).status,401);
  await fetch(service.origin+'/api/forms',{method:'POST',headers:{origin:service.origin,'content-type':'application/json'},body:JSON.stringify({pieceId:project.graph.pieces[1].id,requestId:'acceptance-response-01',data:{message:'<img src=x onerror=alert(1)>'}})});
  r=await client.request('responses');assert.equal(r.status,200);assert.equal(r.body.items.length,1);assert.equal(r.body.items[0].data.message,'<img src=x onerror=alert(1)>');
  const html=await fetch(service.origin+'/admin');assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);assert.ok(!(await html.text()).includes('<img src=x'));assert.match(readFileSync(join(dir,'admin.js'),'utf8'),/record\.textContent/);
  assert.equal((await client.request('logout',{})).status,200);assert.equal((await client.request('responses')).status,401);
  await client.request('session');assert.equal((await client.request('login',{username:'admin',password:credentials.temporaryPassword})).status,401);assert.equal((await client.request('login',{username:'admin',password:newPassword})).status,200);
  const db=new DatabaseSync(dbPath(dir));const row=db.prepare('SELECT * FROM admin_account').get();assert.equal(row.must_change,0);assert.equal(row.version,2);assert.ok(!row.verifier.includes(newPassword));assert.ok(!row.verifier.includes(credentials.temporaryPassword));assert.equal(JSON.parse(row.verifier).N,131072);db.close();
 }finally{if(service)await service.stop();rmSync(dir,{recursive:true,force:true});}
});
test('reset and expiry invalidate old credentials and sessions, including after restart',{timeout:60000},async()=>{
 const dir=writePortable(example(true));let service;try{
  const initial=operator(dir);service=await runServer(dir);let client=adminClient(service);await client.request('session');await client.request('login',{username:'admin',password:initial.temporaryPassword});await client.request('password',{currentPassword:initial.temporaryPassword,newPassword});const cookie=client.cookie;
  await service.stop();service=await runServer(dir);client=adminClient(service);client.cookie=cookie;assert.equal((await client.request('responses')).status,200);
  const reset=operator(dir,'reset');assert.notEqual(reset.temporaryPassword,initial.temporaryPassword);assert.equal((await client.request('responses')).status,401);await client.request('session');assert.equal((await client.request('login',{username:'admin',password:newPassword})).status,401);
  const db=new DatabaseSync(dbPath(dir));db.prepare('UPDATE admin_account SET temporary_expires=1').run();db.close();assert.equal((await client.request('login',{username:'admin',password:reset.temporaryPassword})).status,401);
 }finally{if(service)await service.stop();rmSync(dir,{recursive:true,force:true});}
});
test('production and development never share credentials, sessions or responses',{timeout:60000},async()=>{
 const dir=writePortable(example(true));let development,production;try{
  const dev=operator(dir),prod=operator(dir,'init',{VORLDA_ENV:'production'});assert.notEqual(dev.temporaryPassword,prod.temporaryPassword);
  development=await runServer(dir);production=await runServer(dir,{VORLDA_ENV:'production'});const a=adminClient(development),b=adminClient(production);await a.request('session');await b.request('session');assert.notEqual(a.cookie.split('=')[0],b.cookie.split('=')[0]);
  assert.equal((await b.request('login',{username:'admin',password:dev.temporaryPassword})).status,401);
  await assert.rejects(()=>runServer(dir,{VORLDA_ENV:'production',VORLDA_DATA_DIR:join(dir,'data/development')}),/different environment/);
  await assert.rejects(()=>runServer(dir,{PUBLIC_APP:'1',APP_ORIGIN:'https://app.example'}),/VORLDA_ENV=production/);
  await assert.rejects(()=>runServer(dir,{VORLDA_ENV:'production',PUBLIC_APP:'1',APP_ORIGIN:'https://app.example'}),/password replacement/);
  const db=new DatabaseSync(dbPath(dir));db.prepare('INSERT INTO submissions(id,piece_id,data,created_at) VALUES(?,?,?,?)').run('only-test','form','{}',1);db.close();const live=new DatabaseSync(dbPath(dir,'production'));assert.equal(live.prepare('SELECT count(*) AS n FROM submissions').get().n,0);live.close();
 }finally{if(development)await development.stop();if(production)await production.stop();rmSync(dir,{recursive:true,force:true});}
});
test('source and reimport allowlists cannot carry instance credentials or sessions',()=>{
 const value={...example(true),password:'DO_NOT_EXPORT_PASSWORD',sessions:['DO_NOT_EXPORT_SESSION'],runtime:{admin:true,verifier:'DO_NOT_EXPORT_VERIFIER'}};
 const clean=validateProjectBundle(value),files=portableFiles(value,sources);assert.deepEqual(clean.runtime,{admin:true});assert.ok(files.every(f=>!f.content.includes('DO_NOT_EXPORT')));assert.ok(files.every(f=>!f.name.startsWith('data/')));
 assert.deepEqual(validateProjectBundle(JSON.parse(files.find(f=>f.name==='project.vorlda.json').content)).graph,value.graph);
});
test('disabled admin rejects routes and operator initialization; legacy data is never silently ignored',{timeout:30000},async()=>{
 const dir=writePortable(example(false));let service;try{
  service=await runServer(dir);assert.equal((await fetch(service.origin+'/admin')).status,404);assert.equal((await fetch(service.origin+'/admin/api/session')).status,404);assert.throws(()=>operator(dir),/does not enable/);await service.stop();service=undefined;
  writeFileSync(join(dir,'data/forms.sqlite'),'legacy-database-placeholder');await assert.rejects(()=>runServer(dir),/Legacy database found/);assert.equal(readFileSync(join(dir,'data/forms.sqlite'),'utf8'),'legacy-database-placeholder');
 }finally{if(service)await service.stop();rmSync(dir,{recursive:true,force:true});}
});
test('login limiter persists and runs before expensive hashing',{timeout:30000},async()=>{
 const dir=writePortable(example(true));let service;try{operator(dir);service=await runServer(dir);let client=adminClient(service);await client.request('session');
  for(let i=0;i<8;i++)assert.equal((await client.request('login',{username:'admin',password:'x'.repeat(1025)})).status,401);
  assert.equal((await client.request('login',{username:'admin',password:'wrong'})).status,429);await service.stop();service=await runServer(dir);client=adminClient(service);await client.request('session');assert.equal((await client.request('login',{username:'admin',password:'wrong'})).status,429);
 }finally{if(service)await service.stop();rmSync(dir,{recursive:true,force:true});}
});
test('a reset racing asynchronous password verification cannot create an old-credential session',{timeout:30000},async()=>{
 const dir=writePortable(example(true));try{
  const credentials=operator(dir),db=new DatabaseSync(dbPath(dir));const {createAdminService}=await import(pathToFileURL(join(dir,'admin-auth.mjs')).href);const svc=createAdminService({db,profile:'development',instanceId:'race-fixture',publicMode:false,getOrigin:()=> 'http://127.0.0.1:3000',html:'',script:''});
  const response=()=>({headers:{},body:'',writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}}),first=response();await svc.handle({method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}},first,'/admin/api/session');const state=JSON.parse(first.body);
  const req={method:'POST',headers:{cookie:first.headers['Set-Cookie'].split(';')[0],origin:'http://127.0.0.1:3000','content-type':'application/json','x-csrf-token':state.csrf},socket:{remoteAddress:'127.0.0.1'}};
  const pending=svc.handle(req,response(),'/admin/api/login',async()=>({username:'admin',password:credentials.temporaryPassword}));await new Promise(setImmediate);db.prepare('UPDATE admin_account SET version=version+1').run();await assert.rejects(pending,/Credentials changed/);assert.equal(db.prepare("SELECT count(*) AS n FROM admin_sessions WHERE scope!='preauth'").get().n,0);db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('public cookies are host-scoped and secure; idle-expired sessions cannot access data',async()=>{
 const dir=writePortable(example(true));try{
  operator(dir);const db=new DatabaseSync(dbPath(dir)),{createAdminService}=await import(pathToFileURL(join(dir,'admin-auth.mjs')).href);const service=createAdminService({db,profile:'production',instanceId:'cookie-test',publicMode:true,getOrigin:()=> 'https://app.example',html:'',script:''});
  const res={headers:{},writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};await service.handle({method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}},res,'/admin/api/session');assert.match(res.headers['Set-Cookie'],/^__Host-/);assert.match(res.headers['Set-Cookie'],/; Secure/);assert.doesNotMatch(res.headers['Set-Cookie'],/Domain=/);
  db.prepare('UPDATE admin_sessions SET idle_expires=1').run();await assert.rejects(()=>service.handle({method:'GET',headers:{cookie:res.headers['Set-Cookie'].split(';')[0]},socket:{remoteAddress:'127.0.0.1'}},res,'/admin/api/responses'),/Sign in/);db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('admin client clears sensitive state on logout and expiry and ignores stale in-flight responses',async()=>{
 // Logic test with a tiny DOM double, NOT a browser/visual acceptance test.
 const nodes=new Map();function element(){return{hidden:false,children:[],textContent:'',disabled:false,resetCount:0,append(v){this.children.push(v)},replaceChildren(){this.children=[]},reset(){this.resetCount++},addEventListener(){},click(){}};}
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};let mode='admin',defer=false,resolvePending;
 const reply=(data,code=200)=>({ok:code<400,status:code,json:async()=>data});
 const fetch=async(url)=>{if(url.endsWith('/session'))return reply({scope:mode==='admin'?'admin':'preauth',profile:'development',csrf:'test-csrf',initialized:true});if(url.endsWith('/logout')){mode='preauth';return reply({signedOut:true});}if(url.includes('/responses')){if(mode==='expired')return reply({error:'Session expired'},401);if(defer)return new Promise(resolve=>resolvePending=()=>resolve(reply({items:[{created_at:1,data:{private:'old response'}}],next:null})));return reply({items:[{created_at:1,data:{private:'customer response'}}],next:null});}throw Error('Unexpected client request');};
 runInNewContext(sources.adminScript,{document:{getElementById:node,createElement:element},fetch,FormData,Blob,URL,setTimeout});await new Promise(setImmediate);assert.equal(node('responses').children.length,1);
 defer=true;const pending=node('refresh').onclick();await new Promise(setImmediate);await node('logout').onclick();assert.equal(node('responses').children.length,0);assert.equal(node('responses-panel').hidden,true);assert.ok(node('password').resetCount);resolvePending();await pending;assert.equal(node('responses').children.length,0);
 mode='expired';defer=false;node('responses').append({textContent:'stale sensitive response'});await node('refresh').onclick();assert.equal(node('responses').children.length,0);assert.equal(node('login-panel').hidden,false);
});
