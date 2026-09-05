import { ApiError, db, json, body, identifier, cleanName, now, type Env } from './db.ts';
import { type User } from './auth.ts';
import { entitlement } from './entitlements.ts';
import { id, validateGraph } from '../lib/world.ts';
import { loadJson,storeJson } from './payloads.ts';
function validateData(kind: string, data: any) {
    if (kind === 'preset') {
        let g; try { g=validateGraph(data); } catch { throw new ApiError(400,'Invalid project preset.'); }
        // Presets must not silently copy another project's private media links.
        if (/\/api\/assets\//.test(JSON.stringify(g))) throw new ApiError(400,'Remove project-specific media before saving this reusable preset. Original media stays in its project.');
        return g;
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.colors) || !data.colors.length || data.colors.length>8 || data.colors.some((x:any)=>typeof x!=='string'||!/^#[0-9a-f]{6}$/i.test(x))) throw new ApiError(400,'Choose between one and eight hex brand colors.');
    return {colors:data.colors,font:cleanName(data.font||'Arial',80),instructions:typeof data.instructions==='string'?data.instructions.slice(0,2000):''};
}
export async function resourceApi(request:Request,env:Env,user:User):Promise<Response|null>{
    const path=new URL(request.url).pathname,match=path.match(/^\/api\/resources(?:\/([-\w]+))?$/);if(!match)return null;
    if(user.token)throw new ApiError(403,'Sign in to manage reusable resources.');
    const key=match[1],method=request.method;
    if(method==='GET'&&!key){const rows=await db(env).prepare("SELECT id,kind,name,revision,created_at,updated_at,CASE WHEN kind='brand' THEN data ELSE NULL END AS data FROM studio_resources WHERE owner=? ORDER BY updated_at DESC LIMIT 600").bind(user.id).all<any>();return json({items:await Promise.all(rows.results.map(async x=>({...x,data:x.data?await loadJson(env,'resources/'+x.id,x.data):undefined}))),entitlement:await entitlement(env,user.id)});}
    const prior=key?await db(env).prepare('SELECT * FROM studio_resources WHERE id=? AND owner=?').bind(key,user.id).first<any>():null;
    if(key&&!prior)throw new ApiError(404,'Resource not found.');
    if(method==='GET'&&prior)return json({...prior,data:await loadJson(env,'resources/'+prior.id,prior.data)});
    if(method==='DELETE'&&prior){await db(env).prepare('DELETE FROM studio_resources WHERE id=? AND owner=?').bind(key,user.id).run();return json({deleted:true});}
    if(method==='POST'&&!key||method==='PUT'&&prior){
        const b=await body(request),kind=prior?.kind||b.kind;
        if(!['preset','brand'].includes(kind))throw new ApiError(400,'Choose a preset or brand kit.');
        const e=await entitlement(env,user.id),limit=kind==='preset'?e.presets:e.brands;
        if(!limit)throw new ApiError(403,kind==='preset'?'Saved production presets require Starter or above.':'Brand kits require Pro or Studio.');
        const validated=validateData(kind,b.data),name=cleanName(b.name,100),time=now();
        if(prior && (!Number.isInteger(b.revision)||b.revision!==prior.revision))throw new ApiError(409,'This resource changed or its revision is missing. Reload before editing.');
        if(!prior){const count=await db(env).prepare('SELECT COUNT(*) AS n FROM studio_resources WHERE owner=? AND kind=?').bind(user.id,kind).first<any>();if(count.n>=limit)throw new ApiError(409,'Your plan resource limit has been reached.');}
        const resourceId=key||id(),data=await storeJson(env,'resources/'+resourceId,validated);
        if(prior){if(!Number.isInteger(b.revision))throw new ApiError(400,'A resource revision is required.');const r=await db(env).prepare('UPDATE studio_resources SET name=?,data=?,revision=revision+1,updated_at=? WHERE id=? AND owner=? AND revision=?').bind(name,data,time,key,user.id,b.revision).run();if(!r.meta.changes)throw new ApiError(409,'This resource changed. Reload before editing.');return json({saved:true});}
        const newId=resourceId,r=await db(env).prepare('INSERT INTO studio_resources(id,owner,kind,name,data,revision,created_at,updated_at) SELECT ?,?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM studio_resources WHERE owner=? AND kind=?)<?').bind(newId,user.id,kind,name,data,time,time,user.id,kind,limit).run();
        if(!r.meta.changes)throw new ApiError(409,'Your plan resource limit has been reached.');return json({id:newId},201);
    }throw new ApiError(405,'Unsupported resource action.');
}
