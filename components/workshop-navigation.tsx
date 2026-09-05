"use client";
import { useEffect } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { LayoutTemplate, Sparkles, Download, HelpCircle, Plus, Layers3, Code2, SlidersHorizontal, MoreHorizontal, Monitor, Smartphone, GitBranch, Video, ShieldCheck, MousePointer2, Hand, Link2, Group, Search } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuLabel, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { toolMode, type ToolMode } from '@/lib/contextual-tools';

export function CloseMobileTools({ selection, overlayOpen }: { selection: string; overlayOpen: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  useEffect(() => { if (isMobile && (selection || overlayOpen)) setOpenMobile(false); }, [selection, overlayOpen, isMobile, setOpenMobile]);
  return null;
}

export function MobileToolkitClose({ ar }: { ar: boolean }) {
  const { setOpenMobile } = useSidebar();
  return <Button className="mobile-toolkit-close" variant="outline" onClick={() => setOpenMobile(false)}>{ar ? 'العودة للمشروع' : 'Back to project'}</Button>;
}

export function WorkshopNavigation({ ar, name, count, dirty, saved, ready, open, mode, showCode, onModeChange, prepareAdd, searchCommands }: {
  ar: boolean; name: string; count: number; dirty: boolean; saved: boolean; ready: boolean; open: (panel: string) => void; mode: ToolMode; showCode: boolean; onModeChange: (mode: ToolMode) => void; prepareAdd: () => void; searchCommands: () => void;
}) {
  const t = (en: string, a: string) => ar ? a : en;
  const { setOpenMobile } = useSidebar();
  const displayOptions = <><DropdownMenuLabel>{t('Tool display on this device', 'عرض الأدوات على هذا الجهاز')}</DropdownMenuLabel><DropdownMenuRadioGroup value={mode} onValueChange={value => onModeChange(toolMode(value))}><DropdownMenuRadioItem value="auto">{t('Automatic · follow the project', 'تلقائي · حسب المشروع')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="simple">{t('Simple · open extras when needed', 'مبسط · افتح الإضافات عند الحاجة')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="advanced">{t('Advanced · show programming tools', 'متقدم · إظهار أدوات البرمجة')}</DropdownMenuRadioItem></DropdownMenuRadioGroup></>;
  return <section className="workspace-overview" dir={ar ? 'rtl' : 'ltr'}>
    <div className="workspace-heading"><div><span className="eyebrow">{t('BUILD YOUR APPLICATION', 'ابنِ تطبيقك')}</span><h1>{name}</h1></div><div className="workspace-status" role="status"><Layers3 size={15}/><span>{count} {t('parts', 'قطعة')}</span><span className={'state-chip ' + (saved ? 'saved' : '')}>{!saved ? t('Saving draft…', 'جار حفظ المسودة…') : dirty ? t('Draft saved · not applied', 'مسودة محفوظة · لم تُعتمد') : t('Applied version', 'نسخة معتمدة')}</span></div></div>
    <nav className="mobile-workshop-actions" aria-label={t('Workspace actions', 'إجراءات مساحة العمل')}>
      <Button variant="outline" disabled={!ready} onClick={() => { prepareAdd(); setOpenMobile(true); }}><Plus size={18}/>{t('Add', 'إضافة')}</Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><MoreHorizontal size={18}/>{t('More', 'المزيد')}</Button></DropdownMenuTrigger><DropdownMenuContent className="workshop-menu" align="center" collisionPadding={12}>
        <DropdownMenuItem onSelect={searchCommands}><Search/>{t('Search commands', 'بحث الأوامر')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open('new')}><Plus/>{t('New project', 'مشروع جديد')}</DropdownMenuItem>
        <DropdownMenuItem disabled={!ready} onSelect={() => open('production')}><Sparkles/>{t('Production & activity', 'الإنتاج والعمليات')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open('library')}><LayoutTemplate/>{t('My library', 'مكتبتي')}</DropdownMenuItem>
        <DropdownMenuItem disabled={!ready} onSelect={() => open('code')}><Code2/>{t('Programming', 'البرمجة')}</DropdownMenuItem>
        <DropdownMenuItem disabled={!ready} onSelect={() => open('project')}><Layers3/>{t('History & sharing', 'السجل والمشاركة')}</DropdownMenuItem>
        <DropdownMenuSeparator/>{displayOptions}<DropdownMenuSeparator/>
        <DropdownMenuItem onSelect={() => open('help')}><HelpCircle/>{t('How to use', 'طريقة الاستخدام')}</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
      <Button className="delivery-shortcut" disabled={!ready} onClick={() => open('delivery')}><Download size={18}/>{t('Deliver', 'تسليم')}</Button>
    </nav>
    <nav className="workshop-shortcuts desktop-workshop-actions" aria-label={t('Workspace actions', 'إجراءات مساحة العمل')}>
      <Button variant="outline" onClick={() => open('new')}><Plus size={16}/>{t('New project', 'مشروع جديد')}</Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost"><SlidersHorizontal size={16}/>{mode === 'auto' ? t('Tools as needed', 'الأدوات حسب الحاجة') : mode === 'simple' ? t('Simple view', 'عرض مبسط') : t('Advanced tools', 'أدوات متقدمة')}</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{displayOptions}<DropdownMenuSeparator/><DropdownMenuItem disabled={!ready} onSelect={() => open('code')}><Code2 size={16}/>{t('Open code files and tools', 'فتح ملفات وأدوات البرمجة')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      {showCode && <Button variant="outline" onClick={() => open('code')}><Code2 size={16}/>{t('Programming', 'البرمجة')}</Button>}
      <Button variant="outline" onClick={() => open('library')}><LayoutTemplate size={16}/>{t('My library', 'مكتبتي')}</Button>
      <Button variant="outline" disabled={!ready} onClick={() => open('production')}><Sparkles size={16}/>{t('Production', 'الإنتاج')}</Button>
      <Button className="delivery-shortcut" disabled={!ready} onClick={() => open('delivery')}><Download size={16}/>{t('Export & publish', 'التصدير والنشر')}</Button>
      <Button variant="ghost" onClick={() => open('help')}><HelpCircle size={16}/>{t('How to use', 'طريقة الاستخدام')}</Button>
    </nav>
  </section>;
}

export function MobileViewMenu({ ar, mobile, setMobile, connections, setConnections, timeline, setTimeline, checks }: {
  ar: boolean; mobile: boolean; setMobile: (v: boolean) => void; connections: boolean; setConnections: (v: boolean) => void; timeline: boolean; setTimeline: (v: boolean) => void; checks: () => void;
}) {
  const t = (en: string, a: string) => ar ? a : en;
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="mobile-view-trigger"><SlidersHorizontal size={17}/>{t('View', 'العرض')}</Button></DropdownMenuTrigger><DropdownMenuContent className="workshop-menu" align="end" collisionPadding={12}>
    <DropdownMenuLabel>{t('Project layout', 'تصميم المشروع')}</DropdownMenuLabel>
    <DropdownMenuRadioGroup value={mobile ? 'phone' : 'desktop'} onValueChange={v => setMobile(v === 'phone')}><DropdownMenuRadioItem value="desktop"><Monitor/>{t('Desktop layout', 'تصميم الحاسوب')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="phone"><Smartphone/>{t('Phone layout', 'تصميم الهاتف')}</DropdownMenuRadioItem></DropdownMenuRadioGroup>
    <DropdownMenuSeparator/><DropdownMenuCheckboxItem checked={connections} onCheckedChange={setConnections}><GitBranch/>{t('Connections', 'الروابط')}</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={timeline} onCheckedChange={setTimeline}><Video/>{t('Timeline', 'الخط الزمني')}</DropdownMenuCheckboxItem><DropdownMenuSeparator/>
    <DropdownMenuItem onSelect={checks}><ShieldCheck/>{t('Publication checks', 'فحص النشر')}</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;
}

export function MobileCanvasTools({ ar, tool, setTool, multiSelect, setMultiSelect }: {
  ar: boolean; tool: string; setTool: (v: string) => void; multiSelect: boolean; setMultiSelect: (v: boolean) => void;
}) {
  const t = (en: string, a: string) => ar ? a : en;
  return <div className="mobile-canvas-tools" role="toolbar" aria-label={t('Canvas tools', 'أدوات المساحة')}>
    <Button variant="ghost" aria-pressed={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={17}/>{t('Select', 'تحديد')}</Button>
    <Button variant="ghost" aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}><Hand size={17}/>{t('Move', 'تحريك')}</Button>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" aria-label={t('More canvas tools', 'أدوات إضافية للمساحة')} aria-pressed={tool === 'connect' || multiSelect}><MoreHorizontal size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent className="workshop-menu" align="start" collisionPadding={12}>
      <DropdownMenuCheckboxItem checked={tool === 'connect'} onCheckedChange={v => setTool(v ? 'connect' : 'select')}><Link2/>{t('Connect two parts', 'ربط قطعتين')}</DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked={multiSelect} onCheckedChange={setMultiSelect}><Group/>{t('Select multiple parts', 'تحديد عدة قطع')}</DropdownMenuCheckboxItem>
    </DropdownMenuContent></DropdownMenu>
  </div>;
}
