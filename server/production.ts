import { ApiError, db, json, body, identifier, now, billingMode, setting, type Env } from './db.ts';
import { projectAccess, requireAdmin, type User } from './auth.ts';
import { entitlement, reserveStorage, releaseStorage } from './entitlements.ts';
import { id, validateGraph } from '../lib/world.ts';
import { compileHTML } from '../lib/compiler.ts';
import { loadJson } from './payloads.ts';
import { testTariffs, type Tariffs } from '../lib/money.ts';
type Task = {id:string;owner:string;actor:string;project_id:string;request_id:string;mode:string;kind:string;status:string;input:string;amount:number;from_subscription:number;from_topup:number;provider_id:string|null;output:string|null;error:string|null;created_at:string;updated_at:string};
export const productionReady = (env:Env) => billingMode(env)==='live' && typeof env.REPLICATE_API_TOKEN==='string' && env.REPLICATE_API_TOKEN.length>10 && typeof env.REPLICATE_WEBHOOK_SECRET==='string' && env.REPLICATE_WEBHOOK_SECRET.length>=32 && typeof env.APP_ORIGIN==='string' && /^https:\/\//.test(env.APP_ORIGIN);
async function callbackKey(env:Env,usage:KeyUsage[]){if(typeof env.REPLICATE_WEBHOOK_SECRET!=='string'||env.REPLICATE_WEBHOOK_SECRET.length<32)throw new ApiError(503,'Generation callbacks are not configured.');return crypto.subtle.importKey('raw',new TextEncoder().encode(env.REPLICATE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,usage);}
export async function callbackToken(env:Env,taskId:string){const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',await callbackKey(env,['sign']),new TextEncoder().encode(taskId)));return Array.from(bytes).map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function productionCallback(request:Request,env:Env):Promise<Response|null>{
    const url=new URL(request.url),m=url.pathname.match(/^\/api\/production\/callback\/([-\w]+)$/);if(!m)return null;
    if(request.method!=='POST')throw new ApiError(405,'POST required.');const token=url.searchParams.get('token')||'';
    if(!/^[a-f0-9]{64}$/.test(token)||!await crypto.subtle.verify('HMAC',await callbackKey(env,['verify']),Uint8Array.from(token.match(/../g)!.map(s=>parseInt(s,16))),new TextEncoder().encode(m[1])))throw new ApiError(403,'Invalid generation callback.');
    const t=await task(env,m[1]);if(!t||t.kind!=='image'||t.mode!=='live')throw new ApiError(404,'Operation not found.');if(['completed','failed'].includes(t.status))return json({received:true});
    const b=await body(request,200000),key=identifier(b.id);if(t.provider_id&&t.provider_id!==key)throw new ApiError(400,'Provider receipt mismatch.');
    // Fetch authoritative status with the server credential. Callback payloads cannot dictate output or refunds.
    const prediction=await provider(env,'predictions/'+encodeURIComponent(key));
    if(prediction.id!==key)throw new ApiError(400,'Provider receipt mismatch.');
    if(!t.provider_id){const input=JSON.parse(t.input);if(prediction.model!=='black-forest-labs/flux-1.1-pro'||prediction.input?.prompt!==input.prompt)throw new ApiError(400,'Provider operation does not match.');await db(env).prepare("UPDATE production_tasks SET provider_id=?,status='running',updated_at=? WHERE id=? AND provider_id IS NULL AND status IN ('starting','uncertain')").bind(key,now(),t.id).run();}
    await deliver(env,{...t,provider_id:key},prediction);return json({received:true});
}
const activeStates="('reserved','starting','running','delivering','uncertain')";
async function task(env:Env,key:string){return db(env).prepare('SELECT * FROM production_tasks WHERE id=?').bind(key).first<Task>();}
async function provider(env:Env,path:string,input?:unknown){
    const r=await fetch('https://api.replicate.com/v1/'+path,{method:input?'POST':'GET',headers:{Authorization:`Bearer ${env.REPLICATE_API_TOKEN}`,...(input?{'Content-Type':'application/json'}:{})},body:input?JSON.stringify(input):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new ApiError(r.status>=500?502:422,'The model provider could not accept this request.');return await r.json() as any;
}
export async function failTask(env:Env,t:Task,message:string){
    const nonce=id(),stamp=now();
    await db(env).batch([
        db(env).prepare(`INSERT INTO ledger(id,owner,mode,project_id,operation_id,event_key,kind,amount,description,created_at) SELECT ?,owner,mode,project_id,id,?,'refund',amount,?,? FROM production_tasks WHERE id=? AND status IN ${activeStates} ON CONFLICT(event_key) DO NOTHING`).bind(nonce,'task-refund:'+t.id,message,stamp,t.id),
        db(env).prepare('UPDATE wallets SET subscription=subscription+?,topup=topup+?,updated_at=? WHERE owner=? AND mode=? AND EXISTS(SELECT 1 FROM ledger WHERE id=?)').bind(t.from_subscription,t.from_topup,stamp,t.owner,t.mode,nonce),
        db(env).prepare("UPDATE production_tasks SET status='failed',error=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM ledger WHERE id=?)").bind(message,stamp,t.id,nonce)
    ]);
}
async function deliver(env:Env,t:Task,prediction:any){
    if(['failed','canceled'].includes(prediction.status)){await failTask(env,t,'Generation failed. The reserved balance was returned.');return;}
    if(prediction.status!=='succeeded')return;
    const output=Array.isArray(prediction.output)?prediction.output[0]:prediction.output;
    let url:URL;try{url=new URL(output);}catch{await failTask(env,t,'The provider returned no usable image.');return;}
    if(url.protocol!=='https:'||!(url.hostname==='replicate.delivery'||url.hostname.endsWith('.replicate.delivery'))){await failTask(env,t,'The provider returned an unsupported image address.');return;}
    // One delivery lease. An interrupted lease can safely be reclaimed after two minutes.
    const stamp=now(),claim=await db(env).prepare("UPDATE production_tasks SET status='delivering',updated_at=? WHERE id=? AND (status='running' OR (status='delivering' AND updated_at<?))").bind(stamp,t.id,new Date(Date.now()-120000).toISOString()).run();if(!claim.meta.changes)return;
    let reservation:string|undefined;const assetId='generated_'+t.id,objectKey=`projects/${t.project_id}/${assetId}`;
    try{
        const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)}),type=response.headers.get('content-type')?.split(';')[0]||'';
        if(!response.ok||!['image/png','image/jpeg','image/webp'].includes(type)||!response.body)throw Error('The generated image could not be downloaded.');
        const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
        for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>25*1024*1024){await reader.cancel();throw Error('Generated image exceeds the supported file limit.');}chunks.push(r.value);}
        reservation=await reserveStorage(env,t.owner,t.project_id,size);const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:type}});
        const name='Generated image.'+(type==='image/jpeg'?'jpg':type.split('/')[1]),result=JSON.stringify({assetId,url:'/api/assets/'+assetId,name});
        await db(env).batch([
            db(env).prepare("INSERT INTO assets(id,owner,project_id,name,object_key,content_type,size,source,metadata,created_at) VALUES(?,?,?,?,?,?,?,'generation','{}',?) ON CONFLICT(id) DO NOTHING").bind(assetId,t.owner,t.project_id,name,objectKey,type,size,now()),
            db(env).prepare("UPDATE production_tasks SET status='completed',output=?,updated_at=? WHERE id=? AND status='delivering'").bind(result,now(),t.id),
            db(env).prepare('DELETE FROM resource_reservations WHERE id=?').bind(reservation)
        ]);
    }catch(e){if(reservation)await releaseStorage(env,reservation);await env.BUCKET.delete(objectKey);await failTask(env,t,e instanceof Error?e.message:'Image delivery failed.');}
}
async function start(env:Env,t:Task){
    const claim=await db(env).prepare("UPDATE production_tasks SET status='starting',updated_at=? WHERE id=? AND status='reserved'").bind(now(),t.id).run();if(!claim.meta.changes)return;
    if(t.kind==='billing-test'){
        await db(env).prepare("UPDATE production_tasks SET status='completed',output=?,updated_at=? WHERE id=?").bind(JSON.stringify({message:'Billing test completed. No model call or generated image.'}),now(),t.id).run();return;
    }
    try{
        const input=JSON.parse(t.input),webhook=new URL('/api/production/callback/'+t.id,env.APP_ORIGIN);webhook.searchParams.set('token',await callbackToken(env,t.id));
        const result=await provider(env,'models/black-forest-labs/flux-1.1-pro/predictions',{input:{prompt:input.prompt,aspect_ratio:input.aspect,output_format:'png',safety_tolerance:2},webhook:webhook.href,webhook_events_filter:['completed']});
        if(typeof result.id!=='string'||!/^[-a-zA-Z0-9_]+$/.test(result.id))throw Error('Provider receipt missing.');
        await db(env).prepare("UPDATE production_tasks SET status='running',provider_id=?,updated_at=? WHERE id=? AND status IN ('starting','uncertain')").bind(result.id,now(),t.id).run();await deliver(env,{...t,status:'running',provider_id:result.id},result);
    }catch(e){
        // A network timeout may occur after the provider accepted the operation. Never retry a paid POST blindly.
        if(e instanceof ApiError && e.status===422)await failTask(env,t,e.message);
        else await db(env).prepare("UPDATE production_tasks SET status='uncertain',error=?,updated_at=? WHERE id=? AND status='starting'").bind('Provider acknowledgement is uncertain. Owner review is required; no automatic retry.',now(),t.id).run();
    }
}
export async function productionApi(request:Request,env:Env,user:User):Promise<Response|null>{
    const path=new URL(request.url).pathname,method=request.method;
    if(path==='/api/admin/production'&&method==='GET'){requireAdmin(user);return json((await db(env).prepare("SELECT id,project_id,kind,status,amount,error,created_at FROM production_tasks WHERE status='uncertain' OR (status='starting' AND updated_at<?) ORDER BY created_at DESC LIMIT 100").bind(new Date(Date.now()-120000).toISOString()).all()).results);}
    const review=path.match(/^\/api\/admin\/production\/([-\w]+)\/refund$/);
    if(review&&method==='POST'){requireAdmin(user);const b=await body(request,4000),t=await task(env,review[1]);if(!t)throw new ApiError(404,'Operation not found.');if(typeof b.reason!=='string'||b.reason.trim().length<10)throw new ApiError(400,'Record the reason for this reviewed refund.');if(!['uncertain','starting','failed'].includes(t.status))throw new ApiError(409,'This operation is not awaiting manual settlement.');if(t.status==='starting'&&Date.now()-Date.parse(t.updated_at)<120000)throw new ApiError(409,'The provider may still be acknowledging this operation.');await failTask(env,t,'Owner-reviewed refund: '+b.reason.trim().slice(0,1000));return json({reviewed:true});}
    const match=path.match(/^\/api\/projects\/([-\w]+)\/production(?:\/(quote|execute|batch-export|[-\w]+))?$/);if(!match)return null;
    if(user.token)throw new ApiError(403,'Production currently requires an interactive account.');
    const p=await projectAccess(env,user,match[1],method!=='GET'),action=match[2]||'',ent=await entitlement(env,p.owner),mode=billingMode(env);
    if(p.archived&&method!=='GET')throw new ApiError(409,'Restore the project first.');
    if(!action&&method==='GET')return json({tasks:(await db(env).prepare('SELECT * FROM production_tasks WHERE project_id=? AND mode=? ORDER BY created_at DESC LIMIT 100').bind(p.id,mode).all()).results,entitlement:ent,providerReady:productionReady(env)});
    if(action==='batch-export'&&method==='POST'){
        const b=await body(request,10000);if(!Array.isArray(b.projectIds)||!b.projectIds.length||b.projectIds.length>ent.batch)throw new ApiError(403,`Your plan allows up to ${ent.batch} projects in one batch.`);
        const files=[];let total=0;
        for(const key of [...new Set(b.projectIds)] as string[]){const item=await projectAccess(env,user,identifier(key));if(item.owner!==p.owner)throw new ApiError(403,'A batch must belong to one workspace.');const g=validateGraph(await loadJson(env,'projects/'+item.id,item.graph));if(!item.revision)throw new ApiError(409,'Apply each project before batch export.');if(/\/api\/assets\//.test(JSON.stringify(g)))throw new ApiError(409,'Export projects containing private media individually to embed their original assets.');const content=compileHTML(g,{title:item.name});total+=content.length;if(total>10000000)throw new ApiError(413,'This batch is too large. Export fewer projects.');files.push({name:item.name.replace(/[^\p{L}\p{N}_-]/gu,'_')+'-'+item.id.slice(0,6)+'.html',content});}return json({files});
    }
    if(action==='quote'&&method==='POST'){
        const b=await body(request,16000),kind=b.kind=== 'billing-test'?'billing-test':'image';
        if(kind==='billing-test'&&mode!=='test')throw new ApiError(403,'Billing tests are only available in test mode.');
        if(kind==='image'&&!productionReady(env))throw new ApiError(409,'Image generation is not connected yet. Your wallet has not been charged.');
        const tariffs=await setting<Tariffs>(env,'tariffs',testTariffs);if(mode==='live'&&!tariffs.approved)throw new ApiError(409,'Image pricing must be approved before execution.');
        const prompt=String(b.prompt||'').trim(),aspect=String(b.aspect||'1:1');if(kind==='image'&&(!prompt||prompt.length>4000)||!['1:1','16:9','9:16','4:3','3:4'].includes(aspect))throw new ApiError(400,'Enter a description up to 4,000 characters and choose a supported aspect ratio.');
        if(!Number.isSafeInteger(tariffs.run)||tariffs.run<1)throw new ApiError(409,'The image price has not been configured.');
        const key=id(),expires=Date.now()+300000,payload=JSON.stringify({kind,prompt,aspect});
        await db(env).prepare('INSERT INTO quotes(id,owner,project_id,revision,draft_revision,mode,kind,payload,amount,details,pricing_revision,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(key,user.id,p.id,p.revision,p.draft_revision,mode,'production',payload,tariffs.run,'{}',tariffs.revision,expires,now()).run();return json({id:key,amount:tariffs.run,kind,expiresAt:expires,billedTo:p.owner===user.id?'your_wallet':'project_owner'});
    }
    if(action==='execute'&&method==='POST'){
        const b=await body(request,2000),key=identifier(b.quoteId),q=await db(env).prepare("SELECT * FROM quotes WHERE id=? AND owner=? AND project_id=? AND kind='production'").bind(key,user.id,p.id).first<any>();if(!q)throw new ApiError(404,'Quote not found.');
        if(q.mode!==mode)throw new ApiError(409,'Billing mode changed. Review a fresh quote.');
        const existing=await db(env).prepare('SELECT * FROM production_tasks WHERE actor=? AND request_id=?').bind(user.id,key).first<Task>();if(existing){if(existing.status==='reserved')await start(env,existing);return json(await task(env,existing.id));}
        if(q.used||q.expires_at<Date.now()||q.mode!==mode)throw new ApiError(409,'This quote expired. Review a new one.');const input=JSON.parse(q.payload);
        if(input.kind==='image'&&!productionReady(env))throw new ApiError(409,'The image provider is unavailable.');if(input.kind==='billing-test'&&mode!=='test')throw new ApiError(403,'Test execution is disabled.');
        const member=p.role==='owner'?null:await db(env).prepare('SELECT b.monthly_limit FROM members m LEFT JOIN member_budgets b ON b.member_id=m.id WHERE m.project_id=? AND m.email=?').bind(p.id,user.email).first<any>();
        if(p.role!=='owner'&&(!member?.monthly_limit||q.amount>member.monthly_limit))throw new ApiError(403,'The project owner must assign you a spending allowance.');
        const taskId=id(),stamp=now(),month=stamp.slice(0,7)+'-01T00:00:00.000Z',allowance=member?.monthly_limit??Number.MAX_SAFE_INTEGER,condition='EXISTS(SELECT 1 FROM production_tasks WHERE id=?)';
        const result=await db(env).batch([
            db(env).prepare(`INSERT INTO production_tasks(id,owner,actor,project_id,request_id,mode,kind,status,input,amount,from_subscription,from_topup,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'reserved',?,?,MIN(w.subscription,?),?-MIN(w.subscription,?),?,? FROM wallets w JOIN quotes q ON q.id=? WHERE w.owner=? AND w.mode=? AND w.subscription+w.topup>=? AND q.used=0 AND q.expires_at>? AND (SELECT COUNT(*) FROM production_tasks WHERE owner=? AND mode=? AND status IN ${activeStates})<? AND (?=1 OR COALESCE((SELECT SUM(amount) FROM production_tasks WHERE actor=? AND project_id=? AND created_at>=? AND status!='failed' AND mode=?),0)+?<=?) ON CONFLICT(actor,request_id) DO NOTHING`).bind(taskId,p.owner,user.id,p.id,key,mode,input.kind,q.payload,q.amount,q.amount,q.amount,q.amount,stamp,stamp,key,p.owner,mode,q.amount,Date.now(),p.owner,mode,ent.concurrency,p.role==='owner'?1:0,user.id,p.id,month,mode,q.amount,allowance),
            db(env).prepare(`UPDATE wallets SET subscription=subscription-(SELECT from_subscription FROM production_tasks WHERE id=?),topup=topup-(SELECT from_topup FROM production_tasks WHERE id=?),updated_at=? WHERE owner=? AND mode=? AND ${condition}`).bind(taskId,taskId,stamp,p.owner,mode,taskId),
            db(env).prepare(`INSERT INTO ledger(id,owner,mode,project_id,operation_id,event_key,kind,amount,description,created_at) SELECT ?,?,?,?,?,?,'usage',?,?,? WHERE ${condition}`).bind(id(),p.owner,mode,p.id,taskId,'task:'+taskId,-q.amount,input.kind==='billing-test'?'Billing test — no image generated':'Image generation',stamp,taskId),
            db(env).prepare(`UPDATE quotes SET used=1 WHERE id=? AND ${condition}`).bind(key,taskId)
        ]);
        if(!result[0].meta.changes){const winner=await db(env).prepare('SELECT * FROM production_tasks WHERE actor=? AND request_id=?').bind(user.id,key).first<Task>();if(winner)return json(winner);throw new ApiError(409,'Insufficient balance, spending allowance, or available processing slots. No charge was made.');}
        const created=(await task(env,taskId))!;await start(env,created);return json(await task(env,taskId));
    }
    if(action&&method==='GET'){
        const t=await task(env,identifier(action));if(!t||t.project_id!==p.id)throw new ApiError(404,'Operation not found.');
        if(t.mode!==mode)return json(t);
        if(t.provider_id&&['running','delivering'].includes(t.status)){const result=await provider(env,'predictions/'+encodeURIComponent(t.provider_id));await deliver(env,t,result);}
        return json(await task(env,t.id));
    }throw new ApiError(405,'Unsupported production action.');
}
