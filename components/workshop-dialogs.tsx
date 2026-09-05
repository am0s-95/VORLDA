"use client";
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Choice, Field, TextField, Toggle, IconButton } from './editor-controls';
import { api, type Project } from '@/lib/client';
import { money, USD_SCALE, type Plan, type Tariffs } from '@/lib/money';
import { type Graph, checkPublish, id } from '@/lib/world';
import { compileHTML } from '@/lib/compiler';
import { downloadBlob, exportStill, exportFilm } from '@/lib/media';
import { toast } from 'sonner';
import { ArrowUpRight, Wallet, Check, Plus, X, Download, ShieldCheck, Clock3, KeyRound, Users, MessageSquare } from 'lucide-react';
export function Modal({ open, onClose, title, description, children, wide = false }: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    wide?: boolean;
}) { return <Dialog open={open} onOpenChange={v => !v && onClose()}><DialogContent className={'workshop-modal ' + (wide ? 'wide' : '')}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description || 'VORLDA · Your creative workshop'}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>; }
export function WalletPanel({ wallet, refresh, ar }: {
    wallet: any;
    refresh: () => Promise<void>;
    ar: boolean;
}) {
    const [busy, setBusy] = useState(false), [amount, setAmount] = useState(25), t = (en: string, a: string) => ar ? a : en;
    async function pay(kind: string, planId?: string) { setBusy(true); try {
        const r = await api('/api/payments/checkout', { method: 'POST', body: { kind, planId, amountCents: Math.round(amount * 100), requestId: id() } });
        window.location.assign(r.url);
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <div className="wallet-panel"><div className="wallet-balance"><div><span className="eyebrow">{t('AVAILABLE BALANCE', 'الرصيد المتاح')}</span><h2>{money(wallet.total || 0)}</h2><span className="mode-tag">{wallet.mode === 'test' ? t('TEST WALLET · NO CASH VALUE', 'رصيد تجريبي · ليس مبلغًا ماليًا') : t('USD WALLET', 'محفظة بالدولار')}</span></div><Wallet size={42}/></div><div className="balance-split"><div><span>{t('Included with subscription', 'رصيد الاشتراك')}</span><strong>{money(wallet.subscription || 0)}</strong></div><div><span>{t('Additional balance', 'الرصيد الإضافي')}</span><strong>{money(wallet.topup || 0)}</strong></div></div>
 <p className="muted">{t('Included balance is used first. Each paid operation shows a quote for your approval. Saving, importing and exporting are free.', 'يستهلك رصيد الاشتراك أولًا. تظهر تكلفة كل عملية مدفوعة قبل الموافقة. الحفظ والاستيراد والتصدير مجانية.')}</p>
 {wallet.mode === 'test' ? <div className="test-funding"><div><strong>{t('Try the complete billing flow', 'جرّب دورة الخصم')}</strong><p>{t('Add $100 once to this test wallet. No payment details needed.', 'أضف 100 دولار مرة واحدة للمحفظة التجريبية دون بيانات دفع.')}</p></div><Button disabled={busy} onClick={async () => { setBusy(true); try {
        await api('/api/wallet/test-grant', { method: 'POST', body: {} });
        await refresh();
        toast.success(t('Test balance is ready.', 'الرصيد التجريبي جاهز.'));
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}><Plus size={15}/>{t('Add test balance', 'إضافة رصيد تجريبي')}</Button></div> : <div className="row topup"><Field label={t('Top-up amount ($)', 'مبلغ الشحن ($)')} type="number" min={5} max={1000} step={1} value={amount} onChange={setAmount}/><Button disabled={busy || !wallet.paymentsReady} onClick={() => pay('topup')}>{t('Add balance', 'شحن الرصيد')}<ArrowUpRight size={15}/></Button></div>}
 <h3 className="section-label">{t('Three plans. One flexible wallet.', 'ثلاث باقات. ومحفظة مرنة.')}</h3><div className="plans">{wallet.plans?.map((p: Plan, i: number) => <div className={'plan ' + (i === 1 ? 'featured' : '')} key={p.id}><span className="eyebrow">0{i + 1}</span><h3>{p.name}</h3><p>{p.description}</p><div className="plan-price">{p.monthlyMicros ? money(p.monthlyMicros) : t('Price pending', 'السعر غير محدد')}<small>{p.monthlyMicros ? t('/ month', '/ شهر') : t('Owner approval required', 'بانتظار اعتماد المالك')}</small></div><div className="plan-grant"><Check size={15}/>{p.grantMicros ? `${money(p.grantMicros)} ${t('included balance', 'رصيد شهري')}` : t('Monthly dollar balance to be set', 'يُحدد الرصيد الشهري لاحقًا')}</div><div className="plan-grant"><Check size={15}/>{t('Add more balance anytime', 'إمكانية شحن رصيد إضافي')}</div><Button variant={i === 1 ? 'default' : 'outline'} disabled={busy || !p.active || !wallet.paymentsReady} onClick={() => pay('subscription', p.id)}>{p.active && wallet.paymentsReady ? t('Subscribe', 'اشترك') : t('Not enabled yet', 'لم تُفعّل بعد')}</Button></div>)}</div>
 {wallet.subscriptions?.length > 0 && <div className="row between"><span>{wallet.subscriptions[0].plan_id} · {wallet.subscriptions[0].status}</span><Button variant="outline" disabled={busy || !wallet.paymentsReady} onClick={async () => { try {
        const r = await api('/api/payments/portal', { method: 'POST', body: {} });
        window.location.assign(r.url);
    }
    catch (e) {
        toast.error((e as Error).message);
    } }}>{t('Manage subscription', 'إدارة الاشتراك')}</Button></div>}
 <h3 className="section-label">{t('Balance activity', 'حركة الرصيد')}</h3><Table><TableHeader><TableRow><TableHead>{t('Activity', 'العملية')}</TableHead><TableHead>{t('Date', 'التاريخ')}</TableHead><TableHead className="text-right">{t('Amount', 'المبلغ')}</TableHead></TableRow></TableHeader><TableBody>{wallet.ledger?.length ? wallet.ledger.map((e: any) => <TableRow key={e.id}><TableCell>{e.description}<small className="ledger-kind">{e.kind}</small></TableCell><TableCell className="muted">{new Date(e.created_at).toLocaleString(ar ? 'ar' : 'en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell><TableCell className={'text-right ' + (e.amount > 0 ? 'positive' : '')}>{e.amount > 0 ? '+' : ''}{money(e.amount)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="empty-row">{t('Your balance activity will appear here.', 'ستظهر حركة الرصيد هنا.')}</TableCell></TableRow>}</TableBody></Table></div>;
}
export function PricingSettings({ refresh, ar }: {
    refresh: () => Promise<void>;
    ar: boolean;
}) { const [settings, setSettings] = useState<any>(null), [busy, setBusy] = useState(false), t = (e: string, a: string) => ar ? a : e; useEffect(() => { api('/api/admin/settings').then(setSettings).catch(e => toast.error(e.message)); }, []); if (!settings)
    return <p>{t('Loading settings…', 'جار تحميل الإعدادات…')}</p>; const patchPlan = (id: string, v: Partial<Plan>) => setSettings({ ...settings, plans: settings.plans.map((p: Plan) => p.id === id ? { ...p, ...v } : p) }); return <div className="settings-panel"><div className="notice"><ShieldCheck size={18}/>{t('Editing these values does not enable real payments. Live billing also requires the merchant connection and the live runtime setting.', 'تعديل القيم لا يفعّل الدفع الحقيقي. يلزم ربط حساب الدفع وتفعيل وضع الفوترة الحقيقي.')}</div><div className="plans">{settings.plans.map((p: Plan) => <div className="plan" key={p.id}><Field label="Plan name" value={p.name} onChange={name => patchPlan(p.id, { name })}/><Field label="Monthly price ($)" value={p.monthlyMicros / USD_SCALE} type="number" min={0} step={1} onChange={v => patchPlan(p.id, { monthlyMicros: Math.round(v * USD_SCALE) })}/><Field label="Included balance ($)" value={p.grantMicros / USD_SCALE} type="number" min={0} step={1} onChange={v => patchPlan(p.id, { grantMicros: Math.round(v * USD_SCALE) })}/><Field label="Description" value={p.description} onChange={description => patchPlan(p.id, { description })}/><Field label="Provider monthly price ID" value={p.stripePriceId} onChange={stripePriceId => patchPlan(p.id, { stripePriceId })}/><Toggle label="Enable this plan" checked={p.active} onChange={active => patchPlan(p.id, { active })}/></div>)}</div><h3 className="section-label">{t('Usage price per operation ($)', 'أسعار الاستخدام لكل عملية ($)')}</h3><div className="grid-3">{['add', 'edit', 'connect', 'rule', 'run'].map(key => <Field key={key} label={key} value={settings.tariffs[key] / USD_SCALE} min={0} type="number" step={.001} onChange={v => setSettings({ ...settings, tariffs: { ...settings.tariffs, [key]: Math.round(v * USD_SCALE) } })}/>)}</div><Toggle label={t('I approve these usage prices for live billing', 'أعتمد أسعار الاستخدام للفوترة الحقيقية')} checked={settings.tariffs.approved} onChange={approved => setSettings({ ...settings, tariffs: { ...settings.tariffs, approved } })}/><p className="muted">{t('The initial usage rates are test examples. Subscription rollover has no automatic expiry in this implementation.', 'أسعار الاستخدام الأولية أمثلة تجريبية. لا تنتهي صلاحية الرصيد تلقائيًا في هذا التنفيذ.')}</p>{settings.paymentReviews?.length > 0 && <div className="notice">{settings.paymentReviews.length} payments require review for refunds or disputes. Grant corrections require a reviewed ledger adjustment.</div>}<Button disabled={busy} onClick={async () => { setBusy(true); try {
    await api('/api/admin/settings', { method: 'PUT', body: settings });
    await refresh();
    toast.success(t('Pricing saved.', 'تم حفظ الأسعار.'));
}
catch (e) {
    toast.error((e as Error).message);
}
finally {
    setBusy(false);
} }}>{t('Save pricing', 'حفظ الأسعار')}</Button></div>; }
async function assetBundle(project: Project) { const files: any[] = []; for (const a of project.assets) {
    const r = await fetch(`/api/assets/${a.id}`);
    if (!r.ok)
        throw Error(`Cannot export ${a.name}.`);
    const blob = await r.blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    files.push({ path: `/api/assets/${a.id}`, name: a.name, type: a.content_type, data });
} return files; }
export function ExportPanel({ project, ar }: {
    project: Project;
    ar: boolean;
}) { const [format, setFormat] = useState('project'), [sceneId, setSceneId] = useState(project.graph.entries[0] || project.graph.pieces.find(p => p.type === 'page')?.id || ''), [duration, setDuration] = useState(8), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [abort, setAbort] = useState<AbortController | null>(null), t = (e: string, a: string) => ar ? a : e; const scenes = project.graph.pieces.filter(p => p.type === 'page'); async function run() { setBusy(true); setProgress(0); const controller = new AbortController(); setAbort(controller); try {
    const name = project.name.replace(/[^\p{L}\p{N}_-]/gu, '_'), scene = project.graph.pieces.find(p => p.id === sceneId);
    if (format === 'project') {
        const assets = await assetBundle(project);
        downloadBlob(new Blob([JSON.stringify({ format: 'vorlda-project', version: 1, name: project.name, graph: project.graph, assets }, null, 2)], { type: 'application/json' }), name + '.vorlda.json');
    }
    else if (format === 'html') {
        const assets = await assetBundle(project);
        downloadBlob(new Blob([compileHTML(project.graph, { title: project.name, entry: sceneId, assetUrls: Object.fromEntries(assets.map(a => [a.path, a.data])) })], { type: 'text/html' }), name + '.html');
    }
    else {
        if (!scene)
            throw Error(t('Choose a saved scene.', 'اختر مشهدًا محفوظًا.'));
        const blob = format === 'png' ? await exportStill(project.graph, scene) : await exportFilm(project.graph, scene, duration, setProgress, controller.signal);
        downloadBlob(blob, name + (format === 'png' ? '.png' : blob.type.startsWith('video/mp4') ? '.mp4' : '.webm'));
    }
    toast.success(t('Export ready.', 'التصدير جاهز.'));
}
catch (e) {
    toast.error((e as Error).message);
}
finally {
    setBusy(false);
    setAbort(null);
} } return <div className="export-panel"><div className="notice">{t(`Exports use applied revision ${project.revision}. Draft changes must be reviewed and applied first.`, `يستخدم التصدير النسخة المعتمدة ${project.revision}. راجع تعديلات المسودة واعتمدها أولًا.`)}</div><Choice label="Export format" value={format} onChange={setFormat} options={[{ value: 'project', label: t('Project + original assets (.vorlda.json)', 'المشروع والملفات الأصلية (.vorlda.json)') }, { value: 'html', label: t('Application · standalone HTML', 'التطبيق · ملف HTML مستقل') }, { value: 'png', label: t('Composition · PNG image', 'التصميم · صورة PNG') }, { value: 'film', label: t('Film · video with audio', 'فيلم · فيديو مع الصوت') }]}/>{format !== 'project' && <Choice label="Scene or entry" value={sceneId} onChange={setSceneId} options={scenes.map(p => ({ value: p.id, label: p.name }))}/>}<p className="muted">{format === 'html' ? t('Assets are embedded. Navigation and local data actions work offline. Receiving form submissions needs a backend; use a private publication for saved responses.', 'تُدمج الملفات داخل التصدير. تعمل الروابط والبيانات المحلية دون اتصال. استقبال ردود النماذج يحتاج خادمًا؛ استخدم النشر الخاص لحفظ الردود.') : format === 'film' ? t('The browser records the composition in real time. Keep this tab visible until it finishes.', 'يسجل المتصفح المشهد في الزمن الفعلي. أبقِ النافذة ظاهرة حتى انتهاء التصدير.') : t('Export is free. The original project and imported files stay available.', 'التصدير مجاني. يظل المشروع والملفات الأصلية محفوظة.')}</p>{format === 'film' && <Field label={t('Duration (seconds)', 'المدة بالثواني')} value={duration} onChange={setDuration} type="number" min={1} max={180}/>}<div className="row"><Button disabled={busy || !project.revision} onClick={run}><Download size={15}/>{busy ? t('Exporting…', 'جار التصدير…') : t('Export', 'تصدير')}</Button>{busy && format === 'film' && <Button variant="outline" onClick={() => abort?.abort()}>{t('Cancel', 'إلغاء')}</Button>}</div>{busy && format === 'film' && <Progress value={progress * 100}/>}</div>; }
export function ProjectPanel({ project, refresh, restore, ar }: {
    project: Project;
    refresh: () => Promise<void>;
    restore: (g: Graph) => void;
    ar: boolean;
}) {
    const [name, setName] = useState(project.name), [comment, setComment] = useState(''), [email, setEmail] = useState(''), [role, setRole] = useState('viewer'), [tokenName, setTokenName] = useState('My integration'), [token, setToken] = useState(''), [limit, setLimit] = useState(0), [writable, setWritable] = useState(false), [execution, setExecution] = useState(false), t = (e: string, a: string) => ar ? a : e;
    const req = async (action: string, body?: unknown, method = 'POST') => { try {
        await api(`/api/projects/${project.id}/${action}`, { method, body });
        await refresh();
    }
    catch (e) {
        toast.error((e as Error).message);
    } };
    return <Tabs defaultValue="history"><TabsList className="project-tabs"><TabsTrigger value="history"><Clock3 size={14}/>{t('History', 'السجل')}</TabsTrigger><TabsTrigger value="review"><MessageSquare size={14}/>{t('Review', 'مراجعة')}</TabsTrigger><TabsTrigger value="members"><Users size={14}/>{t('Members', 'الأعضاء')}</TabsTrigger><TabsTrigger value="responses">{t('Responses', 'الردود')}</TabsTrigger><TabsTrigger value="integrations"><KeyRound size={14}/>{t('API', 'الربط')}</TabsTrigger></TabsList>
 <TabsContent value="history"><div className="row"><Field label={t('Project name', 'اسم المشروع')} value={name} onChange={setName}/><Button variant="outline" disabled={project.role === 'viewer' || project.role === 'reviewer'} onClick={async () => { try {
        await api('/api/projects/' + project.id, { method: 'PATCH', body: { name } });
        await refresh();
    }
    catch (e) {
        toast.error((e as Error).message);
    } }}>{t('Rename', 'تسمية')}</Button><Button variant="outline" onClick={() => req('snapshot', { label: `Checkpoint · ${new Date().toLocaleDateString()}` })}>{t('Checkpoint', 'حفظ نسخة')}</Button></div><div className="item-list">{project.snapshots.map(s => <div className="list-item" key={s.id}><div><strong>{s.label}</strong><small>v{s.revision} · {new Date(s.created_at).toLocaleString()}</small></div><Button variant="outline" size="sm" onClick={async () => { try {
        const r = await api(`/api/projects/${project.id}/snapshots/${s.id}`);
        restore(r.graph);
    }
    catch (e) {
        toast.error((e as Error).message);
    } }}>{t('Restore to draft', 'استعادة للمسودة')}</Button></div>)}{!project.snapshots.length && <p className="empty-row">{t('Applied versions and checkpoints appear here.', 'تظهر هنا النسخ المعتمدة والمحفوظة.')}</p>}</div><h3 className="section-label">{t('Private publications', 'النسخ المنشورة الخاصة')}</h3>{project.publications.map(p => <div className="list-item" key={p.id}><a href={'/p/' + p.id} target="_blank" rel="noreferrer">{p.name} · v{p.revision} <ArrowUpRight size={13}/></a>{p.enabled ? <Button size="sm" variant="ghost" onClick={() => req('publications/' + p.id, undefined, 'DELETE')}>{t('Revoke', 'إيقاف')}</Button> : <span>{t('Revoked', 'متوقفة')}</span>}</div>)}</TabsContent>
 <TabsContent value="review"><TextField label={t('Project comment', 'تعليق على المشروع')} value={comment} onChange={setComment}/><Button disabled={!comment.trim()} onClick={async () => { await req('comments', { body: comment }); setComment(''); }}>{t('Add comment', 'إضافة تعليق')}</Button>{project.comments.map(c => <div className={'comment ' + (c.resolved ? 'resolved' : '')} key={c.id}><div className="row between"><strong>{c.name}</strong><small>{new Date(c.created_at).toLocaleDateString()}</small></div><p>{c.body}</p><Button variant="ghost" size="sm" onClick={() => req('comments/' + c.id, { resolved: !c.resolved }, 'PATCH')}>{c.resolved ? t('Reopen', 'إعادة فتح') : t('Resolve', 'تمت المعالجة')}</Button></div>)}</TabsContent>
 <TabsContent value="members"><p className="notice">{t('Project roles apply after a person has access to this private site. Adding an email here does not send an invitation or change site access.', 'تطبق الصلاحيات بعد إتاحة الموقع الخاص للشخص. إضافة البريد هنا لا ترسل دعوة ولا تغيّر خصوصية الموقع.')}</p>{project.role === 'owner' && <div className="row"><Field label="Email" value={email} onChange={setEmail}/><Choice label="Role" value={role} options={['viewer', 'reviewer', 'editor']} onChange={setRole}/><Button onClick={async () => { await req('members', { email, role }); setEmail(''); }}><Plus size={15}/>{t('Add', 'إضافة')}</Button></div>}{project.members.map(m => <div className="list-item" key={m.id}><span>{m.email}</span><span>{m.role}</span>{project.role === 'owner' && <IconButton label="Remove member" onClick={() => req('members/' + m.id, undefined, 'DELETE')}><X /></IconButton>}</div>)}</TabsContent>
 <TabsContent value="responses"><p className="muted">{t('Validated submissions from this project’s private publications.', 'الردود المستلمة من النماذج في النسخ المنشورة الخاصة.')}</p><Button variant="outline" onClick={() => downloadBlob(new Blob([JSON.stringify(project.submissions, null, 2)], { type: 'application/json' }), 'responses.json')}><Download size={15}/>{t('Export responses', 'تصدير الردود')}</Button>{project.submissions.map(s => <div className="comment" key={s.id}><small>{new Date(s.created_at).toLocaleString()}</small><pre>{JSON.stringify(JSON.parse(s.data), null, 2)}</pre></div>)}{!project.submissions.length && <p className="empty-row">{t('No responses yet.', 'لا توجد ردود بعد.')}</p>}</TabsContent>
 <TabsContent value="integrations"><p className="notice">{t('Tokens belong to this project, expire after 30 days and are shown only once. Execution needs an explicit spending limit and a reviewed quote. Site access controls still apply.', 'الرموز خاصة بالمشروع وتنتهي بعد 30 يومًا وتظهر مرة واحدة. التنفيذ يحتاج حد إنفاق وعرض تكلفة. تظل صلاحيات الموقع مطبقة.')}</p>{project.role === 'owner' && <><Field label="Integration name" value={tokenName} onChange={setTokenName}/><Toggle label="Allow draft edits" checked={writable} onChange={setWritable}/><Toggle label="Allow paid execution" checked={execution} onChange={setExecution}/><Field label="Maximum per approved charge ($)" value={limit} type="number" min={0} max={1000} step={.01} onChange={setLimit}/><Button onClick={async () => { try {
        const r = await api(`/api/projects/${project.id}/tokens`, { method: 'POST', body: { name: tokenName, scopes: ['read', ...(writable ? ['write'] : []), ...(execution ? ['execute'] : [])], maxCharge: Math.round(limit * USD_SCALE) } });
        setToken(r.token);
        await refresh();
    }
    catch (e) {
        toast.error((e as Error).message);
    } }}>{t('Create integration token', 'إنشاء رمز ربط')}</Button>{token && <div className="token-display"><code>{token}</code><Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(token).then(() => toast.success('Copied')).catch(() => toast.error('Select and copy the token manually.'))}>{t('Copy', 'نسخ')}</Button></div>}</>}{project.tokens.map(s => <div className="list-item" key={s.id}><div><strong>{s.name}</strong><small>{s.scopes} · {money(s.max_charge)} max</small></div><Button size="sm" variant="ghost" onClick={() => req('tokens/' + s.id, undefined, 'DELETE')}>{t('Revoke', 'إلغاء')}</Button></div>)}</TabsContent></Tabs>;
}
