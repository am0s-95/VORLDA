"use client";
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Check, AlertCircle, Download, ExternalLink, Copy, Play, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { type Project } from '@/lib/client';
import { checkPublish, type Graph } from '@/lib/world';
import { issueText } from '@/lib/workshop-flow';

export function DeliveryPanel({ project, draft, ar, dirty, busy, goal, setGoal, apply, publish, preview, exportSource, manage, fixIssue }: {
  project: Project; draft: Graph; ar: boolean; dirty: boolean; busy: boolean; goal: string; setGoal: (value: string) => void;
  apply: () => void; publish: () => void; preview: () => void; exportSource: () => void; manage: () => void;
  fixIssue: (issue: ReturnType<typeof checkPublish>[number]) => void;
}) {
  const t = (en: string, a: string) => ar ? a : en;
  const checkedGraph = dirty ? draft : project.graph;
  const issues = checkPublish(checkedGraph), errors = issues.filter(x => x.severity === 'error'), warnings = issues.filter(x => x.severity === 'warning');
  const current = project.publications.filter(x => x.enabled);
  const canEdit = ['owner', 'editor'].includes(project.role), applied = project.revision > 0 && !dirty;
  const issueRow = (issue: typeof issues[number], index: number) => <div className="delivery-issue" key={issue.code + ':' + (issue.target || index)}><span>{issueText(checkedGraph, issue, ar)}</span>{(issue.target || issue.code === 'NO_PAGE') && <Button size="sm" variant="outline" disabled={busy || issue.code === 'NO_PAGE' && !canEdit} onClick={() => fixIssue(issue)}>{issue.code === 'NO_PAGE' ? t('Add page', 'إضافة صفحة') : t('Review part', 'راجع القطعة')}<ArrowUpRight size={14}/></Button>}</div>;
  return <div className="delivery-panel" dir={ar ? 'rtl' : 'ltr'}>
    <Tabs value={goal} onValueChange={setGoal} className="delivery-goals">
      <TabsList aria-label={t('Delivery goal', 'هدف التسليم')}><TabsTrigger value="share"><ExternalLink size={18}/>{t('Private link', 'رابط خاص')}</TabsTrigger><TabsTrigger value="source"><Download size={18}/>{t('Download project', 'تنزيل المشروع')}</TabsTrigger></TabsList>
      <div className={'delivery-check ' + (!applied ? 'pending' : '')} role="status">{applied ? <Check/> : <AlertCircle/>}<div><strong>{applied ? t(`Applied revision ${project.revision}`, `الإصدار المعتمد ${project.revision}`) : t('Your latest work is a draft', 'آخر أعمالك مسودة')}</strong><p>{applied ? t('This is the version you will deliver.', 'هذه هي النسخة التي ستسلّمها.') : t('Preview it, then apply the changes to include them in delivery.', 'عاينها ثم اعتمد التغييرات لتدخل ضمن التسليم.')}</p></div></div>
      <div className="delivery-review-actions"><Button variant="outline" disabled={busy} onClick={preview}><Play size={16}/>{t(dirty ? 'Preview latest changes' : 'Preview app', dirty ? 'معاينة آخر التعديلات' : 'معاينة التطبيق')}</Button>{dirty && <Button disabled={!canEdit || busy} onClick={apply}>{busy ? t('Applying…', 'جار الاعتماد…') : t('Apply changes · free', 'اعتماد التغييرات · مجاني')}</Button>}</div>
      {!canEdit && dirty && <p className="notice">{t('An owner or editor must apply this draft before delivery.', 'يجب أن يعتمد المالك أو المحرر هذه المسودة قبل التسليم.')}</p>}
      <TabsContent value="share">
        <section className="delivery-choice"><h3>{t('Publish and share access', 'انشر وشارك الوصول')}</h3><p>{t('The link follows project membership and site permissions. Form responses are saved in the project.', 'الدخول إلى الرابط يخضع لعضوية المشروع وصلاحيات الموقع. تُحفظ ردود النماذج داخل المشروع.')}</p>
          {errors.length > 0 && <div className="delivery-diagnostics"><strong><AlertCircle size={16}/>{t(`${errors.length} items need attention before publication`, `${errors.length} نقاط تحتاج مراجعة قبل النشر`)}</strong><p className="muted">{dirty ? t('Checks refer to the latest draft.', 'الفحص يخص أحدث مسودة.') : t(`Checks refer to applied revision ${project.revision}.`, `الفحص يخص الإصدار المعتمد ${project.revision}.`)}</p>{errors.map(issueRow)}</div>}
          {warnings.length > 0 && <details className="advanced-details"><summary>{t(`${warnings.length} quality reminders · publication is allowed`, `${warnings.length} ملاحظات للجودة · لا تمنع النشر`)}</summary>{warnings.map(issueRow)}</details>}
          {!canEdit && <p className="muted">{t('Publishing requires an owner or editor.', 'النشر يحتاج صلاحية المالك أو المحرر.')}</p>}
          <Button className="delivery-primary" disabled={busy || !applied || !canEdit || errors.length > 0} onClick={publish}><ExternalLink size={16}/>{t('Publish private version', 'نشر نسخة خاصة')}</Button>
          <Button variant="ghost" onClick={manage}>{t('Members, reviews & responses', 'الأعضاء والمراجعات والردود')}</Button>
        </section>
        {current.length > 0 && <section className="published-links"><h3>{t('Your active links', 'روابطك الفعّالة')}</h3>{current.map(p => <div className="list-item" key={p.id}><div><strong>{p.name}</strong><small>{t('Applied revision', 'الإصدار المعتمد')} {p.revision}</small></div><a href={'/p/' + p.id} target="_blank" rel="noreferrer">{t('Open', 'فتح')} <ExternalLink size={15}/></a><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(new URL('/p/' + p.id, location.origin).href); toast.success(t('Link copied', 'نُسخ الرابط')); } catch { toast.error(t('Open the link and copy its address.', 'افتح الرابط وانسخ عنوانه.')); } }}><Copy size={15}/>{t('Copy', 'نسخ')}</Button></div>)}</section>}
      </TabsContent>
      <TabsContent value="source"><section className="delivery-choice"><h3>{t('Keep the complete project', 'احتفظ بالمشروع كاملًا')}</h3><p>{t('Get editable source code, original assets, build scripts and setup instructions in a ZIP. The next step keeps all export formats and options available.', 'نزّل ZIP فيه الكود القابل للتعديل والأصول الأصلية وملفات البناء وتعليمات التشغيل. في الخطوة التالية تستطيع اختيار صيغة التصدير وإعداداتها.')}</p><Button className="delivery-primary" disabled={!applied || busy} onClick={exportSource}><Download size={16}/>{t('Continue to export options', 'متابعة إلى خيارات التصدير')}</Button><details className="advanced-details"><summary>{t('Running outside VORLDA', 'التشغيل خارج VORLDA')}</summary><p>{t('Open the source in your code editor and run its setup instructions on your Node server. Hosting and domains are separate. An optional owner console can be included; customer accounts, payments and AI services need their own integration.', 'افتح المصدر بمحرر الأكواد واتبع تعليمات التشغيل على خادم Node. الاستضافة والنطاق منفصلان. تستطيع تضمين لوحة مالك اختيارية؛ حسابات العملاء والدفع والذكاء الاصطناعي تحتاج ربطًا مستقلًا.')}</p></details></section></TabsContent>
    </Tabs>
  </div>;
}
