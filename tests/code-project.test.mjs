import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { zipFiles } from '../lib/zip.ts';
import { codePath, encodeCodeFile, fileBytes, validateCodeProject, analyzeCodeProject, codeExportFiles, CODE_BYTES } from '../lib/code-project.ts';
import { readCodeZip, importCodeFiles } from '../lib/code-import.ts';
import { codeSamples } from '../lib/code-templates.ts';
import { inspectFlow } from '../lib/flow-inspector.ts';
import { fixture, client, otherHeaders } from './support.mjs';
import { emptyGraph, makePiece, duplicateParts } from '../lib/world.ts';
const exec = promisify(execFile), runner = await readFile(new URL('../portable/code-runner.mjs.template', import.meta.url), 'utf8');
const file = (path, content = '') => ({ path, encoding: 'utf8', content });
const project = (files, tasks = []) => ({ version: 1, files, tasks });
async function materialize(p) { const dir = await mkdtemp(join(tmpdir(), 'vorlda-code-')); for (const f of codeExportFiles(p, runner)) { const path = join(dir, f.name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, f.content); } return dir; }

test('code ZIP round trip preserves BOM, Unicode paths, CRLF, binary assets and task graph', async () => {
  const bom = Uint8Array.from([239,187,191,65,13,10]), binary = Uint8Array.from([0,255,128,12]);
  const p = project([encodeCodeFile('src/عربي.txt', bom), encodeCodeFile('assets/icon.bin', binary), file('src/main.py', 'print("hello")\n')], [{ id: 'run', command: ['python3', 'src/main.py'], dependsOn: [], cwd: '' }]);
  const zip = zipFiles(codeExportFiles(p, runner));
  const imported = importCodeFiles(await readCodeZip(await zip.arrayBuffer()));
  assert.deepEqual(imported.project, p); assert.deepEqual(fileBytes(imported.project.files[0]), bom); assert.deepEqual(fileBytes(imported.project.files[1]), binary); assert.equal(imported.skipped.length, 3);
  const graph=emptyGraph(), node=makePiece('code');node.props.workspace=project([file(node.id,node.id)],[{id:node.id,command:['node',node.id],dependsOn:[],cwd:''}]);graph.pieces.push(node);const copy=duplicateParts(graph,[node.id],'independent');assert.deepEqual(copy.graph.pieces.find(p=>p.id===copy.created[0]).props.workspace,node.props.workspace);
});

test('maximum source budget remains reimportable with export tools', async () => {
  const p = project([file('large.txt', 'x'.repeat(CODE_BYTES))]);
  const imported = importCodeFiles(await readCodeZip(await zipFiles(codeExportFiles(p, runner)).arrayBuffer()));
  assert.equal(imported.project.files[0].content.length, CODE_BYTES);
});

test('excluded dependencies do not consume source count or change behavior with ordering', async () => {
  const ignored = Array.from({ length: 403 }, (_, i) => ({ name: `node_modules/${i}.js`, content: 'dependency' }));
  for (const files of [[...ignored, { name: 'app.js', content: '42' }], [{ name: 'app.js', content: '42' }, ...ignored]]) {
    const imported = importCodeFiles(await readCodeZip(await zipFiles(files).arrayBuffer()));
    assert.deepEqual(imported.project.files, [file('app.js', '42')]); assert.equal(imported.skipped.length, 403);
  }
});

test('portable paths, file/directory conflicts, credentials and malformed tasks are rejected', () => {
  for (const p of ['../escape', '/absolute', 'a\\b', 'C:drive', 'NUL.txt', 'foo.', 'a?', 'a*', 'a"', 'a|b', 'a<b', 'a>b']) assert.throws(() => codePath(p));
  for (const paths of [['a','a/b'], ['A','a/b'], ['A','a'], ['.env'], ['secrets.pem']]) assert.throws(() => validateCodeProject(project(paths.map(p => file(p)))));
  assert.throws(() => codeExportFiles(project([file('vorlda-tools')]), runner));
  assert.throws(() => validateCodeProject(project([file('a')], [{ id: 'a', command: ['node'], cwd: '', dependsOn: ['b'] }, { id: 'b', command: ['node'], cwd: '', dependsOn: ['a'] }])));
  assert.throws(() => validateCodeProject(project([file('a')], [{ id: 'a', command: ['node'], cwd: '', dependsOn: ['missing'] }])));
  const imported = importCodeFiles([{ path: '.env', bytes: new TextEncoder().encode('SECRET=private') }, { path: 'src/a.js', bytes: new Uint8Array() }]);
  assert.deepEqual(imported.skipped, ['.env']); assert.equal(imported.project.files[0].path, 'src/a.js');
});

