export const pieceTypes = ['page', 'section', 'text', 'button', 'image', 'video', 'audio', 'shape', 'input', 'form', 'gallery', 'data', 'prompt', 'generator', 'character', 'code', 'group'] as const;
export type PieceType = typeof pieceTypes[number];
export type Scalar = string | number | boolean | null;
export type Json = Scalar | Json[] | {
    [key: string]: Json;
};
export type Fields = Record<string, Json>;
export type Piece = {
    id: string;
    type: PieceType;
    name: string;
    parentId: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
    props: Fields;
    style: Fields;
    mobile: Fields;
    locked: boolean;
    hidden: boolean;
    sourceId?: string;
    variant?: boolean;
    createdAt: string;
};
export type Connection = {
    id: string;
    from: string;
    to: string | null;
    type: 'navigation' | 'data' | 'generation' | 'storage' | 'transform' | 'return';
    label: string;
    disabled: boolean;
    event: string;
    open: 'replace' | 'overlay' | 'panel' | 'split' | 'background';
    history: 'push' | 'replace' | 'clear';
    back: 'history' | 'source' | 'none';
    preserve: boolean;
    condition: string;
    steps: Fields[];
};
export type Rule = {
    id: string;
    name: string;
    prompt: string;
    scope: 'global' | 'type' | 'pieces';
    targets: string[];
    exclude: string[];
    type?: string;
    style: Fields;
    enabled: boolean;
};
export type Proxy = {
    id: string;
    sourceId: string;
    x: number;
    y: number;
};
export type Graph = {
    version: 1;
    pieces: Piece[];
    connections: Connection[];
    rules: Rule[];
    proxies: Proxy[];
    entries: string[];
};
export type Issue = {
    severity: 'error' | 'warning';
    code: string;
    message: string;
    target?: string;
};
export const id = () => crypto.randomUUID();
export const emptyGraph = (): Graph => ({ version: 1, pieces: [], connections: [], rules: [], proxies: [], entries: [] });
export const clone = <T>(x: T): T => structuredClone(x);
export const catalog: {
    type: PieceType;
    name: string;
    ar: string;
    description: string;
    category: string;
}[] = [
    { type: 'page', name: 'Page', ar: 'صفحة', description: 'A real, responsive application page', category: 'Application' },
    { type: 'section', name: 'Container', ar: 'حاوية', description: 'Build any composition inside it', category: 'Application' },
    { type: 'text', name: 'Text', ar: 'نص', description: 'A title, paragraph, or editable label', category: 'Application' },
    { type: 'button', name: 'Button', ar: 'زر', description: 'Connect an action or a destination', category: 'Application' },
    { type: 'input', name: 'Input', ar: 'حقل إدخال', description: 'Collect text, email, or numbers', category: 'Application' },
    { type: 'form', name: 'Form', ar: 'نموذج', description: 'Inputs with validated, saved submissions', category: 'Application' },
    { type: 'image', name: 'Image', ar: 'صورة', description: 'Import and compose an image layer', category: 'Media' },
    { type: 'video', name: 'Video', ar: 'فيديو', description: 'A clip with timing, trim, and movement', category: 'Media' },
    { type: 'audio', name: 'Audio track', ar: 'مسار صوتي', description: 'Speech, music, or sound inside a scene', category: 'Media' },
    { type: 'shape', name: 'Shape', ar: 'شكل', description: 'Geometry, color, and material', category: 'Design' },
    { type: 'gallery', name: 'Gallery', ar: 'معرض', description: 'A responsive collection of media', category: 'Application' },
    { type: 'data', name: 'Data collection', ar: 'مجموعة بيانات', description: 'Structured records that power components', category: 'Logic' },
    { type: 'prompt', name: 'Prompt', ar: 'أمر سياقي', description: 'Instructions attached to their target', category: 'Logic' },
    { type: 'generator', name: 'Generation', ar: 'توليد', description: 'An approved provider operation', category: 'Logic' },
    { type: 'character', name: 'Character', ar: 'شخصية', description: 'A persistent identity and its references', category: 'Media' },
    { type: 'code', name: 'Custom code', ar: 'كود مخصص', description: 'HTML in an isolated sandbox', category: 'Logic' },
    { type: 'group', name: 'Group', ar: 'مجموعة', description: 'Move and organize parts together', category: 'Design' },
];
export function makePiece(type: PieceType, parentId: string | null = null, x = 80, y = 80): Piece {
    const wide = ['page', 'section', 'form', 'group', 'character', 'gallery'].includes(type);
    const p: Piece = { id: id(), type, name: catalog.find(c => c.type === type)?.name || type, parentId, x, y, w: type === 'page' ? 720 : wide ? 420 : type === 'button' ? 180 : 280, h: type === 'page' ? 900 : wide ? 320 : type === 'button' || type === 'input' ? 52 : type === 'text' ? 100 : 200, rotation: 0, props: {}, style: { background: type === 'page' ? '#f6f7f4' : type === 'button' ? '#c8f16b' : type === 'shape' ? '#b3a0ff' : wide ? '#ffffff' : 'transparent', color: '#17201d', radius: type === 'button' ? 12 : wide ? 18 : 0, fontSize: type === 'text' ? 32 : 16, opacity: 1, padding: 24, gap: 16, layout: 'absolute' }, mobile: {}, locked: false, hidden: false, createdAt: new Date().toISOString() };
    if (type === 'text')
        p.props = { text: 'Make something real.', tag: 'h2' };
    if (type === 'button')
        p.props = { text: 'Continue', action: 'navigate' };
    if (type === 'input')
        p.props = { placeholder: 'Your email', field: 'email', inputType: 'email', required: true };
    if (type === 'form')
        p.props = { submitLabel: 'Send', success: 'Thank you. Your response has been saved.' };
    if (type === 'image')
        p.props = { src: '', fit: 'cover', alt: 'Image', brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, mask: 'none' };
    if (type === 'video' || type === 'audio')
        p.props = { src: '', start: 0, duration: 8, trim: 0, speed: 1, volume: 1, loop: false, keyframes: [] };
    if (type === 'shape')
        p.props = { shape: 'rectangle' };
    if (type === 'prompt')
        p.props = { text: '', target: parentId || '', mode: 'local' };
    if (type === 'generator')
        p.props = { prompt: '', operation: 'image', providerId: '', status: 'unconfigured' };
    if (type === 'data')
        p.props = { records: [{ title: 'First record', description: 'Edit this collection.' }], collection: 'items' };
    if (type === 'gallery')
        p.props = { columns: 3, images: [] };
    if (type === 'character')
        p.props = { description: '', identity: '', references: [], anchors: [], consent: false };
    if (type === 'code')
        p.props = { html: '<div style="padding:24px;font-family:system-ui"><h2>Your custom part</h2><p>Edit this isolated HTML.</p></div>' };
    return p;
}
export function children(g: Graph, parent: string | null) { return g.pieces.filter(p => p.parentId === parent); }
export function descendants(g: Graph, root: string, include = true): Piece[] { const found: Piece[] = []; const pending = [root]; const visited = new Set<string>(); const map = new Map<string, Piece[]>(); for (const p of g.pieces) {
    const a = map.get(p.parentId || '') || [];
    a.push(p);
    map.set(p.parentId || '', a);
} const byId = new Map(g.pieces.map(p => [p.id, p])); while (pending.length) {
    const key = pending.pop()!;
    if (visited.has(key))
        continue;
    visited.add(key);
    const p = byId.get(key);
    if (p && (include || key !== root))
        found.push(p);
    for (const c of map.get(key) || [])
        pending.push(c.id);
} return found; }
export function absolutePosition(g: Graph, p: Piece) { let x = p.x, y = p.y; const seen = new Set([p.id]); let parent = p.parentId; const map = new Map(g.pieces.map(p => [p.id, p])); while (parent) {
    if (seen.has(parent))
        break;
    seen.add(parent);
    const a = map.get(parent);
    if (!a)
        break;
    x += a.x;
    y += a.y;
    parent = a.parentId;
} return { x, y }; }
export function topLevel(g: Graph, id: string): Piece | undefined { const map = new Map(g.pieces.map(p => [p.id, p])); let p = map.get(id); const seen = new Set<string>(); while (p?.parentId && !seen.has(p.id)) {
    seen.add(p.id);
    p = map.get(p.parentId);
} return p; }
export function effectivePiece(g: Graph, p: Piece, device = 'desktop'): Piece {
    let result = clone(p);
    const visited = new Set([p.id]);
    let source = p.sourceId;
    const chain: Piece[] = [];
    while (source && !visited.has(source)) {
        visited.add(source);
        const s = g.pieces.find(x => x.id === source);
        if (!s)
            break;
        chain.unshift(s);
        source = s.sourceId;
    }
    if (chain.length) {
        let style: Fields = {}, props: Fields = {};
        for (const base of chain) {
            style = { ...style, ...base.style };
            props = { ...props, ...base.props };
        }
        result = { ...result, style: { ...style, ...p.style }, props: { ...props, ...p.props } };
    }
    const rules = g.rules.filter(r => r.enabled && !r.exclude.includes(p.id) && (r.scope === 'global' || r.scope === 'type' && r.type === p.type || r.scope === 'pieces' && r.targets.some(t => descendants(g, t).some(a => a.id === p.id)))).sort((a, b) => ({ global: 0, type: 1, pieces: 2 }[a.scope] - { global: 0, type: 1, pieces: 2 }[b.scope]));
    for (const r of rules)
        result.style = { ...result.style, ...r.style };
    if (device === 'mobile') {
        const m = result.mobile;
        result = { ...result, x: typeof m.x === 'number' ? m.x : result.x, y: typeof m.y === 'number' ? m.y : result.y, w: typeof m.w === 'number' ? m.w : result.w, h: typeof m.h === 'number' ? m.h : result.h, hidden: typeof m.hidden === 'boolean' ? m.hidden : result.hidden, style: { ...result.style, ...(m.style && typeof m.style === 'object' && !Array.isArray(m.style) ? m.style : {}) } };
    }
    return result;
}
export function connectionStatus(g: Graph, c: Connection) { if (c.disabled)
    return 'disabled'; if (c.type === 'return' && c.back === 'history')
    return 'ready'; if (!c.to)
    return 'pending'; if (!g.pieces.some(p => p.id === c.from) || !g.pieces.some(p => p.id === c.to))
    return 'broken'; return c.condition ? 'conditional' : 'ready'; }
