import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { rmSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { emptyGraph, makePiece, checkPublish } from '../lib/world.ts';
import { compileHTML } from '../lib/compiler.ts';
import { formFields, validateFormResponse, validateAllForms } from '../lib/forms.ts';
import { drawScene, sceneMediaParts } from '../lib/media.ts';
import { deliveryIssues, moveIntoPage } from '../lib/workshop-flow.ts';
import { fixture, client, otherHeaders } from './support.mjs';
import { example, writePortable, runServer } from './portable-fixture.mjs';

function responsiveForm() {
  const p=example(),[page,form,desktop]=p.graph.pieces;
  page.mobile={w:390,h:844,style:{background:'#123456'}};
  desktop.props.field='desktop'; desktop.mobile={hidden:true};
  const mobile=makePiece('input',form.id); mobile.props={field:'mobile',inputType:'text',required:true}; mobile.hidden=true;mobile.mobile={hidden:false};
  p.graph.pieces.push(mobile);return {p,page,form,desktop,mobile};
}

// Executes the actual exported script with a deliberately limited DOM double.
// It verifies state/requests, not CSS layout, native validation or touch events.
function runtime(html,width) {
  const data=JSON.parse(html.match(/id="world-data">([\s\S]*?)<\/script>/)[1]);
  const scripts=html.match(/<script>([\s\S]*)<\/script>/)[1], events={},inputs=Object.fromEntries(data.inputs.map(x=>[x.id,{disabled:false}]));
  const screens=data.pages.map(p=>({dataset:{page:p.id},hidden:p.id!==data.entry||p.hidden,style:{},classList:{add(){},remove(){}},querySelectorAll(){return []}}));
  const document={getElementById(){return {textContent:JSON.stringify(data)}},querySelectorAll(s){return s==='[data-page]'?screens:[]},querySelector(s){const input=s.match(/^\[data-part="([^"]+)"\] input$/);if(input)return inputs[input[1]];const page=s.match(/^\[data-page="([^"]+)"\]$/);return page?screens.find(p=>p.dataset.page===page[1]):null},addEventListener(n,fn){events[n]=fn},dispatchEvent(){},body:{append(){}}};
  const context={document,innerWidth:width,addEventListener(n,fn){events[n]=fn},setTimeout(){},structuredClone,CustomEvent:class{},console};
  vm.runInNewContext(scripts,context);return {data,screens,inputs,events,context};
}

test('export carries effective phone page size, flow direction, spacing, ellipse shape and font',()=>{
  const {p,page}=responsiveForm(),group=makePiece('group',page.id),text=makePiece('text',group.id),shape=makePiece('shape',page.id);
  group.style.layout='row';group.mobile={style:{layout:'column',gap:7,padding:9}};text.style.fontFamily='Georgia';shape.props.shape='ellipse';p.graph.pieces.push(group,text,shape);
  const before=structuredClone(p.graph),html=compileHTML(p.graph);
  const pageCSS=html.match(new RegExp('\\[data-page="'+page.id+'"\\]\\{([^}]+)'))[1];
  assert.match(pageCSS,/--page-width:390px!important/);assert.match(pageCSS,/--page-height:844px!important/);assert.match(pageCSS,/background:#123456!important/);
  const groupCSS=html.match(new RegExp('\\[data-part="'+group.id+'"\\]\\{([^}]+)'))[1];
  assert.match(groupCSS,/flex-direction:column!important/);assert.match(groupCSS,/gap:7px!important/);assert.match(groupCSS,/padding:9px!important/);
  assert.doesNotMatch(pageCSS,/(?:^|;)overflow:/);assert.doesNotMatch(pageCSS,/(?:^|;)position:/);
  assert.match(html,/\.screen\.split-screen\[hidden\]\{display:none!important\}/);
  assert.match(html,/border-radius:50%/);assert.match(html,/font-family:Georgia/);assert.deepEqual(p.graph,before);
});

test('real runtime selects phone dimensions and toggles hidden input availability before submit',()=>{
  const {p,page,desktop,mobile}=responsiveForm();const r=runtime(compileHTML(p.graph),360),screen=r.screens.find(s=>s.dataset.page===page.id);
  assert.equal(screen.style.transform,'scale('+360/390+')');
  assert.equal(r.inputs[desktop.id].disabled,true);assert.equal(r.inputs[mobile.id].disabled,false);
  r.context.innerWidth=1000;r.events.resize();
  assert.equal(screen.style.transform,'scale(1)');assert.equal(r.inputs[desktop.id].disabled,false);assert.equal(r.inputs[mobile.id].disabled,true);
});

test('phone-only page and text survive output and initial visibility, then switch to a desktop page',()=>{
  const graph=emptyGraph(),phone=makePiece('page'),desktop=makePiece('page'),text=makePiece('text',phone.id);
  phone.hidden=true;phone.mobile={hidden:false,w:390};desktop.mobile={hidden:true};text.hidden=true;text.mobile={hidden:false};text.props.text='phone-only-result';graph.pieces.push(phone,desktop,text);graph.entries=[phone.id];
  const html=compileHTML(graph);assert.ok(html.includes('phone-only-result'));assert.equal(checkPublish(graph).some(i=>i.code==='NO_PAGE'),false);
  const r=runtime(html,390);assert.equal(r.screens[0].hidden,false);assert.equal(r.screens[1].hidden,true);
  r.context.innerWidth=1000;r.events.resize();assert.equal(r.screens[0].hidden,true);assert.equal(r.screens[1].hidden,false);
});

test('mobile-only media is included in the expanded export budget',()=>{
  const graph=emptyGraph(),page=makePiece('page');graph.pieces.push(page);
  for(let i=0;i<40;i++){const image=makePiece('image',page.id);image.hidden=true;image.mobile={hidden:false};image.props.src='/api/assets/large';graph.pieces.push(image);}
  assert.throws(()=>compileHTML(graph,{assetUrls:{'/api/assets/large':'data:image/png;base64,'+'AAAA'.repeat(300000)}}),/budget/);
});

test('form profiles retain required-field validation and reject hidden, unknown or invalid device input',()=>{
  const {p,form,desktop,mobile}=responsiveForm();
  assert.deepEqual(validateFormResponse(p.graph,form.id,{desktop:'yes'}),{desktop:'yes'});
  assert.deepEqual(validateFormResponse(p.graph,form.id,{mobile:'yes'},'mobile'),{mobile:'yes'});
  assert.throws(()=>validateFormResponse(p.graph,form.id,{},'mobile'),/required/);
  assert.throws(()=>validateFormResponse(p.graph,form.id,{desktop:'yes'},'mobile'),/Unknown/);
  for(const device of [null,'tablet','',{},false]) assert.throws(()=>validateFormResponse(p.graph,form.id,{},device),/device/);
  mobile.props.inputType='password';assert.throws(()=>validateAllForms(p.graph),/password/);mobile.props.inputType='text';
  desktop.mobile.hidden=false;mobile.props.field='desktop';assert.throws(()=>validateAllForms(p.graph),/duplicate/);
  form.mobile={hidden:true};assert.throws(()=>formFields(p.graph,form.id,'mobile'),/not found/);
});

test('hosted mobile submissions keep authentication, ownership and idempotency checks',async()=>{
  const f=fixture();try{
    const {p,form}=responsiveForm(),project=(await client(f,'/api/projects','POST',{name:'Phone forms',graph:p.graph})).body;
    const quote=(await client(f,'/api/projects/'+project.id+'/quote','POST',{graph:p.graph,revision:0})).body;
    assert.equal((await client(f,'/api/quotes/apply','POST',{quoteId:quote.id,requestId:'responsive-apply'})).status,200);
    const pub=await client(f,'/api/projects/'+project.id+'/publish','POST',{});assert.equal(pub.status,200);
    const body={pieceId:form.id,data:{mobile:'hello'},device:'mobile',requestId:'responsive-send'};
    assert.equal((await client(f,pub.body.url+'/submit','POST',body,otherHeaders)).status,404);
    assert.equal((await client(f,pub.body.url+'/submit','POST',body)).status,200);
    assert.equal((await client(f,pub.body.url+'/submit','POST',body)).status,200);
    assert.equal((await client(f,pub.body.url+'/submit','POST',{...body,data:{mobile:'changed'}})).status,409);
    assert.equal((await client(f,pub.body.url+'/submit','POST',{...body,device:'tablet'})).status,400);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n,1);
  }finally{f.close();}
});

test('portable mobile form rebuilds and runs independently without changing Origin and replay protection',async()=>{
  const {p,form}=responsiveForm(),dir=writePortable(p);let service;
  try{
    execFileSync(process.execPath,['build.mjs'],{cwd:dir,encoding:'utf8'});
    service=await runServer(dir);const body={pieceId:form.id,data:{mobile:'hello'},device:'mobile',requestId:'phone-response-001'};
    const post=(payload=body,origin=service.origin)=>fetch(service.origin+'/api/forms',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(payload)});
    assert.equal((await post(body,'https://foreign.example')).status,403);
    assert.equal((await post()).status,201);assert.equal((await post()).status,200);
    assert.equal((await post({...body,data:{mobile:'changed'}})).status,409);
    assert.equal((await post({...body,device:'bad'})).status,400);
  }finally{if(service)await service.stop();rmSync(dir,{recursive:true,force:true});}
});

