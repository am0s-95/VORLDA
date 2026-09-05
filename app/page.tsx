"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PE } from 'react';
import { Box, Plus, Search, ChevronDown, ChevronRight, ArrowUpRight, MousePointer2, Hand, Link2, Type, Square, Image as ImageIcon, Video, Music2, LayoutTemplate, UserRound, FolderOpen, Upload, Download, Undo2, Redo2, Play, Pause, ZoomIn, ZoomOut, Maximize, Monitor, Smartphone, Settings2, Wallet, Check, Cloud, Copy, Trash2, Lock, EyeOff, MoveUpRight, CornerDownLeft, Group, PanelRight, GitBranch, X, ShieldCheck, AlertCircle, FileJson, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarTrigger } from '@/components/ui/sidebar';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { type Graph, type Piece, type PieceType, type Rule, catalog, emptyGraph, id, clone, makePiece, children, absolutePosition, duplicateParts, removeParts, makeConnection, checkPublish, validateGraph, connectionStatus, diffGraph } from '@/lib/world';
import { api, type Project } from '@/lib/client';
import { money, testTariffs, priceDiff } from '@/lib/money';
import { compileHTML } from '@/lib/compiler';
import { downloadBlob } from '@/lib/media';
import { Choice, Field, TextField, Toggle, JsonField, IconButton } from '@/components/editor-controls';
import { Inspector } from '@/components/inspector';
import { CanvasPart, MiniMap, partIcons } from '@/components/canvas-part';
import { ArchivePanel } from '@/components/archive-panel';
import { ResourceLibrary } from '@/components/resource-library';
import { ProductionPanel } from '@/components/production-panel';
import { Modal, WalletPanel, PricingSettings, ExportPanel, ProjectPanel } from '@/components/workshop-dialogs';
export default function Workshop() {
    const [ar, setAr] = useState(true), [user, setUser] = useState<any>(null), [wallet, setWallet] = useState<any>({ total: 0, subscription: 0, topup: 0, mode: 'test', ledger: [], plans: [] }), [projects, setProjects] = useState<any[]>([]), [project, setProject] = useState<Project | null>(null), [g, setG] = useState<Graph>(emptyGraph), [selected, setSelected] = useState<string[]>([]), [scope, setScope] = useState<string | null>(null), [leftTab, setLeftTab] = useState('parts'), [search, setSearch] = useState(''), [tool, setTool] = useState('select'), [viewport, setViewport] = useState({ x: 90, y: 75, z: .65 }), [mobile, setMobile] = useState(false), [properties, setProperties] = useState(false), [connectionsVisible, setConnectionsVisible] = useState(true), [status, setStatus] = useState('loading'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [modal, setModal] = useState(''), [command, setCommand] = useState(false), [prompt, setPrompt] = useState(''), [quote, setQuote] = useState<any>(null), [preview, setPreview] = useState(false), [newName, setNewName] = useState(''), [newKind, setNewKind] = useState('blank'), [archiveConfirm, setArchiveConfirm] = useState(false), [timeline, setTimeline] = useState(false), [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [ruleName, setRuleName] = useState(''), [ruleScope, setRuleScope] = useState('global'), [ruleType, setRuleType] = useState('text'), [ruleColor, setRuleColor] = useState('#3d6dff'), [localHistory, setLocalHistory] = useState({ undo: 0, redo: 0 });
    const projectRef = useRef<Project | null>(null), graphRef = useRef(g), lastSaved = useRef(''), saving = useRef<Promise<void> | null>(null), undo = useRef<Graph[]>([]), redo = useRef<Graph[]>([]), canvasRef = useRef<HTMLDivElement>(null), uploadRef = useRef<HTMLInputElement>(null), importRef = useRef<HTMLInputElement>(null), panRef = useRef<any>(null), dragRef = useRef<any>(null), spaceRef = useRef(false), initialized = useRef(false), booting = useRef(false);
    const t = useCallback((en: string, a: string) => ar ? a : en, [ar]), editable = !!project && ['owner', 'editor'].includes(project.role) && !busy, current = g.pieces.find(p => p.id === selected[0]), activeScope = scope ? g.pieces.find(p => p.id === scope) : null;
    const setGraph = useCallback((next: Graph) => { graphRef.current = next; setG(next); }, []);
    const load = useCallback((p: Project) => { projectRef.current = p; setProject(p); lastSaved.current = JSON.stringify(p.draft); setGraph(p.draft); setSelected([]); setScope(null); setProperties(false); undo.current = []; redo.current = []; setLocalHistory({ undo: 0, redo: 0 }); setStatus('saved'); setError(''); }, [setGraph]);
    async function bootstrap() { if (booting.current)
        return; booting.current = true; setError(''); try {
        const r = await api('/api/bootstrap');
        setUser(r.user);
        setWallet(r.wallet);
        setProjects(r.projects);
        const p = r.projects.length ? await api<Project>('/api/projects/' + r.projects[0].id) : await api<Project>('/api/projects', { method: 'POST', body: { name: 'My first world', kind: 'blank' } });
        load(p);
        if (!r.projects.length)
            setProjects([p]);
        initialized.current = true;
    }
    catch (e) {
        setError((e as Error).message);
        setStatus('error');
    }
    finally {
        booting.current = false;
    } }
    useEffect(() => { const language = localStorage.getItem('vorlda-language'); if (language)
        setAr(language === 'ar'); void bootstrap(); }, []);
    useEffect(() => { document.documentElement.lang = ar ? 'ar' : 'en'; localStorage.setItem('vorlda-language', ar ? 'ar' : 'en'); }, [ar]);
    async function refreshWallet() { setWallet(await api('/api/wallet')); const p=projectRef.current;if(p){const fresh=await api<Project>('/api/projects/'+p.id);projectRef.current={...p,entitlement:fresh.entitlement};setProject(projectRef.current);} }
    async function refreshProject() { const p = projectRef.current; if (!p)
        return; const fresh = await api<Project>('/api/projects/' + p.id); if (fresh.revision !== p.revision) {
        setError(t('A new applied version exists. Keep your local draft before reloading.', 'توجد نسخة معتمدة أحدث. احتفظ بمسودتك المحلية قبل إعادة التحميل.'));
        return;
    } projectRef.current = { ...fresh, draft_revision: p.draft_revision, draft: graphRef.current }; setProject(projectRef.current); setProjects((await api('/api/bootstrap')).projects); }
    const saveDraft = useCallback(async () => { if (saving.current)
        return saving.current; const task = (async () => { const p = projectRef.current; if (!p || !['owner', 'editor'].includes(p.role))
        return; while (projectRef.current?.id === p.id) {
        const raw = JSON.stringify(graphRef.current);
        if (raw === lastSaved.current)
            return;
        setStatus('saving');
        try {
            const r = await api(`/api/projects/${p.id}`, { method: 'PATCH', body: { draft: JSON.parse(raw), revision: projectRef.current!.revision, draftRevision: projectRef.current!.draft_revision } });
            lastSaved.current = raw;
            projectRef.current = { ...projectRef.current!, draft_revision: r.draftRevision };
            setProject(projectRef.current);
            setStatus('saved');
        }
        catch (e) {
            setStatus('conflict');
            setError((e as Error).message);
            throw e;
        }
    } })(); saving.current = task; try {
        await task;
    }
    finally {
        saving.current = null;
    } }, []);
    useEffect(() => { if (!initialized.current || !projectRef.current || JSON.stringify(g) === lastSaved.current)
        return; setStatus('unsaved'); const timer = setTimeout(() => saveDraft().catch(() => { }), 900); return () => clearTimeout(timer); }, [g, saveDraft]);
    useEffect(() => { const unload = (e: BeforeUnloadEvent) => { if (JSON.stringify(graphRef.current) !== lastSaved.current) {
        e.preventDefault();
        e.returnValue = '';
    } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, []);
    function checkpoint() { undo.current.push(clone(graphRef.current)); if (undo.current.length > 60)
        undo.current.shift(); redo.current = []; setLocalHistory({ undo: undo.current.length, redo: 0 }); }
    function edit(fn: (g: Graph) => void) { if (!editable)
        return; const next = clone(graphRef.current); fn(next); try {
        const valid = validateGraph(next);
        checkpoint();
        setGraph(valid);
    }
    catch (e) {
        toast.error((e as Error).message);
    } }
    function replace(next: Graph) { if (!editable)
        return; try {
        const valid = validateGraph(next);
        checkpoint();
        setGraph(valid);
    }
    catch (e) {
        toast.error((e as Error).message);
    } }
    function travel(direction: 'undo' | 'redo') { const source = direction === 'undo' ? undo : redo, target = direction === 'undo' ? redo : undo; if (!source.current.length || !editable)
        return; target.current.push(clone(graphRef.current)); setGraph(source.current.pop()!); setLocalHistory({ undo: undo.current.length, redo: redo.current.length }); }
    async function switchProject(key: string) { try {
        await saveDraft();
        setBusy(true);
        load(await api('/api/projects/' + key));
        setModal('');
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function newProject() { setBusy(true); try {
        await saveDraft();
        const p = await api<Project>('/api/projects', { method: 'POST', body: { name: newName || t('Untitled assembly', 'تجميعة جديدة'), kind: newKind } });
        load(p);
        setProjects([...projects, p]);
        setModal('');
        setViewport({ x: 70, y: 65, z: newKind === 'blank' ? .65 : .48 });
        setNewName('');
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    function choose(key: string, extend = false) { setSelected(ids => extend ? (ids.includes(key) ? ids.filter(i => i !== key) : [...ids, key]) : [key]); setProperties(true); }
    function add(type: PieceType) { const p = makePiece(type, type === 'page' ? null : scope, scope ? 32 : Math.round((130 - viewport.x) / viewport.z), scope ? 32 : Math.round((100 - viewport.y) / viewport.z)); if (type === 'page') {
        p.x = g.pieces.filter(x => x.parentId === null).reduce((max, a) => Math.max(max, a.x + a.w + 120), 60);
        p.y = 70;
    } edit(g => g.pieces.push(p)); choose(p.id); if (type === 'video' || type === 'audio')
        setTimeline(true); }
    function duplicate(mode: 'independent' | 'linked' | 'variant' = 'independent') { if (!selected.length)
        return; const r = duplicateParts(g, selected, mode); replace(r.graph); setSelected(r.created); }
    function remove() { if (!selected.length)
        return; const allowed = selected.filter(k => !g.pieces.find(p => p.id === k)?.locked); if (allowed.length !== selected.length)
        toast.error(t('Unlock protected parts first.', 'افتح قفل القطع المحمية أولًا.')); replace(removeParts(g, allowed)); setSelected([]); setProperties(false); }
    function groupSelection() { const parts = g.pieces.filter(p => selected.includes(p.id)); if (!parts.length)
        return; if (parts.some(p => p.locked))
        return toast.error('Unlock selected parts first.'); const parent = parts[0].parentId; if (parts.some(p => p.parentId !== parent))
        return toast.error(t('Group parts inside the same parent.', 'اختر قطعًا ضمن الحاضنة نفسها.')); const x = Math.min(...parts.map(p => p.x)), y = Math.min(...parts.map(p => p.y)), group = makePiece('group', parent, x, y); group.w = Math.max(...parts.map(p => p.x + p.w)) - x; group.h = Math.max(...parts.map(p => p.y + p.h)) - y; group.style.background = 'transparent'; edit(g => { g.pieces.push(group); g.pieces.filter(p => selected.includes(p.id)).forEach(p => { p.parentId = group.id; p.x -= x; p.y -= y; }); }); choose(group.id); }
    function pullOut() { if (!current)
        return; edit(g => { if (!g.proxies.some(p => p.sourceId === current.id)) {
        const pos = absolutePosition(g, current);
        g.proxies.push({ id: id(), sourceId: current.id, x: pos.x + current.w + 100, y: pos.y });
    } }); }
    function focus(key?: string) { const box = canvasRef.current?.getBoundingClientRect(); if (!box)
        return; const parts = key ? g.pieces.filter(p => p.id === key) : g.pieces.filter(p => p.parentId === null); if (!parts.length) {
        setViewport({ x: 80, y: 80, z: .65 });
        return;
    } const points = parts.map(p => ({ ...absolutePosition(g, p), w: p.w, h: p.h })), x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y)), w = Math.max(...points.map(p => p.x + p.w)) - x, h = Math.max(...points.map(p => p.y + p.h)) - y, z = Math.max(.08, Math.min(1.2, (box.width - 120) / w, (box.height - 130) / h)); setViewport({ x: (box.width - w * z) / 2 - x * z, y: (box.height - h * z) / 2 - y * z, z }); }
    function zoom(delta: number) { const box = canvasRef.current?.getBoundingClientRect(); if (!box)
        return; setViewport(v => { const z = Math.max(.08, Math.min(2.5, v.z * delta)), cx = box.width / 2, cy = box.height / 2; return { x: cx - (cx - v.x) * z / v.z, y: cy - (cy - v.y) * z / v.z, z }; }); }
    function pointerPart(e: PE, p: Piece, resize = false, proxyId?: string) { if (e.button !== 0)
        return; e.stopPropagation(); if (spaceRef.current || tool === 'hand') {
        panRef.current = { sx: e.clientX, sy: e.clientY, ...viewport };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
    } if (tool === 'connect' && !resize) {
        if (!selected[0])
            choose(p.id);
        else if (selected[0] !== p.id) {
            edit(g => g.connections.push(makeConnection(selected[0], p.id)));
            setTool('select');
            toast.success(t('Connection added.', 'أضيف الرابط.'));
        }
        return;
    } const ids = e.shiftKey ? [...new Set([...selected, p.id])] : selected.includes(p.id) ? selected : [p.id]; setSelected(ids); setProperties(true); if (p.locked || !editable)
        return; checkpoint(); dragRef.current = { sx: e.clientX, sy: e.clientY, graph: clone(graphRef.current), ids, resize, proxyId, pieceId: p.id }; e.currentTarget.setPointerCapture(e.pointerId); }
    function pointerMove(e: PE) { if (panRef.current) {
        const p = panRef.current;
        setViewport(v => ({ ...v, x: p.x + e.clientX - p.sx, y: p.y + e.clientY - p.sy }));
        return;
    } const drag = dragRef.current; if (!drag)
        return; const dx = (e.clientX - drag.sx) / viewport.z, dy = (e.clientY - drag.sy) / viewport.z, next = clone(drag.graph) as Graph, snap = (v: number) => e.altKey ? Math.round(v) : Math.round(v / 4) * 4; if (drag.proxyId) {
        const h = next.proxies.find(h => h.id === drag.proxyId);
        if (h) {
            h.x = snap(h.x + dx);
            h.y = snap(h.y + dy);
        }
    }
    else
        for (const p of next.pieces) {
            if (!drag.ids.includes(p.id) || p.locked || drag.ids.includes(p.parentId))
                continue;
            const target = mobile ? p.mobile : p;
            if (drag.resize && p.id === drag.pieceId) {
                target.w = Math.max(16, snap(Number(target.w ?? p.w) + dx));
                target.h = Math.max(16, snap(Number(target.h ?? p.h) + dy));
            }
            else if (!drag.resize) {
                target.x = snap(Number(target.x ?? p.x) + dx);
                target.y = snap(Number(target.y ?? p.y) + dy);
            }
        } setGraph(next); }
    function pointerEnd() { dragRef.current = null; panRef.current = null; }
    function backgroundPointer(e: PE) { if (e.button !== 0 && e.button !== 1)
        return; if (e.target !== e.currentTarget)
        return; if (tool === 'hand' || spaceRef.current || e.button === 1) {
        panRef.current = { sx: e.clientX, sy: e.clientY, ...viewport };
        e.currentTarget.setPointerCapture(e.pointerId);
    }
    else {
        setSelected([]);
        setProperties(false);
    } }
    useEffect(() => { const down = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommand(v => !v);
        return;
    } if (modal || quote || preview || command || (e.target as HTMLElement)?.closest('input,textarea,[contenteditable=true]'))
        return; if (e.code === 'Space') {
        e.preventDefault();
        spaceRef.current = true;
    } if (e.key === 'Escape') {
        setTool('select');
        setScope(null);
    } if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
    } if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        travel(e.shiftKey ? 'redo' : 'undo');
    } if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        duplicate();
    } if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        groupSelection();
    } if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveDraft().catch(e => toast.error(e.message));
    } if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        focus();
    } if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selected.length) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        edit(g => g.pieces.filter(p => selected.includes(p.id) && !p.locked).forEach(p => { p.x += e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0; p.y += e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0; }));
    } }; const up = (e: KeyboardEvent) => { if (e.code === 'Space')
        spaceRef.current = false; }; window.addEventListener('keydown', down); window.addEventListener('keyup', up); return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); }; }, [g, selected, editable, viewport, modal, quote, preview, command]);
    async function review() { if (!project)
        return; setBusy(true); try {
        await saveDraft();
        const q=await api(`/api/projects/${project.id}/quote`, { method: 'POST', body: { graph: graphRef.current, revision: projectRef.current!.revision } });
        if(q.amount===0){await api('/api/quotes/apply',{method:'POST',body:{quoteId:q.id,requestId:id()}});load(await api<Project>('/api/projects/'+project.id));toast.success(t('Changes applied, free of charge.','اعتمدت التغييرات دون رسوم.'));}else setQuote(q);
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function apply() { if (!quote || !project)
        return; setBusy(true); try {
        await api('/api/quotes/apply', { method: 'POST', body: { quoteId: quote.id, requestId: id() } });
        load(await api<Project>('/api/projects/' + project.id));
        await refreshWallet();
        setQuote(null);
        toast.success(t('Changes applied. Wallet and history updated.', 'اعتمدت التغييرات وحُدّث الرصيد والسجل.'));
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function publish() { if (!project)
        return; setBusy(true); try {
        await api(`/api/projects/${project.id}/publish`, { method: 'POST', body: {} });
        await refreshProject();
        toast.success(t('Private publication is ready.', 'النسخة الخاصة جاهزة.'));
        setModal('project');
    }
    catch (e) {
        toast.error((e as Error).message);
        setModal('checks');
    }
    finally {
        setBusy(false);
    } }
    async function upload(files: FileList | null) { if (!files || !project)
        return; setBusy(true); try {
        for (const file of Array.from(files)) {
            const data = new FormData();
            data.set('file', file);
            await api(`/api/projects/${project.id}/assets`, { method: 'POST', body: data });
        }
        await refreshProject();
        setLeftTab('assets');
        toast.success(t('Original files imported, free of charge.', 'استوردت الملفات الأصلية دون رسوم.'));
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
        if (uploadRef.current)
            uploadRef.current.value = '';
    } }
    function useAsset(a: any) { const type = (a.content_type.startsWith('image/') ? 'image' : a.content_type.startsWith('video/') ? 'video' : a.content_type.startsWith('audio/') ? 'audio' : null) as PieceType | null; if (!type) {
        window.open(`/api/assets/${a.id}?download=1`, '_blank');
        return;
    } const p = makePiece(type, scope, scope ? 24 : 100, scope ? 24 : 100); p.name = a.name; p.props.src = '/api/assets/' + a.id; edit(g => g.pieces.push(p)); choose(p.id); }
    async function importProject(file: File | undefined) { if (!file)
        return; setBusy(true); try {
        if (file.size > 100 * 1024 * 1024)
            throw Error('Project imports are limited to 100 MB.');
        const data = JSON.parse(await file.text()), graph = validateGraph(data.graph || data);
        await saveDraft();
        const p = await api<Project>('/api/projects', { method: 'POST', body: { name: data.name || file.name, kind: 'blank' } }), replacements: Record<string, string> = {};
        for (const a of data.assets || []) {
            if (typeof a.data !== 'string' || !a.data.startsWith('data:'))
                throw Error('Invalid embedded asset.');
            const response = await fetch(a.data), blob = await response.blob(), form = new FormData();
            form.set('file', new File([blob], a.name, { type: a.type }));
            const asset = await api(`/api/projects/${p.id}/assets`, { method: 'POST', body: form });
            replacements[a.path] = asset.url;
        }
        const rewrite = (v: any): any => typeof v === 'string' ? (replacements[v] || v) : Array.isArray(v) ? v.map(rewrite) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x)])) : v;
        await api(`/api/projects/${p.id}/import`, { method: 'POST', body: { graph: validateGraph(rewrite(graph)) } });
        load(await api('/api/projects/' + p.id));
        setProjects([...projects, p]);
        setModal('');
        toast.success(t('Project and source assets imported.', 'استورد المشروع وملفاته الأصلية.'));
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
        if (importRef.current)
            importRef.current.value = '';
    } }
    function attachPrompt() { if (!prompt.trim() || !editable)
        return; const p = makePiece('prompt', null, Math.round((200 - viewport.x) / viewport.z), Math.round((300 - viewport.y) / viewport.z)); p.name = t('Context prompt', 'أمر سياقي'); p.props = { text: prompt, target: selected[0] || scope || '', mode: selected.length ? 'local' : 'global' }; p.style.background = '#2a3025'; p.style.color = '#d5edb0'; edit(g => g.pieces.push(p)); setPrompt(''); choose(p.id); toast.success(t('Instructions attached. Generation awaits a provider.', 'حفظ الأمر وربط بهدفه. التنفيذ ينتظر ربط المزوّد.')); }
    const diff = useMemo(() => project ? diffGraph(project.graph, g) : { added: [], changed: [], deleted: [], connections: 0, rules: 0 }, [g, project?.graph]), estimated = priceDiff(diff, wallet.tariffs || testTariffs).total, dirty = !!project && JSON.stringify(project.graph) !== JSON.stringify(g), issues = useMemo(() => checkPublish(g), [g]), tracks = g.pieces.filter(p => ['video', 'audio'].includes(p.type)), duration = Math.max(8, ...tracks.map(p => (Number(p.props.start) || 0) + (Number(p.props.duration) || 8))), previewHtml = useMemo(() => preview && project ? compileHTML(project.graph, { title: project.name }) : '', [preview, project?.graph]);
    useEffect(() => { if (!playing)
        return; let frame = 0, prev = performance.now(); const tick = () => { const now = performance.now(); setTime(t => { const n = t + (now - prev) / 1000; if (n >= duration) {
        setPlaying(false);
        return 0;
    } return n; }); prev = now; frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [playing, duration]);
    function layer(p: Piece, depth = 0): React.ReactNode { const Icon = partIcons[p.type] || Box; return <div key={p.id}><button className={'layer-item ' + (selected.includes(p.id) ? 'selected ' : '') + (p.hidden ? 'is-hidden' : '')} style={{ paddingInlineStart: 10 + depth * 14 }} onClick={e => choose(p.id, e.shiftKey)} onDoubleClick={() => { setScope(p.id); focus(p.id); }}><Icon size={14}/><span>{p.name}</span>{p.locked && <Lock size={11}/>} {p.hidden && <EyeOff size={11}/>} {children(g, p.id).length > 0 && <small>{children(g, p.id).length}</small>}</button>{children(g, p.id).map(c => layer(c, depth + 1))}</div>; }
    const partProps = { graph: g, selected, scope, mobile, time, playing, zoom: viewport.z, ar, onDown: pointerPart, onMove: pointerMove, onUp: pointerEnd, enter: (key: string) => { setScope(key); focus(key); }, choose: (key: string) => choose(key), attach: (key: string) => edit(g => { g.proxies = g.proxies.filter(h => h.id !== key); }) };
    return <TooltipProvider delayDuration={300}><div className="workshop" data-language={ar ? 'ar' : 'en'}><Toaster richColors position="bottom-right"/><input ref={uploadRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/*,application/pdf,application/json,text/csv" onChange={e => upload(e.target.files)}/><input ref={importRef} type="file" hidden accept=".json,.vorlda" onChange={e => importProject(e.target.files?.[0])}/>
 <header className="topbar"><a className="brand" href="/" aria-label="VORLDA workshop"><span className="brand-mark"><img src="/vorlda-icon.png" alt=""/></span><span>VORLDA<small>WORKSHOP</small></span></a><span className="top-divider"/><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="project-switcher"><FolderOpen size={15}/><span>{project?.name || t('Your workshop', 'ورشتك')}</span><ChevronDown size={13}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="project-menu">{projects.map(p => <DropdownMenuItem key={p.id} onSelect={() => switchProject(p.id)}><Box size={14}/>{p.name}{p.id === project?.id && <Check size={14}/>}</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setModal('new')}><Plus size={14}/>{t('New project', 'مشروع جديد')}</DropdownMenuItem><DropdownMenuItem onSelect={() => importRef.current?.click()}><Upload size={14}/>{t('Import project', 'استيراد مشروع')}</DropdownMenuItem><DropdownMenuItem disabled={!project?.revision||busy} onSelect={()=>void publish()}><ArrowUpRight size={14}/>{t('Publish applied version','نشر النسخة المعتمدة')}</DropdownMenuItem><DropdownMenuItem onSelect={() => setModal('production')}><Sparkles size={14}/>{t('Production & activity','الإنتاج والعمليات')}</DropdownMenuItem><DropdownMenuItem onSelect={() => setModal('library')}><LayoutTemplate size={14}/>{t('My production library','مكتبة الإنتاج')}</DropdownMenuItem><DropdownMenuItem onSelect={() => setModal('project')}><Undo2 size={14}/>{t('Project history & sharing', 'سجل المشروع والمشاركة')}</DropdownMenuItem><DropdownMenuItem onSelect={() => setModal('archive')}><FolderOpen size={14}/>{t('Archived projects','المشاريع المؤرشفة')}</DropdownMenuItem>{project?.role === 'owner' && <DropdownMenuItem onSelect={() => setArchiveConfirm(true)}><Trash2 size={14}/>{t('Archive project', 'أرشفة المشروع')}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu><span className={'save-state ' + status}><Cloud size={13}/>{status === 'saved' ? t('Draft saved', 'المسودة محفوظة') : status === 'saving' ? t('Saving…', 'جار الحفظ…') : status === 'loading' ? t('Opening…', 'جار الفتح…') : status === 'conflict' ? t('Draft conflict', 'تعارض مسودة') : t('Unsaved draft', 'مسودة غير محفوظة')}</span><div className="top-actions"><Button variant="ghost" className="wallet-button" onClick={() => setModal('wallet')}><Wallet size={15}/><span>{money(wallet.total || 0)}</span><small>{wallet.mode === 'test' ? t('TEST', 'تجريبي') : 'USD'}</small></Button><IconButton label={t('Search commands', 'بحث الأوامر')} onClick={() => setCommand(true)}><Search /></IconButton><IconButton label={t('Language', 'اللغة')} onClick={() => setAr(!ar)}><span className="language-label">{ar ? 'EN' : 'ع'}</span></IconButton><Button variant="outline" className="preview-button" disabled={!project?.revision} onClick={() => setPreview(true)}><Play size={14}/><span>{t('Preview', 'معاينة')}</span></Button><Button className="publish-button" disabled={busy || !project?.revision} onClick={publish}>{t('Publish', 'نشر')}<ArrowUpRight size={14}/></Button></div></header>
 <SidebarProvider style={{ '--sidebar-width': '232px' } as CSSProperties} className="workbench"><Sidebar className="parts-sidebar" collapsible="offcanvas"><SidebarHeader><div className="sidebar-caption"><span>{t('YOUR TOOLKIT', 'أدواتك')}</span><span>01 / ∞</span></div><Tabs value={leftTab} onValueChange={setLeftTab}><TabsList className="sidebar-tabs"><TabsTrigger value="parts">{t('Parts', 'القطع')}</TabsTrigger><TabsTrigger value="layers">{t('Layers', 'الطبقات')}</TabsTrigger><TabsTrigger value="assets">{t('Assets', 'الملفات')}</TabsTrigger></TabsList></Tabs><div className="search-field"><Search size={14}/><Input aria-label={t('Search parts and files', 'بحث القطع والملفات')} placeholder={t('Find a part…', 'ابحث عن قطعة…')} value={search} onChange={e => setSearch(e.target.value)}/><kbd>⌘ K</kbd></div></SidebarHeader><SidebarContent className="toolkit-content">
 {leftTab === 'parts' && ['Application', 'Media', 'Design', 'Logic'].map(category => <section className="catalog-group" key={category}><h3>{t(category, ({ Application: 'التطبيق', Media: 'الوسائط', Design: 'التصميم', Logic: 'المنطق' } as Record<string, string>)[category])}</h3><div className="catalog-grid">{catalog.filter(c => c.category === category && (!search || (c.name + c.ar).toLowerCase().includes(search.toLowerCase()))).map(c => { const Icon = partIcons[c.type]; return <button className="catalog-part" key={c.type} disabled={!editable} onClick={() => add(c.type)} title={c.description}><Icon size={20} strokeWidth={1.4}/><span>{ar ? c.ar : c.name}</span><Plus className="add-indicator" size={12}/></button>; })}</div></section>)}
 {leftTab === 'layers' && <div className="layers-panel"><div className="row between tiny-label"><span>{g.pieces.length} {t('parts', 'قطعة')}</span><IconButton label="Add page" onClick={() => add('page')}><Plus size={14}/></IconButton></div>{children(g, null).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())).map(p => layer(p))}{!g.pieces.length && <p className="sidebar-empty">{t('Add your first part to build the hierarchy.', 'أضف أول قطعة لبناء هيكل المشروع.')}</p>}</div>}
 {leftTab === 'assets' && <div className="assets-panel"><Button className="upload-button" variant="outline" disabled={busy || !editable} onClick={() => uploadRef.current?.click()}><Upload size={15}/>{t('Import originals', 'استيراد الملفات الأصلية')}</Button><p className="tiny-muted">{t('Free import · up to 25 MB per file', 'استيراد مجاني · حتى 25 م.ب للملف')}</p>{project?.assets.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase())).map(a => <div className="asset-item" key={a.id}><button className="asset-preview" onClick={() => useAsset(a)}>{a.content_type.startsWith('image/') ? <img alt={a.name} src={'/api/assets/' + a.id}/> : a.content_type.startsWith('video/') ? <Video /> : a.content_type.startsWith('audio/') ? <Music2 /> : <FileJson />}</button><div><button onClick={() => useAsset(a)}>{a.name}</button><small>{Math.ceil(a.size / 1024)} KB</small></div><a aria-label="Download original" href={'/api/assets/' + a.id + '?download=1'}><Download size={13}/></a></div>)}{!project?.assets.length && <div className="sidebar-empty"><Upload size={28}/><p>{t('Your images, clips, sounds and data. Together in one place.', 'صورك ومقاطعك وأصواتك وبياناتك، في مكان واحد.')}</p></div>}</div>}
 </SidebarContent><SidebarFooter><button className="sidebar-rule" onClick={() => setModal('production')}><Sparkles size={16}/><span>{t('Production & activity','الإنتاج والعمليات')}</span></button><button className="sidebar-rule" onClick={() => setModal('library')}><LayoutTemplate size={16}/><span>{t('My production library','مكتبة الإنتاج')}</span></button><button className="sidebar-rule" onClick={() => setModal('rules')}><SlidersHorizontal size={15}/><span>{t('Context & rules', 'السياق والقواعد')}</span><span className="counter">{g.rules.length}</span></button><div className="sidebar-account"><span className="avatar">{user?.name?.slice(0, 1) || 'V'}</span><div><strong>{user?.name || t('Your workspace', 'مساحتك')}</strong><small>{wallet.entitlement?.name || t('Wallet only', 'محفظة فقط')}</small></div>{user?.admin && <IconButton label={t('Pricing settings', 'إعدادات الأسعار')} onClick={() => setModal('settings')}><Settings2 size={15}/></IconButton>}</div></SidebarFooter></Sidebar>
 <main className={'main-stage ' + (properties && current ? 'with-inspector' : '')}><div className="stage-toolbar"><div className="row"><SidebarTrigger className="sidebar-toggle"/><span className="breadcrumb"><button onClick={() => { setScope(null); focus(); }}>{t('Workshop', 'الورشة')}</button>{scope && <><ChevronRight size={12}/><span>{activeScope?.name}</span><button aria-label="Exit scope" onClick={() => setScope(null)}><X size={12}/></button></>}</span><span className="draft-badge">{t('DRAFT', 'مسودة')}</span></div><div className="row stage-views"><IconButton label={t('Desktop layout', 'تصميم الحاسوب')} active={!mobile} onClick={() => setMobile(false)}><Monitor size={15}/></IconButton><IconButton label={t('Mobile overrides', 'تخصيص الجوال')} active={mobile} onClick={() => setMobile(true)}><Smartphone size={15}/></IconButton><span className="divider"/><IconButton label={t('Show connections', 'إظهار الروابط')} active={connectionsVisible} onClick={() => setConnectionsVisible(!connectionsVisible)}><GitBranch size={15}/></IconButton><IconButton label={t('Timeline', 'الخط الزمني')} active={timeline} onClick={() => setTimeline(!timeline)}><Video size={15}/></IconButton><IconButton label={t('Publication checks', 'فحص النشر')} onClick={() => setModal('checks')}><ShieldCheck size={15}/></IconButton><IconButton label={t('Export', 'تصدير')} onClick={() => setModal('export')} disabled={!project?.revision}><Download size={15}/></IconButton></div></div>
 {error && <div className="error-banner" role="alert"><AlertCircle size={16}/><span>{error}</span><Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([JSON.stringify({ name: project?.name, graph: graphRef.current }, null, 2)], { type: 'application/json' }), 'vorlda-local-draft.json')}>{t('Keep local draft', 'حفظ المسودة محليًا')}</Button><Button size="sm" variant="outline" onClick={() => bootstrap()}>{t('Reload', 'إعادة تحميل')}</Button></div>}
 <div className={'infinite-canvas ' + (tool === 'hand' ? 'hand-tool' : '') + (tool === 'connect' ? 'connect-tool' : '')} ref={canvasRef} onPointerDown={backgroundPointer} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onWheel={e => { if (e.ctrlKey || e.metaKey) {
        zoom(e.deltaY > 0 ? .92 : 1.08);
    }
    else
        setViewport(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })); }} style={{ backgroundSize: `${32 * viewport.z}px ${32 * viewport.z}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px` }}>
 <div className="floating-tools"><IconButton label={t('Select', 'تحديد')} active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 /></IconButton><IconButton label={t('Pan (Space)', 'تحريك مساحة العمل')} active={tool === 'hand'} onClick={() => setTool('hand')}><Hand /></IconButton><IconButton label={t('Connect two parts', 'ربط قطعتين')} active={tool === 'connect'} onClick={() => setTool('connect')}><Link2 /></IconButton><span className="toolbar-line"/><IconButton label={t('Add text', 'إضافة نص')} onClick={() => add('text')} disabled={!editable}><Type /></IconButton><IconButton label={t('Add shape', 'إضافة شكل')} onClick={() => add('shape')} disabled={!editable}><Square /></IconButton><IconButton label={t('Import media', 'استيراد وسائط')} onClick={() => uploadRef.current?.click()} disabled={!editable}><ImageIcon /></IconButton></div>
 {status === 'loading' && !project ? <div className="opening-state"><Box size={30}/><p>{t('Opening your workshop…', 'جار فتح ورشتك…')}</p><Skeleton className="h-2 w-40"/></div> : g.pieces.length === 0 && <div className="canvas-welcome" dir={ar ? 'rtl' : 'ltr'}><span className="welcome-orbit"><img src="/vorlda-icon.png" alt=""/></span><p className="eyebrow">{t('AN OPEN SPACE FOR YOUR IDEAS', 'مساحة مفتوحة لأفكارك')}</p><h1>{t('Start with a part.', 'ابدأ بقطعة.')}<br /><em>{t('Make it your world.', 'وابنِ منها عالمك.')}</em></h1><p>{t('Pages, images, films and characters. Build them together, on one continuous canvas.', 'صفحات وصور وأفلام وشخصيات. ابنِها معًا على مساحة عمل واحدة.')}</p><div className="welcome-actions"><Button disabled={!editable} onClick={() => add('page')}><Plus size={16}/>{t('Add your first page', 'أضف أول صفحة')}</Button><Button variant="ghost" disabled={!editable} onClick={() => { setNewKind('application'); setModal('new'); }}>{t('Explore a starting assembly', 'ابدأ من تجميعة جاهزة')}<ArrowUpRight size={14}/></Button></div><small>{t('Start blank, or choose a starting point. Everything is a part.', 'ابدأ من الصفر أو اختر نقطة انطلاق. كل عنصر هنا قطعة.')}</small></div>}
 <div className="world-plane" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.z})` }}>{connectionsVisible && <svg className="connections-svg" width="1" height="1"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#a9cb79"/></marker></defs>{g.connections.map(c => { const from = g.pieces.find(p => p.id === c.from), to = g.pieces.find(p => p.id === c.to); if (!from || !to)
        return null; const a = absolutePosition(g, from), b = absolutePosition(g, to), x = a.x + from.w, y = a.y + from.h / 2, x2 = b.x, y2 = b.y + to.h / 2; return <g key={c.id} opacity={c.disabled ? .25 : 1}><path d={`M ${x} ${y} C ${x + 110} ${y}, ${x2 - 110} ${y2}, ${x2} ${y2}`} stroke="#a9cb7970" strokeWidth={1.5 / viewport.z} strokeDasharray={c.condition ? '6 4' : undefined} fill="none" markerEnd="url(#arrow)"/><text x={(x + x2) / 2} y={(y + y2) / 2 - 10} fill="#a9b3a1" fontSize={10 / viewport.z}>{c.label}</text></g>; })}</svg>}{children(g, null).map(p => <CanvasPart key={p.id} {...partProps} raw={p}/>)}{g.proxies.map(h => { const p = g.pieces.find(p => p.id === h.sourceId); return p ? <CanvasPart key={h.id} {...partProps} raw={p} proxyId={h.id}/> : null; })}</div>
 {selected.length > 0 && <div className="selection-toolbar"><span>{selected.length} {t('selected', 'محدد')}</span><IconButton label={t('Duplicate', 'نسخ مستقل')} onClick={() => duplicate()}><Copy size={14}/></IconButton><IconButton label={t('Linked copy', 'نسخ مرتبط')} onClick={() => duplicate('linked')}><Link2 size={14}/></IconButton><IconButton label={t('Create variant', 'نسخة بديلة')} onClick={() => duplicate('variant')}><GitBranch size={14}/></IconButton><IconButton label={t('Group', 'تجميع')} onClick={groupSelection}><Group size={14}/></IconButton><IconButton label={t('Pull out working proxy', 'إخراج نسخة عمل')} onClick={pullOut}><MoveUpRight size={14}/></IconButton><IconButton label={t('Focus selection', 'التركيز')} onClick={() => focus(selected[0])}><Maximize size={14}/></IconButton><IconButton label={t('Properties', 'الخصائص')} onClick={() => setProperties(!properties)}><PanelRight size={14}/></IconButton><IconButton label={t('Delete', 'حذف')} onClick={remove}><Trash2 size={14}/></IconButton></div>}
 <div className="canvas-bottom"><div className="zoom-controls"><IconButton label="Zoom out" onClick={() => zoom(.8)}><ZoomOut size={14}/></IconButton><button onClick={() => focus()} aria-label="Fit all parts">{Math.round(viewport.z * 100)}%</button><IconButton label="Zoom in" onClick={() => zoom(1.25)}><ZoomIn size={14}/></IconButton><span className="divider"/><IconButton label="Fit canvas" onClick={() => focus()}><Maximize size={14}/></IconButton></div><div className="undo-controls"><IconButton label={t('Undo', 'تراجع')} onClick={() => travel('undo')} disabled={!localHistory.undo}><Undo2 size={15}/></IconButton><IconButton label={t('Redo', 'إعادة')} onClick={() => travel('redo')} disabled={!localHistory.redo}><Redo2 size={15}/></IconButton></div><span className="canvas-hint">{tool === 'connect' ? t('Select a source, then a destination', 'حدد المصدر ثم الوجهة') : t('Space to pan · Double-click to enter a part', 'مسافة للتحريك · نقرتان للدخول إلى قطعة')}</span>{g.pieces.length > 0 && <button className="minimap" aria-label="Fit all parts" onClick={() => focus()}><MiniMap graph={g}/></button>}</div></div>
 {timeline && <div className="timeline-panel"><div className="timeline-header"><Button variant="ghost" size="icon" aria-label={playing ? 'Pause timeline' : 'Play timeline'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14}/> : <Play size={14}/>}</Button><span>{time.toFixed(1)}s / {duration.toFixed(1)}s</span><Slider aria-label="Playhead" value={[time]} min={0} max={duration} step={.1} onValueChange={v => { setPlaying(false); setTime(v[0]); }}/><span>{t('TIMELINE', 'الخط الزمني')}</span><IconButton label="Close timeline" onClick={() => setTimeline(false)}><X size={14}/></IconButton></div>{tracks.length ? tracks.map(p => <div className="timeline-track" key={p.id}><button onClick={() => choose(p.id)}>{p.type === 'audio' ? <Music2 size={13}/> : <Video size={13}/>}<span>{p.name}</span></button><div className="track-lane"><button className={'clip ' + (selected.includes(p.id) ? 'selected' : '')} style={{ left: `${(Number(p.props.start) || 0) / duration * 100}%`, width: `${(Number(p.props.duration) || 8) / duration * 100}%` }} onClick={() => choose(p.id)}>{p.name} · {String(p.props.duration)}s</button><span className="playhead" style={{ left: `${time / duration * 100}%` }}/></div><IconButton label="Split clip at playhead" onClick={() => { const start = Number(p.props.start) || 0, dur = Number(p.props.duration) || 8, cut = time - start; if (cut <= 0 || cut >= dur)
        return toast.error('Move the playhead inside this clip.'); const copy = clone(p); copy.id = id(); copy.name += ' · B'; copy.props = { ...copy.props, start: time, duration: dur - cut, trim: (Number(copy.props.trim) || 0) + cut * (Number(copy.props.speed) || 1) }; edit(g => { g.pieces.find(x => x.id === p.id)!.props.duration = cut; g.pieces.push(copy); }); }}><GitBranch size={13}/></IconButton></div>) : <p className="tiny-muted">{t('Add a video or audio part to arrange clips.', 'أضف فيديو أو صوتًا لترتيب المقاطع.')}</p>}</div>}
 <footer className="prompt-dock"><div className="prompt-context"><Sparkles size={16}/><span>{selected.length ? current?.name : scope ? activeScope?.name : t('Context instructions', 'تعليمات المشروع')}</span><span className="provider-label">{t('Saved as instructions', 'تُحفظ كتعليمات')}</span></div><div className="prompt-row"><Input value={prompt} aria-label={t('Contextual instruction', 'أمر سياقي')} onChange={e => setPrompt(e.target.value)} placeholder={t('Describe what should happen here…', 'صف ما تريد تنفيذه هنا…')} onKeyDown={e => { if (e.key === 'Enter')
        attachPrompt(); }}/><IconButton label={t('Attach prompt to target', 'ربط الأمر بالهدف')} disabled={!prompt.trim() || !editable} onClick={attachPrompt}><CornerDownLeft size={17}/></IconButton><span className="divider"/><div className="review-summary"><span>{dirty ? t('Draft changes', 'تعديلات مسودة') : t('Up to date', 'لا توجد تعديلات')}</span><strong>{dirty ? money(estimated) : t('Ready', 'جاهز')}</strong></div><Button disabled={!editable || !dirty} onClick={review}>{t('Apply changes', 'اعتماد التغييرات')}<ArrowUpRight size={14}/></Button></div><div className="dock-footnote"><span>{t('Draft freely. Review the cost before you apply.', 'صمّم بحرية في المسودة. راجع التكلفة قبل الاعتماد.')}</span><span>{wallet.mode === 'test' ? t('Example rates · test balance', 'أسعار مثال · رصيد تجريبي') : t('USD wallet', 'محفظة بالدولار')}</span></div></footer>
 </main></SidebarProvider>
 <Sheet modal={false} open={properties && !!current} onOpenChange={setProperties}><SheetContent side="right" className="property-sheet" onOpenAutoFocus={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}><SheetTitle className="sr-only">{t('Part properties', 'خصائص القطعة')}</SheetTitle><SheetDescription className="sr-only">{t('Edit the selected part in context.', 'تعديل القطعة المحددة ضمن سياقها.')}</SheetDescription>{current && <Inspector graph={g} piece={current} edit={edit} mobile={mobile} assets={project?.assets || []} select={choose} ar={ar}/>}</SheetContent></Sheet>
 <Modal open={modal === 'archive'} onClose={()=>setModal('')} title={t('Archived projects','المشاريع المؤرشفة')}><ArchivePanel ar={ar} onRestored={async key=>{setProjects((await api('/api/bootstrap')).projects);await switchProject(key);}}/></Modal>
 <Modal open={modal === 'production'} onClose={() => setModal('')} title={t('Production & activity','الإنتاج والعمليات')} description={t('Create, review costs and follow your results.','أنشئ وراجع التكلفة وتابع نتائجك.')} wide>{project && <ProductionPanel project={project} projects={projects} wallet={wallet} ar={ar} refresh={async()=>{await refreshProject();await refreshWallet();}}/>}</Modal>
 <Modal open={modal === 'library'} onClose={() => setModal('')} title={t('My production library','مكتبة الإنتاج')} description={t('Reusable compositions and project identities.','تركيبات جاهزة لإعادة الاستخدام وهويات المشاريع.')} wide><ResourceLibrary graph={g} ar={ar} onPreset={async(name,graph)=>{await saveDraft();const p=await api<Project>('/api/projects',{method:'POST',body:{name,graph}});load(p);setProjects([...projects,p]);setModal('');}} onBrand={kit=>{edit(g=>{const excluded=g.pieces.filter(p=>p.locked).map(p=>p.id);g.rules.push({id:id(),name:kit.name+' · typography',prompt:kit.data.instructions,scope:'global',targets:[],exclude:excluded,type:'',style:{fontFamily:kit.data.font},enabled:true},{id:id(),name:kit.name+' · buttons',prompt:'',scope:'type',targets:[],exclude:excluded,type:'button',style:{background:kit.data.colors[0],color:kit.data.colors[1]||'#ffffff'},enabled:true});});setModal('');toast.success(t('Brand applied to the draft.','طُبّقت الهوية على المسودة.'));}}/></Modal>
 <Modal open={modal === 'wallet'} onClose={() => setModal('')} title={t('Your dollar wallet', 'محفظتك بالدولار')} description={t('A balance that moves with your work.', 'رصيد يرافق عملك.')} wide><WalletPanel wallet={wallet} refresh={refreshWallet} ar={ar}/></Modal>
 <Modal open={modal === 'settings'} onClose={() => setModal('')} title={t('Pricing & subscriptions', 'الأسعار والاشتراكات')} wide><PricingSettings refresh={refreshWallet} ar={ar}/></Modal>
 <Modal open={modal === 'new'} onClose={() => setModal('')} title={t('Make a new world', 'ابدأ عالمًا جديدًا')} description={t('Choose a starting point. Every part stays editable.', 'اختر نقطة انطلاق. تظل كل قطعة قابلة للتعديل.')}><Field label={t('Project name', 'اسم المشروع')} value={newName} onChange={setNewName} placeholder={t('Untitled assembly', 'تجميعة جديدة')}/><div className="assembly-options">{[['blank', 'Blank canvas', 'مساحة فارغة', Box], ['application', 'Application', 'تطبيق', LayoutTemplate], ['image', 'Image composition', 'تصميم صورة', ImageIcon], ['film', 'Film scene', 'مشهد فيلم', Video], ['character', 'Character world', 'عالم شخصية', UserRound]].map(([key, en, a, Icon]) => { const I = Icon as typeof Box; return <button key={String(key)} className={newKind === key ? 'chosen' : ''} onClick={() => setNewKind(String(key))}><I size={22}/><span>{t(String(en), String(a))}</span>{newKind === key && <Check size={15}/>}</button>; })}</div><p className="muted">{t('Start with a free draft. Review and approve the quote before any deduction.', 'ابدأ بمسودة مجانية. راجع عرض التكلفة ووافق عليه قبل أي خصم.')}</p><Button disabled={busy} onClick={newProject}>{t('Create project', 'إنشاء المشروع')}<ArrowUpRight size={15}/></Button></Modal>
 <Modal open={modal === 'project'} onClose={() => setModal('')} title={project?.name || 'Project'} wide>{project && <ProjectPanel project={project} refresh={refreshProject} restore={next => { replace(next); setModal(''); toast.success(t('Version restored to draft.', 'استعيدت النسخة للمسودة.')); }} ar={ar}/>}</Modal>
 <Modal open={modal === 'export'} onClose={() => setModal('')} title={t('Take your work with you', 'صدّر عملك')} description={t('Original files. Real output. Yours to keep.', 'ملفات أصلية ومخرجات فعلية تحتفظ بها.')}>{project && <ExportPanel project={project} ar={ar}/>}</Modal>
 <Modal open={modal === 'checks'} onClose={() => setModal('')} title={t('Publication checks', 'فحوص النشر')}><p className="muted">{t('Checks describe this draft. Publishing uses the most recently applied version.', 'تخص الفحوص المسودة الحالية. يستخدم النشر آخر نسخة معتمدة.')}</p>{issues.length ? issues.map((i, n) => <button className={'issue ' + i.severity} key={n} onClick={() => { if (i.target) {
        choose(g.connections.find(c => c.id === i.target)?.from || i.target);
        setModal('');
    } }}><AlertCircle size={16}/><span>{i.message}</span></button>) : <div className="notice"><Check size={18}/>{t('No structural problems found.', 'لم تظهر مشاكل في هيكل المشروع.')}</div>}</Modal>
 <Modal open={modal === 'rules'} onClose={() => setModal('')} title={t('Rules that follow your work', 'قواعد ترافق عملك')} description={t('Shared styles for current and future parts, with explicit exclusions.', 'أنماط مشتركة للقطع الحالية والمستقبلية مع استثناءات محددة.')} wide><div className="grid-3"><Field label={t('Rule name', 'اسم القاعدة')} value={ruleName} onChange={setRuleName}/><Choice label="Scope" value={ruleScope} onChange={setRuleScope} options={[{ value: 'global', label: t('Global', 'عامة') }, { value: 'type', label: t('Part type', 'نوع القطعة') }, { value: 'pieces', label: t('Selection + descendants', 'المحدد وأبناؤه') }]}/>{ruleScope === 'type' ? <Choice label="Part type" value={ruleType} onChange={setRuleType} options={catalog.map(c => ({ value: c.type, label: ar ? c.ar : c.name }))}/> : <Field label="Fill color" value={ruleColor} onChange={setRuleColor}/>}</div>{ruleScope === 'type' && <Field label="Fill color" value={ruleColor} onChange={setRuleColor}/>}<Button disabled={!editable || !ruleName.trim() || ruleScope === 'pieces' && !selected.length} onClick={() => { edit(g => g.rules.push({ id: id(), name: ruleName, prompt: '', scope: ruleScope as Rule['scope'], targets: [...selected], exclude: [], type: ruleType, style: { background: ruleColor }, enabled: true })); setRuleName(''); }}><Plus size={15}/>{t('Add rule', 'إضافة قاعدة')}</Button>{g.rules.map(r => <div className="rule-editor" key={r.id}><div className="row between"><strong>{r.name}</strong><span className="muted">{r.scope}{r.scope === 'type' ? ' · ' + r.type : ''}</span><Toggle label="Enabled" checked={r.enabled} onChange={v => edit(g => { g.rules.find(x => x.id === r.id)!.enabled = v; })}/><IconButton label="Delete rule" onClick={() => edit(g => { g.rules = g.rules.filter(x => x.id !== r.id); })}><Trash2 size={14}/></IconButton></div><TextField label="Context instructions" value={r.prompt} onChange={v => edit(g => { g.rules.find(x => x.id === r.id)!.prompt = v; })}/><div className="grid-2"><JsonField label="Style" value={r.style} onChange={v => edit(g => { g.rules.find(x => x.id === r.id)!.style = v; })}/><JsonField label="Excluded part IDs" value={r.exclude} onChange={v => edit(g => { g.rules.find(x => x.id === r.id)!.exclude = v; })}/></div></div>)}</Modal>
 <Modal open={!!quote} onClose={() => !busy && setQuote(null)} title={t('Review this operation', 'راجع هذه العملية')} description={t('A fixed quote for this exact draft. Valid for five minutes.', 'عرض ثابت لهذه المسودة بالضبط. صالح لخمس دقائق.')}><div className="quote-total"><span>{t('Total to deduct', 'المبلغ المخصوم')}</span><strong>{money(quote?.amount || 0)}</strong><span className="mode-tag">{wallet.mode === 'test' ? t('TEST BALANCE', 'رصيد تجريبي') : 'USD'}</span></div>{quote?.details?.lines?.map((l: any) => <div className="quote-line" key={l.name}><span>{l.name} × {l.count}</span><strong>{money(l.unit * l.count)}</strong></div>)}{quote?.details?.diff?.deleted?.length > 0 && <div className="quote-line"><span>{t('Deleted parts', 'القطع المحذوفة')} × {quote.details.diff.deleted.length}</span><span>{t('Free', 'مجاني')}</span></div>}<div className="quote-line total"><span>{t('Balance after this operation', 'الرصيد بعد العملية')}</span><strong>{money((wallet.total || 0) - (quote?.amount || 0))}</strong></div>{wallet.total < (quote?.amount || 0) && <div className="notice">{t('Insufficient balance. Your draft remains saved.', 'الرصيد غير كافٍ. تظل مسودتك محفوظة.')}<Button variant="outline" size="sm" onClick={() => { setQuote(null); setModal('wallet'); }}>{t('Open wallet', 'فتح المحفظة')}</Button></div>}<Button disabled={busy || wallet.total < (quote?.amount || 0)} onClick={apply}><Check size={15}/>{busy ? t('Applying…', 'جار الاعتماد…') : t('Approve and apply', 'موافقة واعتماد')}</Button></Modal>
 <Dialog open={preview} onOpenChange={setPreview}><DialogContent className="preview-modal"><DialogHeader><DialogTitle>{project?.name} <span className="muted">· v{project?.revision}</span></DialogTitle><DialogDescription>{t('Applied application preview. Forms receive responses after private publication.', 'معاينة التطبيق المعتمد. تستقبل النماذج الردود بعد نشر نسخة خاصة.')}</DialogDescription></DialogHeader><div className="preview-tools"><Button size="sm" variant={!mobile ? 'default' : 'outline'} onClick={() => setMobile(false)}><Monitor size={15}/>Desktop</Button><Button size="sm" variant={mobile ? 'default' : 'outline'} onClick={() => setMobile(true)}><Smartphone size={15}/>Mobile</Button></div><iframe title="Application preview" sandbox="allow-scripts allow-forms" className={mobile ? 'mobile-preview' : ''} srcDoc={previewHtml}/></DialogContent></Dialog>
 <CommandDialog open={command} onOpenChange={setCommand}><CommandInput placeholder={t('Find a part or command…', 'ابحث عن قطعة أو أمر…')}/><CommandList><CommandEmpty>{t('No matches found.', 'لا توجد نتائج.')}</CommandEmpty><CommandGroup heading={t('Add a part', 'إضافة قطعة')}>{catalog.map(c => { const Icon = partIcons[c.type]; return <CommandItem key={c.type} value={c.name + ' ' + c.ar} onSelect={() => { add(c.type); setCommand(false); }}><Icon size={15}/>{ar ? c.ar : c.name}</CommandItem>; })}</CommandGroup><CommandGroup heading={t('Project', 'المشروع')}><CommandItem onSelect={() => { setCommand(false); setModal('new'); }}><Plus />{t('New project', 'مشروع جديد')}</CommandItem><CommandItem onSelect={() => { setCommand(false); setModal('wallet'); }}><Wallet />{t('Wallet and subscriptions', 'الرصيد والاشتراكات')}</CommandItem><CommandItem onSelect={() => { setCommand(false); setModal('export'); }}><Download />{t('Export', 'تصدير')}</CommandItem><CommandItem onSelect={() => { setCommand(false); focus(); }}><Maximize />{t('Fit all parts', 'إظهار كل القطع')}</CommandItem></CommandGroup></CommandList></CommandDialog>
 <AlertDialog open={archiveConfirm} onOpenChange={setArchiveConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('Archive this project?', 'أرشفة المشروع؟')}</AlertDialogTitle><AlertDialogDescription>{t('It leaves your project list. Assets and billing history are retained.', 'سيختفي من قائمة مشاريعك مع الاحتفاظ بالملفات وسجل الرصيد.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('Cancel', 'إلغاء')}</AlertDialogCancel><AlertDialogAction onClick={async () => { if (!project)
        return; try {
        await saveDraft();
        await api('/api/projects/' + project.id, { method: 'DELETE' });
        await bootstrap();
    }
    catch (e) {
        toast.error((e as Error).message);
    } }}>{t('Archive', 'أرشفة')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div></TooltipProvider>;
}
