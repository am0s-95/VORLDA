import { entitlement } from './entitlements.ts';
import { ApiError, db, now, billingMode, type Env } from './db.ts';
export type User = {
    id: string;
    email: string;
    name: string;
    admin: boolean;
    token?: {
        projectId: string;
        scopes: string[];
        maxCharge: number;
    };
};
export async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function authenticate(request: Request, env: Env): Promise<User> {
    const bearer = request.headers.get('authorization');
    if (bearer?.startsWith('Bearer vw_')) {
        const row = await db(env).prepare('SELECT t.*,u.email,u.name FROM api_tokens t JOIN users u ON u.id=t.owner WHERE t.hash=? AND t.expires_at>?').bind(await digest(bearer.slice(7)), Date.now()).first<any>();
        if (!row)
            throw new ApiError(401, 'This integration token is invalid or expired.');
        return { id: row.owner, email: row.email, name: row.name, admin: false, token: { projectId: row.project_id, scopes: JSON.parse(row.scopes), maxCharge: row.max_charge } };
    }
    const uid = request.headers.get('oai-authenticated-user-id'), email = request.headers.get('oai-authenticated-user-email');
    if (!uid || !email)
        throw new ApiError(401, 'Sign in to open your workshop.');
    let name = email;
    const encoded = request.headers.get('oai-authenticated-user-full-name');
    if (encoded && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
        try {
            name = decodeURIComponent(encoded);
        }
        catch { }
    }
    const user = { id: uid, email: email.trim().toLowerCase(), name, admin: !!env.APP_OWNER_EMAIL && email.trim().toLowerCase() === env.APP_OWNER_EMAIL.trim().toLowerCase() };
    const mode = billingMode(env);
    const existing=await db(env).prepare('SELECT u.email,u.name,w.id AS wallet_id FROM users u LEFT JOIN wallets w ON w.owner=u.id AND w.mode=? WHERE u.id=?').bind(mode,uid).first<any>();
    if(!existing || existing.email!==user.email || existing.name!==name) await db(env).prepare('INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name').bind(uid,user.email,name,now()).run();
    if(!existing?.wallet_id) await db(env).prepare('INSERT INTO wallets(id,owner,mode,subscription,topup,updated_at) VALUES(?,?,?,0,0,?) ON CONFLICT(owner,mode) DO NOTHING').bind(`${uid}:${mode}`,uid,mode,now()).run();
    return user;
}
export async function projectAccess(env: Env, user: User, projectId: string, write = false) { if (user.token && (user.token.projectId !== projectId || !user.token.scopes.includes(write ? 'write' : 'read')))
    throw new ApiError(403, 'This integration does not have the required project scope.'); const project = await db(env).prepare('SELECT p.*,m.role AS member_role FROM projects p LEFT JOIN members m ON m.project_id=p.id AND m.email=? WHERE p.id=?').bind(user.email, projectId).first<any>(); if (!project || (project.owner !== user.id && !project.member_role))
    throw new ApiError(404, 'Project not found.'); const role = project.owner === user.id ? 'owner' : project.member_role; if(write && role !== 'owner' && (await entitlement(env,project.owner)).tier !== 'studio') throw new ApiError(403,'Team editing requires an active Studio workspace. Existing work is still available to read and export.'); if (write && !['owner', 'editor'].includes(role))
    throw new ApiError(403, 'This project is read-only for your role.'); return { ...project, role }; }
export function requireAdmin(user: User) { if (!user.admin || user.token)
    throw new ApiError(403, 'Only the workspace owner can change these settings.'); }
export function csrf(request: Request) { if (['GET', 'HEAD', 'OPTIONS'].includes(request.method))
    return; const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, 'Cross-site requests are not allowed.'); if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new ApiError(403, 'Cross-site requests are not allowed.'); }