test('outside-page repair preserves content, dimensions, responsive styles and graph history source',()=>{
  const graph=emptyGraph(),page=makePiece('page'),text=makePiece('text');text.props.text='recovered-visible-content';text.mobile={x:900,y:900,w:200,style:{fontSize:21}};graph.pieces.push(page,text);
  const before=structuredClone(graph);assert.equal(deliveryIssues(graph).filter(i=>i.code==='OUTSIDE_PAGE').length,1);
  assert.ok(!compileHTML(graph).includes('recovered-visible-content'));
  const moved=moveIntoPage(graph,text.id,page.id),result=moved.pieces.find(p=>p.id===text.id);
  assert.equal(deliveryIssues(moved).filter(i=>i.code==='OUTSIDE_PAGE').length,0);assert.ok(compileHTML(moved).includes('recovered-visible-content'));
  assert.equal(result.w,text.w);assert.equal(result.h,text.h);assert.deepEqual(result.props,text.props);assert.equal(result.mobile.w,200);assert.deepEqual(result.mobile.style,text.mobile.style);assert.deepEqual(graph,before);
  text.locked=true;assert.throws(()=>moveIntoPage(graph,text.id,page.id),/Unlock/);
  text.locked=false;page.hidden=true;assert.throws(()=>moveIntoPage(graph,text.id,page.id),/visible destination/);
});

