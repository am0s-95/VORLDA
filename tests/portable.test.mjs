import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {emptyGraph,makePiece} from '../lib/world.ts';
import {validateFormResponse} from '../lib/forms.ts';
import {validateProjectBundle} from '../lib/project-io.ts';
import {portableFiles,portableManifest} from '../lib/portable.ts';
import {zipFiles} from '../lib/zip.ts';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const sources={world:source('lib/world.ts'),compiler:source('lib/compiler.ts'),forms:source('lib/forms.ts'),projectIo:source('lib/project-io.ts'),...Object.fromEntries(['build','server','responses'].map(k=>[k,source('portable/'+k+'.mjs.template')]))};
function example(){const g=emptyGraph(),page=makePiece('page'),form=makePiece('form',page.id),input=makePiece('input',form.id),image=makePiece('image',page.id);input.props={field:'email',inputType:'email',required:true};image.props.src='/api/assets/picture';g.pieces.push(page,form,input,image);g.entries=[page.id];return {format:'vorlda-project',version:1,name:'مشروعي',graph:g,entry:page.id,assets:[{path:'/api/assets/picture',name:'image.png',type:'image/png',data:'data:image/png;base64,iVBORw=='}]};}
test('bundle and ZIP reject unsafe paths, malformed assets, versions and missing media',async()=>{
 for(const name of ['../x','/x','x\\y','C:/x','a//b','a/./b'])assert.throws(()=>zipFiles([{name,content:'x'}]),/path/);
 assert.throws(()=>zipFiles([{name:'x',content:'1'},{name:'x',content:'2'}]),/duplicate/);
 const p=example();assert.deepEqual(validateProjectBundle(p).graph,p.graph);assert.throws(()=>validateProjectBundle({...p,version:2}),/version/);
 assert.throws(()=>validateProjectBundle({...p,assets:[...p.assets,...p.assets]}),/duplicate/);
 assert.throws(()=>validateProjectBundle({...p,assets:[{...p.assets[0],data:'data:text/html;base64,AAAA'}]}),/type/);
  assert.throws(()=>portableFiles({...p,assets:[]},sources),/asset/);
});
test('reusing a large embedded image cannot explode generated HTML size',()=>{
 const p=example();p.assets[0].data='data:image/png;base64,'+'AAAA'.repeat(350000);
 for(let n=0;n<50;n++){const image=makePiece('image',p.graph.entries[0]);image.props.src=p.assets[0].path;p.graph.pieces.push(image);}
 assert.throws(()=>portableFiles(p,sources),/budget/);
});
test('shared form validation handles inherited security, hidden ancestors and idempotency inputs',()=>{
 const p=example(),form=p.graph.pieces[1],input=p.graph.pieces[2];assert.deepEqual(validateFormResponse(p.graph,form.id,{email:'a@b.test'}),{email:'a@b.test'});
 assert.throws(()=>validateFormResponse(p.graph,form.id,{email:'wrong'}),/email/);assert.throws(()=>validateFormResponse(p.graph,form.id,{email:'a@b.test',unexpected:'x'}),/Unknown/);
 const sourceInput=makePiece('input');sourceInput.hidden=true;sourceInput.props.inputType='password';p.graph.pieces.push(sourceInput);input.sourceId=sourceInput.id;delete input.props.inputType;
 assert.throws(()=>validateFormResponse(p.graph,form.id,{email:'secret'}),/password/);assert.throws(()=>portableFiles(p,sources),/authentication/);delete input.sourceId;p.graph.pieces.pop();
 input.props.inputType='password';assert.throws(()=>portableFiles(p,sources),/authentication/);assert.throws(()=>validateFormResponse(p.graph,form.id,{email:'secret'}),/password/);
 input.props.inputType='text';form.hidden=true;assert.throws(()=>validateFormResponse(p.graph,form.id,{email:'a'}),/not found/);
 form.hidden=false;const group=makePiece('group',p.graph.entries[0]);group.hidden=true;p.graph.pieces.push(group);form.parentId=group.id;assert.doesNotThrow(()=>portableFiles(p,sources));assert.throws(()=>validateFormResponse(p.graph,form.id,{email:'a'}),/not found/);
});
async function start(dir){const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{PATH:process.env.PATH,PORT:'0'},stdio:['ignore','pipe','pipe']});let output='',errors='';child.stderr.on('data',b=>errors+=b);const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Startup timeout: '+errors));},15000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Startup failed: '+errors));});child.stdout.on('data',b=>{output+=b;const m=output.match(/listening at (http:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});return {child,origin,stop:async()=>{const done=once(child,'exit');child.kill('SIGTERM');await done;}};}
test('actual ZIP extracts independently, builds with no dependencies and runs a persistent protected forms backend',{timeout:60000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'vorlda-portable-'));let service;try{
  const p=example(),files=portableFiles(p,sources);files.push({name:'manifest.json',content:await portableManifest(files)});writeFileSync(join(dir,'bundle.zip'),Buffer.from(await zipFiles(files).arrayBuffer()));
  execFileSync('python',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])',join(dir,'bundle.zip'),dir]);
  assert.deepEqual(validateProjectBundle(JSON.parse(readFileSync(join(dir,'project.vorlda.json')))).graph,p.graph);
  execFileSync('npm',['test'],{cwd:dir,env:{PATH:process.env.PATH},timeout:15000});
  service=await start(dir);let base=service.origin;const html=await (await fetch(base)).text();assert.match(html,/data:image\/png;base64,iVBORw==/);assert.ok(!html.includes('/api/assets/'));assert.match(html,/\/api\/forms/);
  const badHost=await new Promise((resolve,reject)=>{const req=httpRequest(base,{headers:{Host:'attacker.test'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(badHost,403);
  for(const path of ['/project.vorlda.json','/src/world.ts','/data/forms.sqlite','/responses.mjs'])assert.equal((await fetch(base+path)).status,404);
  const payload={pieceId:p.graph.pieces[1].id,requestId:'response-001',data:{email:'customer@example.test'}};
  const post=(data=payload,origin=base)=>fetch(base+'/api/forms',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(data)});
  assert.equal((await post(payload,'https://attacker.test')).status,403);assert.equal((await post({...payload,data:{email:'bad'}})).status,400);
  assert.equal((await post()).status,201);assert.equal((await post()).status,200);assert.equal((await post({...payload,data:{email:'new@example.test'}})).status,409);
  await service.stop();service=undefined;let db=new DatabaseSync(join(dir,'data/forms.sqlite'),{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM submissions').get().n,1);db.close();
  service=await start(dir);base=service.origin;assert.equal((await post()).status,200);assert.equal((await post({...payload,requestId:'response-002'})).status,201);
  let last;for(let n=0;n<22;n++)last=await post({...payload,requestId:'flood-test-'+n});assert.equal(last.status,429);
 }finally{if(service)await service.stop();rmSync(dir,{recursive:true,force:true});}
});