test('compressed ZIP input is read and corrupt checksums, local paths, links and oversized declarations fail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vorlda-zip-'));
  try {
    await exec('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED) as z:z.writestr("src/main.py","print(42)\\n")', join(dir, 'source.zip')]);
    const compressed = await readFile(join(dir, 'source.zip'));
    assert.equal(importCodeFiles(await readCodeZip(compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength))).project.files.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
  const original = new Uint8Array(await zipFiles([{ name: 'app.js', content: 'hello' }]).arrayBuffer());
  const central = original.findIndex((_, i) => i + 4 < original.length && new DataView(original.buffer).getUint32(i, true) === 0x02014b50);
  for (const mutate of [
    (b,v) => b[30] = 'z'.charCodeAt(0),
    (b,v) => v.setUint32(central + 16, 123, true),
    (b,v) => v.setUint32(central + 38, 0xa1ff0000, true),
    (b,v) => v.setUint32(central + 24, CODE_BYTES + 1, true),
  ]) { const bytes = original.slice(); mutate(bytes, new DataView(bytes.buffer)); await assert.rejects(readCodeZip(bytes.buffer)); }
});

test('framework detection reports requirements without running package scripts', () => {
  const p = project([file('web/package.json', JSON.stringify({ dependencies: { next: 'x', react: 'x', sharp: 'x' }, engines: { node: '>=22' }, scripts: { build: 'touch must-not-run' } })), file('api/go.mod', 'module app'), file('native/Cargo.toml', '[package]'), file('flow/package.json', '{"dependencies":{"n8n":"x"}}')]);
  const info = analyzeCodeProject(p); assert.ok(info.stacks.some(x => x.name === 'next + react')); assert.ok(info.stacks.some(x => x.name === 'Go')); assert.ok(info.stacks.some(x => x.name === 'Rust')); assert.ok(info.stacks.some(x => x.name === 'n8n')); assert.equal(info.tasks[0].cwd, 'web'); assert.ok(info.warnings.length);
});

test('n8n and Node-RED graphs retain originals and resolve graph edges without executing nodes', () => {
  const n8n={nodes:[{name:'Start',type:'n8n-nodes-base.manualTrigger',position:[0,0]},{name:'Code',type:'n8n-nodes-base.code',position:[300,0],parameters:{jsCode:'throw Error("must not execute")'}}],connections:{Start:{main:[[{node:'Code',type:'main',index:0}]]}}};
  const text=JSON.stringify(n8n), view=inspectFlow(text);assert.equal(view.format,'n8n');assert.deepEqual(view.edges,[{from:'Start',to:'Code'}]);assert.deepEqual(view.nodes[1].data,n8n.nodes[1]);assert.equal(JSON.stringify(n8n),text);
  const red=inspectFlow(JSON.stringify([{id:'a',type:'inject',x:20,y:30,wires:[['b','missing']]},{id:'b',type:'debug',x:200,y:30,wires:[]} ]));assert.equal(red.format,'Node-RED');assert.deepEqual(red.edges,[{from:'a',to:'b'}]);assert.equal(red.unresolved,1);
  assert.equal(inspectFlow('{"scripts":{}}'),null);assert.throws(()=>inspectFlow(JSON.stringify({...n8n,nodes:[n8n.nodes[0],n8n.nodes[0]]})));assert.throws(()=>inspectFlow(JSON.stringify({...n8n,nodes:Array.from({length:251},(_,i)=>({name:String(i),type:'test'}))})));
});

test('code nodes persist through draft, apply and project reload with tenant isolation', async () => {
  const f = fixture(); try {
    const g = emptyGraph(), node = makePiece('code'); node.props.workspace = codeSamples.python; g.pieces.push(node);
    const created = await client(f, '/api/projects', 'POST', { name: 'Python workspace', graph: g }); assert.equal(created.status, 201);
    const quote = await client(f, `/api/projects/${created.body.id}/quote`, 'POST', { graph: g, revision: 0 }); assert.equal(quote.status, 200);
    const applied = await client(f, '/api/quotes/apply', 'POST', { quoteId: quote.body.id, requestId: 'code-apply' }); assert.equal(applied.status, 200);
    const loaded = await client(f, `/api/projects/${created.body.id}`); assert.deepEqual(loaded.body.graph.pieces[0].props.workspace, codeSamples.python);
    assert.equal((await client(f, `/api/projects/${created.body.id}`, 'GET', undefined, otherHeaders)).status, 404);
  } finally { f.close(); }
});