test('media export scopes assets to the selected scene, resolves linked media and skips hidden ancestors',()=>{
  const graph=emptyGraph(),first=makePiece('page'),second=makePiece('page'),group=makePiece('group',first.id),hidden=makePiece('audio',group.id),outside=makePiece('audio',second.id),source=makePiece('image',second.id),linked=makePiece('image',first.id);
  group.hidden=true;source.props.src='/api/assets/source';linked.sourceId=source.id;linked.props={};graph.pieces.push(first,second,group,hidden,outside,source,linked);
  const selected=sceneMediaParts(graph,first);assert.deepEqual(selected.map(p=>p.id),[linked.id]);assert.equal(selected[0].props.src,'/api/assets/source');
  first.hidden=true;assert.deepEqual(sceneMediaParts(graph,first).map(p=>p.id),[linked.id]);
});

test('a portable rebuild refuses a newly introduced phone-only password field',()=>{
  const {p,mobile}=responsiveForm(),dir=writePortable(p);
  try{const path=dir+'/project.vorlda.json',project=JSON.parse(readFileSync(path,'utf8'));project.graph.pieces.find(p=>p.id===mobile.id).props.inputType='password';writeFileSync(path,JSON.stringify(project));assert.throws(()=>execFileSync(process.execPath,['build.mjs'],{cwd:dir,stdio:'pipe'}),/authentication|password/);}finally{rmSync(dir,{recursive:true,force:true});}
});

test('still/video draw commands follow flow padding and gap without counting hidden children',()=>{
  const graph=emptyGraph(),page=makePiece('page'),a=makePiece('text',page.id),hidden=makePiece('text',page.id),b=makePiece('text',page.id);
  page.style={...page.style,layout:'column',padding:10,gap:5};a.h=40;a.props.text='first';hidden.hidden=true;hidden.h=999;b.props.text='second';b.style.fontFamily='Georgia';graph.pieces.push(page,a,hidden,b);
  let x=0,y=0;const stack=[],drawn=[];
  const ctx={clearRect(){},fillRect(){},save(){stack.push([x,y])},restore(){[x,y]=stack.pop()},translate(dx,dy){x+=dx;y+=dy},rotate(){},scale(){},beginPath(){},roundRect(){},ellipse(){},clip(){},measureText(t){return {width:t.length*8}},fillText(text,dx,dy){drawn.push({text,x:x+dx,y:y+dy,font:this.font})},globalAlpha:1};
  drawScene(ctx,graph,page,new Map());assert.deepEqual(drawn.map(({text,x,y})=>({text,x,y})),[{text:'first',x:10,y:10},{text:'second',x:10,y:55}]);assert.match(drawn[1].font,/Georgia/);
});
