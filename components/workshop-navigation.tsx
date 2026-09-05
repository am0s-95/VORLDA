"use client";
import { useEffect } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { LayoutTemplate, Sparkles, Download, HelpCircle, Plus, Layers3, Code2 } from 'lucide-react';

export function CloseMobileTools({ selection }: { selection: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  useEffect(() => { if (isMobile && selection) setOpenMobile(false); }, [selection, isMobile, setOpenMobile]);
  return null;
}

export function WorkshopNavigation({ ar, name, count, dirty, saved, ready, open }: {
  ar: boolean; name: string; count: number; dirty: boolean; saved: boolean; ready: boolean; open: (panel: string) => void;
}) {
  const t = (en: string, a: string) => ar ? a : en;
  return <section className="workspace-overview" dir={ar ? 'rtl' : 'ltr'}>
    <div className="workspace-heading"><div><span className="eyebrow">{t('BUILD YOUR APPLICATION', 'ابنِ تطبيقك')}</span><h1>{name}</h1></div><div className="workspace-status" role="status"><Layers3 size={15}/><span>{count} {t('parts', 'قطعة')}</span><span className={'state-chip ' + (saved ? 'saved' : '')}>{!saved ? t('Saving draft…', 'جار حفظ المسودة…') : dirty ? t('Draft saved · not applied', 'مسودة محفوظة · لم تُعتمد') : t('Applied version', 'نسخة معتمدة')}</span></div></div>
    <nav className="workshop-shortcuts" aria-label={t('Workspace actions', 'إجراءات مساحة العمل')}>
      <Button variant="outline" onClick={() => open('new')}><Plus size={16}/>{t('New project', 'مشروع جديد')}</Button>
      <Button variant="outline" disabled={!ready} onClick={() => open('code')}><Code2 size={16}/>{t('Programming', 'البرمجة')}</Button>
      <Button variant="outline" onClick={() => open('library')}><LayoutTemplate size={16}/>{t('My library', 'مكتبتي')}</Button>
      <Button variant="outline" disabled={!ready} onClick={() => open('production')}><Sparkles size={16}/>{t('Production', 'الإنتاج')}</Button>
      <Button className="delivery-shortcut" disabled={!ready} onClick={() => open('delivery')}><Download size={16}/>{t('Export & publish', 'التصدير والنشر')}</Button>
      <Button variant="ghost" onClick={() => open('help')}><HelpCircle size={16}/>{t('How to use', 'طريقة الاستخدام')}</Button>
    </nav>
  </section>;
}