export function validateGraph(input: unknown): Graph {
    if (!input || typeof input !== 'object')
        throw Error('Invalid project file.');
    const g = input as Graph;
    if (g.version !== 1 || !['pieces', 'connections', 'rules', 'proxies', 'entries'].every(k => Array.isArray((g as unknown as Record<string, unknown>)[k])))
        throw Error('Unsupported project format.');
    // Operational request budget; nested structure has no product-defined depth cap.
    if (new TextEncoder().encode(JSON.stringify(g)).byteLength > 4000000 || g.pieces.length > 20000)
        throw Error('This request exceeds the current processing budget. Split the project into linked assemblies.');
    const seen = new Set<string>();
    const safeId = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
    const checkFields = (f: unknown) => { if (!f || typeof f !== 'object' || Array.isArray(f))
        throw Error('Invalid properties.'); const stack = [f]; let n = 0; while (stack.length) {
        if (++n > 100000)
            throw Error('Properties are too complex.');
        const o = stack.pop()!;
        for (const [k, v] of Object.entries(o)) {
            if (['__proto__', 'constructor', 'prototype'].includes(k))
                throw Error('Unsafe property name.');
            if (typeof v === 'number' && !Number.isFinite(v))
                throw Error('Non-finite number.');
            if (v && typeof v === 'object')
                stack.push(v);
        }
    } };
    for (const p of g.pieces) {
        if (!safeId(p.id) || seen.has(p.id) || !pieceTypes.includes(p.type))
            throw Error('Invalid or duplicate part.');
        seen.add(p.id);
        if (typeof p.name !== 'string' || p.name.length > 200 || !['x', 'y', 'w', 'h', 'rotation'].every(k => Number.isFinite(p[k as keyof Piece]) && Math.abs(Number(p[k as keyof Piece])) <= 1000000) || p.w < 1 || p.h < 1)
            throw Error('Invalid part geometry.');
        if (typeof p.locked !== 'boolean' || typeof p.hidden !== 'boolean')
            throw Error('Invalid part state.');
        checkFields(p.props);
        checkFields(p.style);
        checkFields(p.mobile);
    }
    const map = new Map(g.pieces.map(p => [p.id, p]));
    for (const p of g.pieces) {
        let parent = p.parentId;
        const path = new Set([p.id]);
        while (parent) {
            if (!map.has(parent))
                throw Error('A parent part is missing.');
            if (path.has(parent))
                throw Error('A part cannot contain itself.');
            path.add(parent);
            parent = map.get(parent)!.parentId;
        }
        let source = p.sourceId;
        const refs = new Set([p.id]);
        while (source) {
            if (!map.has(source))
                throw Error('A linked source is missing.');
            if (refs.has(source))
                throw Error('Linked sources cannot form a cycle.');
            refs.add(source);
            source = map.get(source)!.sourceId;
        }
    }
    const edgeIds = new Set<string>();
    for (const c of g.connections) {
        if (!safeId(c.id) || edgeIds.has(c.id) || !map.has(c.from) || !['navigation', 'data', 'generation', 'storage', 'transform', 'return'].includes(c.type) || typeof c.label !== 'string' || typeof c.condition !== 'string' || typeof c.disabled !== 'boolean' || typeof c.preserve !== 'boolean' || !['click', 'submit'].includes(c.event) || (c.to !== null && !safeId(c.to)) || !['replace', 'overlay', 'panel', 'split', 'background'].includes(c.open) || !['push', 'replace', 'clear'].includes(c.history) || !['history', 'source', 'none'].includes(c.back) || !Array.isArray(c.steps))
            throw Error('Invalid connection.');
        edgeIds.add(c.id);
        for (const s of c.steps)
            checkFields(s);
    }
    for (const r of g.rules) {
        if (!safeId(r.id) || !['global', 'type', 'pieces'].includes(r.scope) || !Array.isArray(r.targets) || !Array.isArray(r.exclude) || typeof r.prompt !== 'string' || typeof r.name !== 'string' || typeof r.enabled !== 'boolean' || r.exclude.some(x => !safeId(x)) || r.targets.some(x => !safeId(x)))
            throw Error('Invalid rule.');
        checkFields(r.style);
    }
    for (const p of g.proxies)
        if (!safeId(p.id) || !map.has(p.sourceId) || !Number.isFinite(p.x) || !Number.isFinite(p.y))
            throw Error('Invalid edit handle.');
    if (g.entries.some(x => !map.has(x)))
        throw Error('An entry point is missing.');
    return clone(g);
}
export function checkPublish(g: Graph): Issue[] { const issues: Issue[] = []; const pages = g.pieces.filter(p => p.type === 'page' && !p.hidden); if (!pages.length)
    issues.push({ severity: 'error', code: 'NO_PAGE', message: 'Add an application page before publishing an application.' }); for (const c of g.connections) {
    const status = connectionStatus(g, c);
    if (status === 'pending' || status === 'broken')
        issues.push({ severity: 'error', code: 'BROKEN_CONNECTION', message: `${c.label || 'Connection'} has no valid destination. Connect or disable it.`, target: c.id });
} for (const raw of g.pieces) {
    const p=effectivePiece(g,raw);
    if (p.type === 'button' && p.props.action === 'navigate' && !g.connections.some(c => c.from === p.id && !c.disabled))
        issues.push({ severity: 'warning', code: 'NO_ACTION', message: `${p.name} has no navigation action.`, target: p.id });
    if (p.type === 'generator' && !p.hidden)
        issues.push({ severity: 'error', code: 'NO_PROVIDER', message: `${p.name} needs a configured provider.`, target: p.id });
    if (p.type === 'input' && p.props.inputType === 'password' && !p.hidden)
        issues.push({ severity: 'error', code: 'AUTH_BACKEND_REQUIRED', message: `${p.name} requires an authentication backend. Generic form responses must not collect passwords.`, target: p.id });
    if (['image', 'video', 'audio'].includes(p.type) && !p.props.src)
        issues.push({ severity: 'warning', code: 'NO_ASSET', message: `${p.name} has no media.`, target: p.id });
} return issues; }
export function duplicateParts(g: Graph, ids: string[], mode: 'independent' | 'linked' | 'variant' = 'independent', parentId?: string | null, includeConnections = true): {
    graph: Graph;
    created: string[];
} { const out = clone(g); const all = new Map<string, Piece>(); for (const key of ids)
    for (const p of descendants(g, key))
        all.set(p.id, p); const mapping = new Map([...all.keys()].map(k => [k, id()])); for (const p of all.values()) {
    const copy = mode === 'independent' ? effectivePiece(g, p) : clone(p);
    copy.id = mapping.get(p.id)!;
    copy.parentId = mapping.get(p.parentId || '') ?? (parentId !== undefined && ids.includes(p.id) ? parentId : p.parentId);
    if (ids.includes(p.id)) {
        copy.x += 36;
        copy.y += 36;
        copy.name += ' copy';
    }
    const remap = (v: Json): Json => typeof v === 'string' ? (mapping.get(v) || v) : Array.isArray(v) ? v.map(remap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)])) : v;
    const sourceWorkspace = copy.type === 'code' ? copy.props.workspace : undefined;
    copy.props = remap(copy.props) as Fields;
    // Source file contents and task arguments are opaque, not graph references.
    if (sourceWorkspace !== undefined) copy.props.workspace = sourceWorkspace;
    copy.locked = false;
    if (mode !== 'independent') {
        copy.sourceId = p.id;
        copy.variant = mode === 'variant';
        copy.props = {};
        copy.style = {};
    }
    else
        delete copy.sourceId;
    out.pieces.push(copy);
} if (includeConnections)
    for (const c of g.connections) {
        if (mapping.has(c.from)) {
            const copy = clone(c);
            copy.id = id();
            copy.from = mapping.get(c.from)!;
            copy.to = mapping.get(c.to || '') ?? c.to;
            out.connections.push(copy);
        }
    } return { graph: out, created: ids.map(k => mapping.get(k)!).filter(Boolean) }; }
