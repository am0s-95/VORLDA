import { ApiError, db, json, body, identifier, cleanName, now, billingMode, setting, setSetting, type Env, type Context } from './db.ts';
import { authenticate, projectAccess, requireAdmin, csrf, digest, type User } from './auth.ts';
import { getWallet, quoteGraph, applyQuote, grantFunds } from './wallet.ts';
import { checkout, portal, webhook } from './payments.ts';
import { id, emptyGraph, createAssembly, validateGraph, checkPublish, type Graph } from '../lib/world.ts';
import { validateFormResponse, validateAllForms } from '../lib/forms.ts';
import { compileHTML } from '../lib/compiler.ts';
import { draftPlans, PLAN_IDS, testTariffs, type Plan, type Tariffs } from '../lib/money.ts';
import { entitlement, storageUsage, reserveStorage, releaseStorage, requireStudio } from './entitlements.ts';
import { productionApi, productionReady, productionCallback } from './production.ts';
import { rateLimit, boundedFormData } from './limits.ts';
import { commerceApi } from './commerce.ts';
import { resourceApi } from './resources.ts';
import { isTier } from '../lib/plans.ts';
import { storeJson, loadJson, copyJson } from './payloads.ts';
const graph = (v: unknown) => { try {
    return validateGraph(v);
}
catch (e) {
    throw new ApiError(400, (e as Error).message);
} };
const htmlResponse = (html: string) => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; frame-src 'self' about:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'" } });
function noToken(user: User) { if (user.token)
    throw new ApiError(403, 'This action requires an interactive account.'); }
