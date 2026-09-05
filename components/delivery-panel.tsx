"use client";
import { Button } from '@/components/ui/button';
import { Check, AlertCircle, Download, ExternalLink, Copy, Play } from 'lucide-react';
import { toast } from 'sonner';
import { type Project } from '@/lib/client';
import { checkPublish } from '@/lib/world';

export function DeliveryPanel({ project, ar, dirty, busy, editable, apply, publish, preview, exportSource, manage }: {
  project: Project; ar: boolean; dirty: boolean; busy: boolean; editable: boolean;
  apply: () => void; publish: () => void; preview: () => void; exportSource: () => void; manage: () => void;
}) {
  const t = (en: string, a: string) => ar ? a : en;
  const errors = checkPublish(project.graph).filter(x => x.severity === 'error');
  const current = project.publications.filter(x => x.enabled);
  return <div className="delivery-panel" dir={ar ? 'rtl' : 'ltr'}>
    <div className={'delivery-check ' + (dirty ? 'pending' : '')}>{dirty ? <AlertCircle/> : <Check/>}<div><strong>{dirty ? t('Your latest changes are still a draft', 'آخر تعديلاتك ما زالت مسودة') : t('Your applied version is selected', 'النسخة المعتمدة محددة للتسليم')}</strong><p>{dirty ? t('Preview them now, then apply them before publishing or exporting.', 'عاينها الآن، ثم اعتمدها قبل النشر أو التصدير.') : t(`Revision ${project.revision} will be exported or published.`, `سيُصدّر أو يُنشر الإصدار ${project.revision}.`)}</p></div></div>
    <div className="row"><Button variant="outline" onClick={preview}><Play size={16}/>{t('Preview draft', 'معاينة المسودة')}</Button>{dirty && <Button disabled={!editable || busy} onClick={apply}>{t('Apply changes · free', 'اعتماد التغييرات · مجاني')}</Button>}</div>
    <div className="delivery-options">
      <article><span className="step-number">01</span><h3>{t('Share a private link', 'شارك رابطًا خاصًا')}</h3><p>{t('Host the applied app here. Access follows your project membership and site permissions. Submitted forms are saved in the project.', 'استضف التطبيق المعتمد هنا. الدخول يخضع لعضوية المشروع وصلاحيات الموقع، وتُحفظ ردود النماذج داخل المشروع.')}</p><Button disabled={busy || dirty || !project.revision || !editable || errors.length > 0} onClick={publish}><ExternalLink size={16}/>{t('Publish private version', 'نشر نسخة خاصة')}</Button><Button variant="ghost" onClick={manage}>{t('Members, reviews & responses', 'الأعضاء والمراجعات والردود')}</Button></article>
      <article><span className="step-number">02</span><h3>{t('Take the source code', 'خذ كود تطبيقك')}</h3><p>{t('Download a ZIP with editable code, build scripts, assets and setup instructions. Open it in your code editor and run it on your own Node server.', 'نزّل ZIP فيه الكود وملفات البناء والأصول وتعليمات التشغيل. افتحه بمحرر الأكواد وشغّله على خادم Node خاص بك.')}</p><Button variant="outline" disabled={dirty || !project.revision || busy} onClick={exportSource}><Download size={16}/>{t('Choose export', 'اختيار التصدير')}</Button><p className="muted">{t('Hosting and domain costs are separate. Optional owner login is configured after export.', 'تكلفة الاستضافة والنطاق منفصلة. يُجهّز حساب المالك الاختياري بعد التصدير.')}</p></article>
    </div>
    {errors.length > 0 && <div className="notice"><AlertCircle size={18}/><span>{t(`${errors.length} structural issues block publication. Open publication checks from the workshop toolbar.`, `توجد ${errors.length} مشاكل بنيوية تمنع النشر. افتح فحص النشر من شريط الورشة.`)}</span></div>}
    {current.length > 0 && <section className="published-links"><h3>{t('Your active links', 'روابطك الفعّالة')}</h3>{current.map(p => <div className="list-item" key={p.id}><div><strong>{p.name}</strong><small>{t('Applied revision', 'الإصدار المعتمد')} {p.revision}</small></div><a href={'/p/' + p.id} target="_blank" rel="noreferrer">{t('Open', 'فتح')} <ExternalLink size={15}/></a><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(new URL('/p/' + p.id, location.origin).href); toast.success(t('Link copied', 'نُسخ الرابط')); } catch { toast.error(t('Open the link and copy its address.', 'افتح الرابط وانسخ عنوانه.')); } }}><Copy size={15}/>{t('Copy', 'نسخ')}</Button></div>)}</section>}
  </div>;
}