export function removeParts(g: Graph, ids: string[]) { const out = clone(g); const removed = new Set(ids.flatMap(i => descendants(g, i).map(p => p.id))); out.pieces = out.pieces.filter(p => !removed.has(p.id)).map(p => removed.has(p.sourceId || '') ? { ...effectivePiece(g, p), sourceId: undefined, variant: undefined } : p); out.connections = out.connections.filter(c => !removed.has(c.from)); out.proxies = out.proxies.filter(p => !removed.has(p.sourceId)); out.entries = out.entries.filter(x => !removed.has(x)); return out; }
export function makeConnection(from: string, to: string | null, type: Connection['type'] = 'navigation'): Connection { return { id: id(), from, to, type, label: type, disabled: false, event: 'click', open: 'replace', history: 'push', back: 'history', preserve: true, condition: '', steps: [] }; }
export type Diff = {
    added: string[];
    changed: string[];
    deleted: string[];
    connections: number;
    rules: number;
};
export function diffGraph(before: Graph, after: Graph): Diff { const prev = new Map(before.pieces.map(p => [p.id, p])); const next = new Map(after.pieces.map(p => [p.id, p])); return { added: after.pieces.filter(p => !prev.has(p.id)).map(p => p.id), changed: after.pieces.filter(p => prev.has(p.id) && JSON.stringify(prev.get(p.id)) !== JSON.stringify(p)).map(p => p.id), deleted: before.pieces.filter(p => !next.has(p.id)).map(p => p.id), connections: after.connections.filter(c => JSON.stringify(before.connections.find(x => x.id === c.id)) !== JSON.stringify(c)).length, rules: after.rules.filter(r => JSON.stringify(before.rules.find(x => x.id === r.id)) !== JSON.stringify(r)).length }; }
export function createAssembly(kind: string): Graph { const g = emptyGraph(); if (kind === 'blank')
    return g; const p = makePiece('page', null, 80, 80); p.name = kind === 'film' ? 'Scene 01' : kind === 'image' ? 'Composition' : kind === 'character' ? 'Character world' : 'First page'; if (kind !== 'application') {
    p.w = 960;
    p.h = 540;
    p.style.background = '#e9ebe4';
} g.pieces.push(p); g.entries = [p.id]; if (kind === 'application') {
    const title = makePiece('text', p.id, 48, 70);
    title.props.text = 'Your next idea,\nmade real.';
    title.w = 600;
    title.h = 140;
    title.style.fontSize = 56;
    const body = makePiece('text', p.id, 48, 235);
    body.props = { text: 'Build this page your way. Every part is yours to change.', tag: 'p' };
    body.style.fontSize = 20;
    body.w = 590;
    const button = makePiece('button', p.id, 48, 350);
    button.props.text = 'Explore the details';
    const card = makePiece('section', p.id, 48, 455);
    card.w = 624;
    card.h = 330;
    card.style.background = '#dfe8d4';
    const note = makePiece('text', card.id, 32, 32);
    note.props.text = 'Start with a part.\nFollow your idea.';
    note.w = 550;
    g.pieces.push(title, body, button, card, note);
    const second = makePiece('page', null, 960, 80);
    second.name = 'Details';
    const t = makePiece('text', second.id, 48, 70);
    t.props.text = 'Everything connects.';
    t.w = 600;
    const back = makePiece('button', second.id, 48, 230);
    back.props.text = 'Back to the beginning';
    g.pieces.push(second, t, back);
    g.connections.push(makeConnection(button.id, second.id), makeConnection(back.id, p.id));
}
else if (kind === 'character') {
    const c = makePiece('character', p.id, 40, 40);
    c.w = 400;
    c.h = 440;
    g.pieces.push(c);
    const t = makePiece('text', p.id, 480, 60);
    t.props.text = 'One identity.\nMany stories.';
    t.w = 400;
    t.h = 150;
    g.pieces.push(t);
}
else {
    const media = makePiece(kind === 'film' ? 'video' : 'image', p.id, 0, 0);
    media.w = p.w;
    media.h = p.h;
    g.pieces.push(media);
    const title = makePiece('text', p.id, 48, 400);
    title.props.text = kind === 'film' ? 'Scene one' : 'Your composition';
    title.style.fontSize = 48;
    title.w = 800;
    g.pieces.push(title);
} return g; }