async function projectPayload(env: Env, p: any) {
    const [assets, snapshots, comments, members, publications, submissions, tokens] = await Promise.all([
        db(env).prepare('SELECT id,name,content_type,size,source,metadata,created_at FROM assets WHERE project_id=? ORDER BY created_at DESC').bind(p.id).all(),
        db(env).prepare('SELECT id,label,revision,actor,created_at FROM snapshots WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(p.id).all(),
        db(env).prepare('SELECT * FROM comments WHERE project_id=? ORDER BY created_at DESC LIMIT 200').bind(p.id).all(),
        db(env).prepare('SELECT m.id,m.email,m.role,COALESCE(b.monthly_limit,0) AS monthly_limit FROM members m LEFT JOIN member_budgets b ON b.member_id=m.id WHERE m.project_id=?').bind(p.id).all(),
        db(env).prepare('SELECT id,name,revision,enabled,created_at FROM publications WHERE project_id=? ORDER BY created_at DESC').bind(p.id).all(),
        db(env).prepare('SELECT * FROM submissions WHERE project_id=? ORDER BY created_at DESC LIMIT 200').bind(p.id).all(),
        db(env).prepare('SELECT id,name,scopes,max_charge,expires_at FROM api_tokens WHERE project_id=?').bind(p.id).all(),
    ]);
    const policies = await db(env).prepare('SELECT require_review FROM project_policies WHERE project_id=?').bind(p.id).first<any>();
    const reviews = await db(env).prepare('SELECT r.*,u.name FROM publication_reviews r JOIN users u ON u.id=r.author WHERE project_id=? AND revision=?').bind(p.id,p.revision).all();
    const graphValue=await loadJson(env,'projects/'+p.id,p.graph),draftValue=p.graph===p.draft?graphValue:await loadJson(env,'projects/'+p.id,p.draft);
    return { ...p, graph: graphValue, draft: draftValue, assets: assets.results, snapshots: snapshots.results, comments: comments.results, members: members.results, publications: publications.results, submissions: p.role === 'owner' ? submissions.results : [], tokens: p.role === 'owner' ? tokens.results : [], entitlement: await entitlement(env,p.owner), requireReview:!!policies?.require_review, reviews:reviews.results };
}
export async function handleApi(request: Request, env: Env, ctx: Context): Promise<Response | null> {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/api/') && !path.startsWith('/p/'))
        return null;
    try {
        if (path === '/api/payments/webhook' && request.method === 'POST')
            return json(await webhook(request, env));
        const callback = await productionCallback(request,env);
        if(callback) return callback;
        csrf(request);
        const user = await authenticate(request, env), method = request.method;
        await rateLimit(env,user.id,['GET','HEAD'].includes(method)?'read':'write');
        const commerceResponse=await commerceApi(request,env,user);
        if(commerceResponse)return commerceResponse;
        const resourceResponse = await resourceApi(request,env,user);
        if(resourceResponse) return resourceResponse;
        const productionResponse = await productionApi(request,env,user);
        if(productionResponse) return productionResponse;
        if(path === '/api/wallet/preview-plan' && method === 'POST') {
            noToken(user);
            if(billingMode(env) !== 'test') throw new ApiError(403,'Plan previews are available only in test mode.');
            const b = await body(request,1000);
            if(!isTier(b.planId)) throw new ApiError(400,'Choose one of the three plans or the wallet.');
            await db(env).prepare('INSERT INTO plan_trials(owner,plan_id,updated_at) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET plan_id=excluded.plan_id,updated_at=excluded.updated_at').bind(user.id,b.planId,now()).run();
            return json(await getWallet(env,user));
        }
        if(path === '/api/projects/archived' && method === 'GET') { noToken(user); return json((await db(env).prepare('SELECT id,name,updated_at FROM projects WHERE owner=? AND archived=1 ORDER BY updated_at DESC').bind(user.id).all()).results); }
        if (path === '/api/bootstrap' && method === 'GET') {
            noToken(user);
            const projects = await db(env).prepare('SELECT DISTINCT p.id,p.name,p.revision,p.updated_at,p.owner,CASE WHEN p.owner=? THEN ? ELSE m.role END AS role FROM projects p LEFT JOIN members m ON p.id=m.project_id WHERE (p.owner=? OR m.email=?) AND p.archived=0 ORDER BY p.updated_at DESC').bind(user.id, 'owner', user.id, user.email).all();
            return json({ user, projects: projects.results, wallet: await getWallet(env, user), capabilities: { generation: productionReady(env), reason: 'Connect an approved model provider to enable generation. Manual composition, storage and export are available.' } });
        }
        if (path === '/api/wallet' && method === 'GET') {
            noToken(user);
            return json(await getWallet(env, user));
        }
        if (path === '/api/wallet/test-grant' && method === 'POST') {
            noToken(user);
            if (billingMode(env) !== 'test')
                throw new ApiError(403, 'Test funding is unavailable in live mode.');
            await grantFunds(env, user.id, 'test', 100000000, 'topup', `test:initial:${user.id}`, 'One-time $100 test balance — no cash value');
            return json(await getWallet(env, user));
        }
        if (path === '/api/payments/checkout' && method === 'POST')
            return json(await checkout(env, user, await body(request, 5000)));
        if (path === '/api/payments/portal' && method === 'POST')
            return json(await portal(env, user));
        if (path === '/api/projects' && method === 'POST') {
            noToken(user);
            const b = await body(request), projectId = id(), name = cleanName(b.name || 'Untitled assembly'), draft = b.graph ? graph(b.graph) : createAssembly(b.kind || 'blank'), time = now();
            const storedDraft=await storeJson(env,'projects/'+projectId,draft,false,user.id),storedGraph=await storeJson(env,'projects/'+projectId,emptyGraph(),false,user.id);
            await db(env).prepare('INSERT INTO projects(id,owner,name,graph,draft,revision,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)').bind(projectId, user.id, name, storedGraph, storedDraft, time, time).run();
            return json(await projectPayload(env, await projectAccess(env, user, projectId)), 201);
        }
        if (path === '/api/quotes/apply' && method === 'POST') {
            const b = await body(request, 5000);
            return json(await applyQuote(env, user, identifier(b.quoteId), identifier(b.requestId)));
        }
        if (path === '/api/admin/settings') {
            requireAdmin(user);
            if (method === 'GET')
                return json({ plans: await setting(env, 'plans-v2', draftPlans), tariffs: {...await setting(env, 'tariffs', testTariffs),add:0,edit:0,connect:0,rule:0}, mode: billingMode(env), providerReady: productionReady(env), paymentsReady: !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET, paymentReviews: (await db(env).prepare("SELECT key,value FROM settings WHERE key LIKE 'payment_review:%'").all()).results });
            if (method === 'PUT') {
                const b = await body(request, 30000);
                if (!Array.isArray(b.plans) || b.plans.length !== 3 || new Set(b.plans.map((p: Plan) => p.id)).size !== 3 || b.plans.some((p: Plan) => !PLAN_IDS.includes(p.id)))
                    throw new ApiError(400, 'Exactly three subscription plans are required.');
                const plans = b.plans.map((p: Plan) => { if (![p.monthlyMicros, p.grantMicros].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 100000000000) || p.monthlyMicros % 10000 !== 0 || typeof p.active !== 'boolean' || typeof p.stripePriceId !== 'string' || p.stripePriceId && !/^price_[a-zA-Z0-9]+$/.test(p.stripePriceId))
                    throw new ApiError(400, 'Invalid plan amounts or provider price.'); if (p.active && (!p.monthlyMicros || !p.grantMicros || !p.stripePriceId))
                    throw new ApiError(400, 'An active plan needs its monthly price, dollar grant and provider price ID.'); return { ...p, name: cleanName(p.name, 50), description: cleanName(p.description, 160) }; });
                const old = await setting<Tariffs>(env, 'tariffs', testTariffs), t = b.tariffs as Tariffs;
                if (!t || !['add', 'edit', 'connect', 'rule', 'run'].every(k => Number.isSafeInteger(t[k as keyof Tariffs]) && Number(t[k as keyof Tariffs]) >= 0 && Number(t[k as keyof Tariffs]) <= 1000000000) || typeof t.approved !== 'boolean')
                    throw new ApiError(400, 'Invalid usage tariff.');
                await db(env).batch([db(env).prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind('plans-v2', JSON.stringify(plans), now()), db(env).prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind('tariffs', JSON.stringify({ ...t, add:0,edit:0,connect:0,rule:0,revision: old.revision + 1 }), now())]);
                return json({ saved: true });
            }
        }
        const assetMatch = path.match(/^\/api\/assets\/([-\w]+)$/);
        if (assetMatch) {
            const a = await db(env).prepare('SELECT * FROM assets WHERE id=?').bind(assetMatch[1]).first<any>();
            if (!a)
                throw new ApiError(404, 'Asset not found.');
            await projectAccess(env, user, a.project_id, method === 'DELETE');
            if (method === 'DELETE') {
                await env.BUCKET.delete(a.object_key);
                await db(env).prepare('DELETE FROM assets WHERE id=?').bind(a.id).run();
                return json({ deleted: true });
            }
            if (method === 'GET') {
                let range: {
                    offset: number;
                    length: number;
                } | undefined;
                const rangeHeader = request.headers.get('range');
                if (rangeHeader) {
                    const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
                    if (!m || (!m[1] && !m[2]))
                        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${a.size}` } });
                    const start = m[1] ? Number(m[1]) : Math.max(0, a.size - Number(m[2])), end = m[1] ? (m[2] ? Math.min(Number(m[2]), a.size - 1) : a.size - 1) : a.size - 1;
                    if (!Number.isSafeInteger(start) || start >= a.size || start > end)
                        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${a.size}` } });
                    range = { offset: start, length: end - start + 1 };
                }
                const file = await env.BUCKET.get(a.object_key, range ? { range } : undefined);
                if (!file)
                    throw new ApiError(404, 'Asset file not found.');
                const inline = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|audio\/)/.test(a.content_type);
                return new Response(file.body, { status: range ? 206 : 200, headers: { ...(range ? { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${a.size}` } : {}), 'Accept-Ranges': 'bytes', 'Content-Type': a.content_type, 'Content-Length': String(range ? range.length : file.size), 'Content-Disposition': `${inline && !url.searchParams.has('download') ? 'inline' : 'attachment'}; filename="${a.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
            }
        }
        const publicationMatch = path.match(/^\/p\/([-\w]+)(\/submit)?$/);
        if (publicationMatch) {
            const pub = await db(env).prepare('SELECT * FROM publications WHERE id=? AND enabled=1').bind(publicationMatch[1]).first<any>();
            if (!pub)
                throw new ApiError(404, 'This publication is unavailable.');
            await projectAccess(env, user, pub.project_id);
            const g = graph(await loadJson(env,'projects/'+pub.project_id,pub.graph));
            if (!publicationMatch[2] && method === 'GET')
                return htmlResponse(compileHTML(g, { title: pub.name, formEndpoint: `/p/${pub.id}/submit`, entry: url.searchParams.get('entry') || undefined }));
            if (publicationMatch[2] && method === 'POST') {
                const b = await body(request, 50000), form = g.pieces.find(p => p.id === b.pieceId && p.type === 'form');
                if (!form)
                    throw new ApiError(400, 'Form not found.');
                let data:Record<string,string>;try{data=validateFormResponse(g,form.id,b.data,b.device);}catch(e){throw new ApiError(400,(e as Error).message);}
                const requestId = identifier(b.requestId),submissionId=await digest(pub.id + ':' + user.id + ':' + requestId),serialized=JSON.stringify(data);
                await db(env).prepare('INSERT INTO submissions(id,project_id,publication_id,piece_id,data,actor,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(submissionId, pub.project_id, pub.id, form.id, serialized, user.id, now()).run();
                const saved=await db(env).prepare('SELECT piece_id,data FROM submissions WHERE id=?').bind(submissionId).first<any>();
                if(saved.piece_id!==form.id||saved.data!==serialized)throw new ApiError(409,'This request ID was already used for a different response.');
                return json({ saved: true });
            }
        }
        const match = path.match(/^\/api\/projects\/([-\w]+)(?:\/(.*))?$/);
        if (match) {
            const projectId = match[1], action = match[2] || '', p = await projectAccess(env, user, projectId, method !== 'GET' && !['comments', 'submissions', 'reviews'].includes(action));
            if(action === 'restore' && method === 'POST') { if(p.role !== 'owner') throw new ApiError(403,'Only the owner can restore this project.'); await db(env).prepare('UPDATE projects SET archived=0,updated_at=? WHERE id=?').bind(now(),p.id).run();return json({restored:true}); }
            if(p.archived && method !== 'GET') throw new ApiError(409,'Restore this archived project before editing it.');
            if(action === 'review-policy' && method === 'PUT') { noToken(user); if(p.role !== 'owner') throw new ApiError(403,'Only the owner can change review policy.');const b=await body(request,1000);if(b.required)await requireStudio(env,p.owner);if(typeof b.required!=='boolean')throw new ApiError(400,'Choose a review policy.');await db(env).prepare('INSERT INTO project_policies(project_id,require_review) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET require_review=excluded.require_review').bind(p.id,b.required?1:0).run();return json({saved:true}); }
            if(action === 'reviews' && method === 'POST') { noToken(user);await requireStudio(env,p.owner);if(!['owner','reviewer'].includes(p.role))throw new ApiError(403,'Only the owner and reviewers can approve a revision.');const b=await body(request,6000);if(b.revision!==p.revision||!['approved','changes_requested'].includes(b.decision))throw new ApiError(409,'Review the current applied revision.');await db(env).prepare('INSERT INTO publication_reviews(id,project_id,revision,author,decision,note,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(project_id,revision,author) DO UPDATE SET decision=excluded.decision,note=excluded.note,created_at=excluded.created_at').bind(id(),p.id,p.revision,user.id,b.decision,String(b.note||'').slice(0,2000),now()).run();return json({saved:true}); }
            if (action === '' && method === 'GET')
                return json(await projectPayload(env, p));
            if (action === '' && method === 'PATCH') {
                const b = await body(request);
                if (b.draft) {
                    const draft = graph(b.draft);
                    if (!Number.isInteger(b.draftRevision) || !Number.isInteger(b.revision))
                        throw new ApiError(400, 'Project revisions are required.');
                    if(p.revision!==b.revision || p.draft_revision!==b.draftRevision) throw new ApiError(409,'A newer draft exists. Keep your local copy and reload before continuing.');
                    const [storedDraft,storedGraph]=await Promise.all([storeJson(env,'projects/'+p.id,draft),copyJson(env,'projects/'+p.id,p.graph)]);
                    const r = await db(env).prepare('UPDATE projects SET graph=?,draft=?,draft_revision=draft_revision+1,updated_at=? WHERE id=? AND revision=? AND draft_revision=?').bind(storedGraph,storedDraft, now(), p.id, b.revision, b.draftRevision).run();
                    if (!r.meta.changes)
                        throw new ApiError(409, 'A newer draft exists. Keep your local copy and reload before continuing.');
                    return json({ saved: true, draftRevision: b.draftRevision + 1 });
                }
                if (b.name) {
                    await db(env).prepare('UPDATE projects SET name=?,updated_at=? WHERE id=?').bind(cleanName(b.name), now(), p.id).run();
                    return json({ saved: true });
                }
                throw new ApiError(400, 'No change supplied.');
            }
            if (action === '' && method === 'DELETE') {
                if (p.role !== 'owner')
                    throw new ApiError(403, 'Only the project owner can archive it.');
                await db(env).prepare('UPDATE projects SET archived=1,updated_at=? WHERE id=?').bind(now(), p.id).run();
                return json({ archived: true });
            }
            if (action === 'import' && method === 'POST') {
                if (p.role !== 'owner' || p.revision !== 0 || (await loadJson(env,'projects/'+p.id,p.graph)).pieces.length)
                    throw new ApiError(409, 'Import into a new, empty project to preserve existing work.');
                const b = await body(request), imported = await storeJson(env,'projects/'+p.id,graph(b.graph),true), stamp = now(), snapshotId = id();
                const result = await db(env).batch([db(env).prepare('INSERT INTO snapshots(id,project_id,graph,label,revision,actor,created_at) SELECT ?,id,?, ?,1,?,? FROM projects WHERE id=? AND revision=0 AND draft_revision=?').bind(snapshotId,imported,'Imported original project',user.id,stamp,p.id,p.draft_revision),db(env).prepare('UPDATE projects SET graph=?,draft=?,revision=1,draft_revision=draft_revision+1,updated_at=? WHERE id=? AND revision=0 AND draft_revision=?').bind(imported,imported,stamp,p.id,p.draft_revision)]);
                if (!result[0].meta.changes)
                    throw new ApiError(409, 'The project changed during import.');
                return json({ imported: true, revision: 1 });
            }
            if (action === 'quote' && method === 'POST') {
                const b = await body(request);
                return json(await quoteGraph(env, user, p.id, graph(b.graph), b.revision));
            }
            if (action === 'snapshot' && method === 'POST') {
                const b = await body(request, 1000);
                await db(env).prepare('INSERT INTO snapshots(id,project_id,graph,label,revision,actor,created_at) VALUES(?,?,?,?,?,?,?)').bind(id(), p.id, await copyJson(env,'projects/'+p.id,p.graph), cleanName(b.label || 'Saved checkpoint', 100), p.revision, user.id, now()).run();
                return json({ saved: true });
            }
            if (action.startsWith('snapshots/') && method === 'GET') {
                const s = await db(env).prepare('SELECT * FROM snapshots WHERE id=? AND project_id=?').bind(identifier(action.split('/')[1]), p.id).first<any>();
                if (!s)
                    throw new ApiError(404, 'Snapshot not found.');
                return json({ ...s, graph: await loadJson(env,'projects/'+p.id,s.graph) });
            }
            if (action === 'publish' && method === 'POST') {
                const policy=await db(env).prepare('SELECT require_review FROM project_policies WHERE project_id=?').bind(p.id).first<any>();
                if(policy?.require_review){const e=await entitlement(env,p.owner);if(e.tier!=='studio')throw new ApiError(403,'Renew Studio or ask the owner to review the publication policy.');const review=await db(env).prepare("SELECT id FROM publication_reviews WHERE project_id=? AND revision=? AND decision='approved' AND (author=? OR author IN (SELECT u.id FROM users u JOIN members m ON m.email=u.email WHERE m.project_id=? AND m.role='reviewer')) AND NOT EXISTS(SELECT 1 FROM publication_reviews WHERE project_id=? AND revision=? AND decision='changes_requested') LIMIT 1").bind(p.id,p.revision,p.owner,p.id,p.id,p.revision).first();if(!review)throw new ApiError(409,'This revision needs approval before publishing.');}
                const g = graph(await loadJson(env,'projects/'+p.id,p.graph)), issues = checkPublish(g);
                try { validateAllForms(g); } catch(e) { throw new ApiError(400,(e as Error).message); }
                if (issues.some(i => i.severity === 'error'))
                    return json({ error: 'Resolve the publication checks first.', issues }, 409);
                const key = id();
                await db(env).prepare('INSERT INTO publications(id,project_id,owner,graph,revision,name,created_at) VALUES(?,?,?,?,?,?,?)').bind(key, p.id, user.id, await copyJson(env,'projects/'+p.id,p.graph), p.revision, p.name, now()).run();
                return json({ id: key, url: `/p/${key}`, issues });
            }
            if (action.startsWith('publications/') && method === 'DELETE') {
                if (p.role !== 'owner')
                    throw new ApiError(403, 'Only the owner can revoke a publication.');
                await db(env).prepare('UPDATE publications SET enabled=0 WHERE id=? AND project_id=?').bind(identifier(action.split('/')[1]), p.id).run();
                return json({ revoked: true });
            }
            if (action === 'export' && method === 'GET') {
                const g = graph(await loadJson(env,'projects/'+p.id,p.graph));
                if (url.searchParams.get('format') === 'html')
                    return htmlResponse(compileHTML(g, { title: p.name }));
                return json({ format: 'vorlda-project', exportedAt: now(), name: p.name, graph: g });
            }
            if (action === 'assets' && method === 'POST') {
                if (Number(request.headers.get('content-length')) > 26500000)
                    throw new ApiError(413, 'The upload limit is 25 MB.');
                await rateLimit(env,user.id,'upload');
                const f = await boundedFormData(request,26500000), file = f.get('file');
                if (!(file instanceof File) || file.size > 25 * 1024 * 1024 || !file.size)
                    throw new ApiError(400, 'Choose a file up to 25 MB.');
                const types = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/flac', 'text/csv', 'application/json', 'application/pdf'];
                if (!types.includes(file.type))
                    throw new ApiError(400, 'Import PNG, JPEG, WebP, GIF, MP4, WebM, audio, CSV, JSON or PDF.');
                const key = id(), objectKey = `projects/${p.id}/${key}`;
                const reservation=await reserveStorage(env,p.owner,p.id,file.size);
                try {
                    await env.BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
                    await db(env).batch([db(env).prepare('INSERT INTO assets(id,owner,project_id,name,object_key,content_type,size,source,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(key, user.id, p.id, file.name.slice(0, 200), objectKey, file.type, file.size, 'upload', '{}', now()),db(env).prepare('DELETE FROM resource_reservations WHERE id=?').bind(reservation)]);
                }
                catch (e) {
                    await env.BUCKET.delete(objectKey);
                    await releaseStorage(env,reservation);
                    throw e;
                }
                return json({ id: key, name: file.name, content_type: file.type, size: file.size, url: `/api/assets/${key}` }, 201);
            }
            if (action === 'comments' && method === 'POST') {
                const b = await body(request, 12000);
                const piece = b.pieceId ? identifier(b.pieceId) : null;
                if (piece && !graph(await loadJson(env,'projects/'+p.id,p.draft)).pieces.some(x => x.id === piece))
                    throw new ApiError(400, 'The comment target no longer exists.');
                await db(env).prepare('INSERT INTO comments(id,project_id,piece_id,author,name,body,created_at) VALUES(?,?,?,?,?,?,?)').bind(id(), p.id, piece, user.id, user.name, cleanName(b.body, 5000), now()).run();
                return json({ saved: true });
            }
            if (action.startsWith('comments/') && method === 'PATCH') {
                const b = await body(request, 1000);
                await db(env).prepare('UPDATE comments SET resolved=? WHERE id=? AND project_id=?').bind(b.resolved ? 1 : 0, identifier(action.split('/')[1]), p.id).run();
                return json({ saved: true });
            }
            if (action === 'members' && method === 'POST') {
                noToken(user);
                if (p.role !== 'owner')
                    throw new ApiError(403, 'Only the project owner can manage members.');
                const ent=await requireStudio(env,p.owner);
                const b = await body(request, 1000), email = String(b.email || '').trim().toLowerCase();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['editor', 'viewer', 'reviewer'].includes(b.role))
                    throw new ApiError(400, 'Enter an email and a valid project role.');
                if(email===user.email)throw new ApiError(400,'The owner already has access.');
                const r=await db(env).prepare('INSERT INTO members(id,project_id,email,role) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM members m JOIN projects p ON p.id=m.project_id WHERE p.owner=? AND m.email=?) OR (SELECT COUNT(DISTINCT m.email) FROM members m JOIN projects p ON p.id=m.project_id WHERE p.owner=?)<? ON CONFLICT(project_id,email) DO UPDATE SET role=excluded.role').bind(id(),p.id,email,b.role,p.owner,email,p.owner,ent.members).run();
                if(!r.meta.changes)throw new ApiError(409,'Studio includes four teammates plus the owner. Remove a teammate before adding another.');
                return json({ saved: true });
            }
            if (action.startsWith('members/') && method === 'PATCH') {
                noToken(user);if(p.role!=='owner')throw new ApiError(403,'Only the owner can assign spending allowances.');await requireStudio(env,p.owner);
                const memberId=identifier(action.split('/')[1]),b=await body(request,1000),member=await db(env).prepare('SELECT id FROM members WHERE id=? AND project_id=?').bind(memberId,p.id).first();
                if(!member)throw new ApiError(404,'Member not found.');if(!Number.isSafeInteger(b.monthlyLimit)||b.monthlyLimit<0||b.monthlyLimit>1000000000)throw new ApiError(400,'Enter a monthly allowance from $0 to $1,000.');
                await db(env).prepare('INSERT INTO member_budgets(member_id,monthly_limit) VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET monthly_limit=excluded.monthly_limit').bind(memberId,b.monthlyLimit).run();return json({saved:true});
            }
            if (action.startsWith('members/') && method === 'DELETE') {
                noToken(user);
                if (p.role !== 'owner')
                    throw new ApiError(403, 'Only the owner can remove members.');
                await db(env).prepare('DELETE FROM members WHERE project_id=? AND id=?').bind(p.id, identifier(action.split('/')[1])).run();
                return json({ deleted: true });
            }
            if (action === 'tokens' && method === 'POST') {
                noToken(user);
                if (p.role !== 'owner')
                    throw new ApiError(403, 'Only the owner can create integration tokens.');
                const b = await body(request, 2000);
                if (!Array.isArray(b.scopes) || !b.scopes.length || b.scopes.some((s: string) => !['read', 'write', 'execute'].includes(s)) || !Number.isSafeInteger(b.maxCharge) || b.maxCharge < 0 || b.maxCharge > 1000000000)
                    throw new ApiError(400, 'Choose integration scopes and a maximum charge.');
                const bytes = crypto.getRandomValues(new Uint8Array(32)), token = 'vw_' + Array.from(bytes).map(n => n.toString(16).padStart(2, '0')).join('');
                const tokenId = id();
                await db(env).prepare('INSERT INTO api_tokens(id,owner,project_id,hash,name,scopes,max_charge,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(tokenId, user.id, p.id, await digest(token), cleanName(b.name, 80), JSON.stringify(b.scopes), b.maxCharge, Date.now() + 30 * 86400000, now()).run();
                return json({ id: tokenId, token, expiresInDays: 30 });
            }
            if (action.startsWith('tokens/') && method === 'DELETE') {
                noToken(user);
                if (p.role !== 'owner')
                    throw new ApiError(403, 'Only the owner can revoke integrations.');
                await db(env).prepare('DELETE FROM api_tokens WHERE id=? AND project_id=?').bind(identifier(action.split('/')[1]), p.id).run();
                return json({ revoked: true });
            }
        }
        throw new ApiError(404, 'This endpoint does not exist.');
    }
    catch (e) {
        if (e instanceof ApiError) {
            const response=json({ error: e.message }, e.status);
            if(e.status===429)response.headers.set('Retry-After','60');
            return response;
        }
        console.error('VORLDA request failed', new URL(request.url).pathname, e instanceof Error ? e.name : 'UnknownError');
        return json({ error: 'The request could not be completed. Your changes remain in the draft. Try again.' }, 500);
    }
}