test('exported Node, Python and C examples execute their real toolchains outside VORLDA', async () => {
  for (const [kind, task] of [['node','test'], ['python','run'], ['c','run']]) {
    const dir = await materialize(codeSamples[kind]); try {
      const denied = await exec(process.execPath, ['vorlda-tools/run.mjs', 'run', task], { cwd: dir }).then(() => null, e => e); assert.ok(denied); assert.match(denied.stderr, /allow-commands/);
      const result = await exec(process.execPath, ['vorlda-tools/run.mjs', 'run', task, '--allow-commands'], { cwd: dir, timeout: 20000 }); assert.match(result.stdout, /"status":"completed"/); assert.match(result.stdout, new RegExp('"architecture":"'+process.arch+'"'));
      if (kind === 'python') assert.match(result.stdout, /60/); if (kind === 'c') assert.match(result.stdout, /Hello from C/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('task DAG executes shared dependencies once and supports real concurrent ready nodes', async () => {
  const p = project([file('work.mjs', 'import {appendFile,readFile} from "node:fs/promises";const id=process.argv[2];await appendFile("events",id+":start\\n");if(id==="a"||id==="b"){const other=id==="a"?"b":"a";const until=Date.now()+5000;while(!(await readFile("events","utf8")).includes(other+":start")){if(Date.now()>until)throw Error("Peer did not start concurrently");await new Promise(r=>setTimeout(r,10));}}await appendFile("events",id+":end\\n");')], [
    { id: 'base', command: ['node','work.mjs','base'], dependsOn: [], cwd: '' },
    { id: 'a', command: ['node','work.mjs','a'], dependsOn: ['base'], cwd: '' },
    { id: 'b', command: ['node','work.mjs','b'], dependsOn: ['base'], cwd: '' },
    { id: 'join', command: ['node','work.mjs','join'], dependsOn: ['a','b'], cwd: '' },
  ]);
  const dir = await materialize(p); try { await exec(process.execPath, ['vorlda-tools/run.mjs','run','join','--allow-commands','--parallel=2'], { cwd: dir, timeout: 10000 }); const log = await readFile(join(dir,'events'),'utf8'); assert.equal(log.match(/base:start/g).length,1); assert.ok(log.indexOf('b:start') < log.indexOf('a:end')); assert.ok(log.indexOf('a:start') < log.indexOf('b:end')); assert.ok(log.indexOf('join:start') > log.indexOf('a:end')); } finally { await rm(dir,{recursive:true,force:true}); }
});

test('failed tasks block dependents and a runner interruption stops its POSIX process group', async () => {
  const failProject = project([file('fail.mjs', 'process.exit(7)'), file('next.mjs', 'import {writeFileSync} from "node:fs";writeFileSync("must-not-exist","bad")')], [{ id:'fail',command:['node','fail.mjs'],dependsOn:[],cwd:'' },{ id:'next',command:['node','next.mjs'],dependsOn:['fail'],cwd:'' }]);
  const failedDir = await materialize(failProject);
  try { await assert.rejects(exec(process.execPath,['vorlda-tools/run.mjs','run','next','--allow-commands'],{cwd:failedDir,timeout:5000})); await assert.rejects(readFile(join(failedDir,'must-not-exist'))); } finally { await rm(failedDir,{recursive:true,force:true}); }
  if(process.platform==='win32') return;
  const p=project([file('long.mjs','import {appendFileSync} from "node:fs";console.log("CHILD_PID="+process.pid);setInterval(()=>appendFileSync("ticks","x"),20);')],[{id:'long',command:['node','long.mjs'],dependsOn:[],cwd:''}]);
  const dir=await materialize(p);let childPid;const proc=spawn(process.execPath,['vorlda-tools/run.mjs','run','long','--allow-commands'],{cwd:dir,stdio:['ignore','pipe','pipe']});
  try { await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error('Child did not start')),3000);proc.stdout.on('data',d=>{const m=String(d).match(/CHILD_PID=(\d+)/);if(m){childPid=Number(m[1]);clearTimeout(timer);ok();}});proc.once('error',fail);});
    await new Promise(r=>setTimeout(r,80));const closed=new Promise(r=>proc.once('close',r));proc.kill('SIGTERM');await closed;const before=await readFile(join(dir,'ticks'),'utf8');await new Promise(r=>setTimeout(r,120));assert.equal(await readFile(join(dir,'ticks'),'utf8'),before);
  } finally {proc.kill('SIGKILL');if(childPid){try{process.kill(-childPid,'SIGKILL')}catch{}}await rm(dir,{recursive:true,force:true});}
});
