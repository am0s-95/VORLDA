import { ApiError,db,json,body,identifier,now,billingMode,setting,setSetting,type Env } from './db.ts';
import { digest,requireAdmin,type User } from './auth.ts';
import { id } from '../lib/world.ts';
import { compileHTML } from '../lib/compiler.ts';
import { rateLimit } from './limits.ts';
import { storeJson,discardUncommittedProject } from './payloads.ts';
import { TEMPLATES,templateGraph } from './templates.ts';

const CAMPAIGN='welcome-2026-v1',GRANT=10_000_000;
export type CommercePolicy={templatesEnabled:boolean;welcomeEnabled:boolean;dailyGrantLimitMicros:number;totalGrantLimitMicros:number};
export async function commercePolicy(env:Env):Promise<CommercePolicy>{return setting(env,'commerce-'+billingMode(env),{templatesEnabled:billingMode(env)==='test',welcomeEnabled:billingMode(env)==='test',dailyGrantLimitMicros:100_000_000,totalGrantLimitMicros:1_000_000_000});}
export async function promotionStatus(env:Env,user:User){
    const mode=billingMode(env),policy=await commercePolicy(env),emailKey=await digest(user.email.trim().toLowerCase());
    const claimed=await db(env).prepare('SELECT id FROM promotion_claims WHERE mode=? AND campaign=? AND (owner=? OR email_key=?)').bind(mode,CAMPAIGN,user.id,emailKey).first();
    const row=await db(env).prepare('SELECT balance FROM promo_balances WHERE owner=? AND mode=?').bind(user.id,mode).first<any>();
    return {balance:row?.balance||0,claimed:!!claimed,available:policy.welcomeEnabled&&policy.templatesEnabled&&!claimed,amount:GRANT,eligibleFor:['templates'],campaign:CAMPAIGN};
}
export async function claimWelcome(env:Env,user:User){
    if(user.token)throw new ApiError(403,'Sign in to claim the welcome balance.');
    await rateLimit(env,user.id,'claim');
    const mode=billingMode(env),policy=await commercePolicy(env),emailKey=await digest(user.email.trim().toLowerCase());
    if(!user.email.trim()||!user.email.includes('@'))throw new ApiError(403,'An authenticated email is required.');
    const previous=await promotionStatus(env,user);if(previous.claimed)return {...previous,replayed:true};
    if(!policy.welcomeEnabled||!policy.templatesEnabled)throw new ApiError(409,'The welcome offer is not currently available.');
    const claimId=id(),time=now(),day=time.slice(0,10)+'T00:00:00.000Z';
    const condition='EXISTS(SELECT 1 FROM promotion_claims WHERE id=?)';
    const result=await db(env).batch([
        db(env).prepare(`INSERT INTO promotion_claims(id,owner,email_key,mode,campaign,amount,created_at)
            SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT SUM(amount) FROM promotion_claims WHERE mode=? AND campaign=?),0)+?<=?
            AND COALESCE((SELECT SUM(amount) FROM promotion_claims WHERE mode=? AND campaign=? AND created_at>=?),0)+?<=? ON CONFLICT DO NOTHING`)
            .bind(claimId,user.id,emailKey,mode,CAMPAIGN,GRANT,time,mode,CAMPAIGN,GRANT,policy.totalGrantLimitMicros,mode,CAMPAIGN,day,GRANT,policy.dailyGrantLimitMicros),
        db(env).prepare(`INSERT INTO promo_balances(id,owner,mode,balance) SELECT ?,?,?,? WHERE ${condition} ON CONFLICT(owner,mode) DO UPDATE SET balance=balance+excluded.balance`).bind(user.id+':'+mode,user.id,mode,GRANT,claimId),
        db(env).prepare(`INSERT INTO ledger(id,owner,mode,event_key,kind,amount,description,created_at) SELECT ?,?,?,?,'promotion',?,?,? WHERE ${condition}`).bind(id(),user.id,mode,'welcome:'+claimId,GRANT,'Welcome credit — eligible templates only; no cash value',time,claimId)
    ]);
    const status=await promotionStatus(env,user);
    if(!result[0].meta.changes&&!status.claimed)throw new ApiError(409,'The welcome offer budget is fully allocated. Please try later.');
    return {...status,replayed:!result[0].meta.changes};
}
async function purchase(env:Env,user:User,b:Record<string,any>){
    await rateLimit(env,user.id,'purchase');
    const requestId=identifier(b.requestId),templateId=identifier(b.templateId),mode=billingMode(env);
    const previous=await db(env).prepare('SELECT * FROM template_purchases WHERE owner=? AND mode=? AND request_id=?').bind(user.id,mode,requestId).first<any>();
    if(previous){if(previous.template_id!==templateId||previous.version!==b.version)throw new ApiError(409,'This request already belongs to a different purchase.');return {...previous,replayed:true};}
    const owned=await db(env).prepare('SELECT * FROM template_purchases WHERE owner=? AND mode=? AND template_id=? AND version=?').bind(user.id,mode,templateId,b.version??0).first<any>();
    if(owned)throw new ApiError(409,'This template is already purchased. Open its project from the template catalog without another purchase.');
    const spec=TEMPLATES.find(t=>t.id===templateId),policy=await commercePolicy(env);
    if(!spec)throw new ApiError(404,'Template not found.');
    if(!policy.templatesEnabled)throw new ApiError(409,'Template purchases are not enabled in this billing mode.');
    if(b.version!==spec.version||b.expectedAmount!==spec.amount)throw new ApiError(409,'Review the current template and its fixed price.');
    const w=await db(env).prepare('SELECT subscription+topup+COALESCE((SELECT balance FROM promo_balances WHERE owner=? AND mode=?),0) AS available FROM wallets WHERE owner=? AND mode=?').bind(user.id,mode,user.id,mode).first<any>();
    if(!w||w.available<spec.amount)throw new ApiError(409,'Insufficient balance. Add credit before creating this template.');
    const purchaseId=id(),projectId=id(),time=now(),graph=templateGraph(spec.id,b.language==='ar');
    const stored=await storeJson(env,'projects/'+projectId,graph,true,user.id),condition='EXISTS(SELECT 1 FROM template_purchases WHERE id=?)';
    const promo='COALESCE(pb.balance,0)',fromPromo=`MIN(${promo},?)`,afterPromo=`?-MIN(${promo},?)`;
    const result=await db(env).batch([
        db(env).prepare(`INSERT INTO template_purchases(id,owner,mode,request_id,template_id,version,project_id,amount,from_promo,from_subscription,from_topup,created_at)
            SELECT ?,?,?,?,?,?,?,?,${fromPromo},MIN(w.subscription,${afterPromo}),MAX(0,${afterPromo}-w.subscription),?
            FROM wallets w LEFT JOIN promo_balances pb ON pb.owner=w.owner AND pb.mode=w.mode
            WHERE w.owner=? AND w.mode=? AND w.subscription+w.topup+${promo}>=? ON CONFLICT DO NOTHING`)
            .bind(purchaseId,user.id,mode,requestId,spec.id,spec.version,projectId,spec.amount,spec.amount,spec.amount,spec.amount,spec.amount,spec.amount,time,user.id,mode,spec.amount),
        db(env).prepare(`UPDATE promo_balances SET balance=balance-(SELECT from_promo FROM template_purchases WHERE id=?) WHERE owner=? AND mode=? AND ${condition}`).bind(purchaseId,user.id,mode,purchaseId),
        db(env).prepare(`UPDATE wallets SET subscription=subscription-(SELECT from_subscription FROM template_purchases WHERE id=?),topup=topup-(SELECT from_topup FROM template_purchases WHERE id=?),updated_at=? WHERE owner=? AND mode=? AND ${condition}`).bind(purchaseId,purchaseId,time,user.id,mode,purchaseId),
        db(env).prepare(`INSERT INTO projects(id,owner,name,graph,draft,revision,draft_revision,created_at,updated_at) SELECT ?,?,?,?,?,1,1,?,? WHERE ${condition}`).bind(projectId,user.id,b.language==='ar'?spec.ar:spec.name,stored,stored,time,time,purchaseId),
        db(env).prepare(`INSERT INTO snapshots(id,project_id,graph,label,revision,actor,created_at) SELECT ?,?,?,?,1,?,? WHERE ${condition}`).bind(id(),projectId,stored,'Purchased template v'+spec.version,user.id,time,purchaseId),
        db(env).prepare(`INSERT INTO ledger(id,owner,mode,project_id,event_key,kind,amount,description,created_at) SELECT ?,?,?,?,?,'template',?,?,? WHERE ${condition}`).bind(id(),user.id,mode,projectId,'template:'+purchaseId,-spec.amount,'Template: '+spec.name+' v'+spec.version+' — delivered once',time,purchaseId)
    ]);
    if(!result[0].meta.changes)await discardUncommittedProject(env,user.id,projectId);
    const requestWinner=await db(env).prepare('SELECT template_id,version FROM template_purchases WHERE owner=? AND mode=? AND request_id=?').bind(user.id,mode,requestId).first<any>();
    if(requestWinner&&(requestWinner.template_id!==spec.id||requestWinner.version!==spec.version))throw new ApiError(409,'This request already belongs to a different purchase.');
    if(!result[0].meta.changes&&!requestWinner)throw new ApiError(409,'This template was already purchased, or the balance changed. Reload the catalog. No new charge was made.');
    const delivered=await db(env).prepare('SELECT * FROM template_purchases WHERE owner=? AND mode=? AND template_id=? AND version=?').bind(user.id,mode,spec.id,spec.version).first<any>();
    if(!delivered)throw new ApiError(409,'The balance or purchase changed. No charge was made.');
    return {...delivered,replayed:!result[0].meta.changes};
}
export async function commerceApi(request:Request,env:Env,user:User):Promise<Response|null>{
    const path=new URL(request.url).pathname,method=request.method;
    if(!['/api/templates','/api/templates/purchase','/api/wallet/welcome','/api/admin/commerce'].includes(path)&&!/^\/api\/templates\/[-\w]+\/preview$/.test(path))return null;
    if(user.token)throw new ApiError(403,'This action requires an interactive account.');
    if(path==='/api/admin/commerce'){
        requireAdmin(user);
        if(method==='GET')return json({policy:await commercePolicy(env),mode:billingMode(env),grant:GRANT});
        if(method==='PUT'){const b=await body(request,2000),p=b.policy as CommercePolicy;
            if(!p||typeof p.templatesEnabled!=='boolean'||typeof p.welcomeEnabled!=='boolean'||![p.dailyGrantLimitMicros,p.totalGrantLimitMicros].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=100_000_000_000))throw new ApiError(400,'Choose valid campaign limits.');
            await setSetting(env,'commerce-'+billingMode(env),{templatesEnabled:p.templatesEnabled,welcomeEnabled:p.welcomeEnabled,dailyGrantLimitMicros:p.dailyGrantLimitMicros,totalGrantLimitMicros:p.totalGrantLimitMicros});return json({saved:true});}
    }
    if(path==='/api/wallet/welcome'&&method==='POST')return json(await claimWelcome(env,user));
    if(path==='/api/templates/purchase'&&method==='POST')return json(await purchase(env,user,await body(request,2000)));
    if(path==='/api/templates'&&method==='GET'){
        const mode=billingMode(env),owned=(await db(env).prepare('SELECT template_id,version,project_id FROM template_purchases WHERE owner=? AND mode=?').bind(user.id,mode).all<any>()).results;
        return json({items:TEMPLATES.map(t=>({...t,projectId:owned.find(p=>p.template_id===t.id&&p.version===t.version)?.project_id})),enabled:(await commercePolicy(env)).templatesEnabled,mode});
    }
    const preview=path.match(/^\/api\/templates\/([-\w]+)\/preview$/);
    if(preview&&method==='GET'){const spec=TEMPLATES.find(t=>t.id===preview[1]);if(!spec)throw new ApiError(404,'Template not found.');return new Response(compileHTML(templateGraph(spec.id,new URL(request.url).searchParams.get('language')==='ar'),{title:spec.name}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'"}});}
    throw new ApiError(405,'Unsupported commerce action.');
}
