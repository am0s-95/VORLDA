"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field,Toggle,TextField } from './editor-controls';
import { api,type Project } from '@/lib/client';
import { toast } from 'sonner';
export function ReviewControls({project,refresh,ar}:{project:Project;refresh:()=>Promise<void>;ar:boolean}){
 const t=(en:string,a:string)=>ar?a:en,[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 async function send(path:string,body:unknown,method='POST'){setBusy(true);try{await api(`/api/projects/${project.id}/`+path,{method,body});await refresh()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <div className="resource-card"><strong>{t('Publication approval','اعتماد النشر')}</strong><p className="muted">{t('Approval applies to one saved revision. New applied changes need a fresh review.','الاعتماد يخص نسخة محفوظة واحدة. التغييرات الجديدة المعتمدة تحتاج مراجعة جديدة.')}</p>{project.role==='owner'&&<Toggle label={t('Require approval before publishing','اشتراط الاعتماد قبل النشر')} checked={project.requireReview} onChange={required=>void send('review-policy',{required},'PUT')}/>}<p>{t('Current revision','النسخة الحالية')}: {project.revision}</p>{project.reviews?.map(r=><div className="list-item" key={r.id}><span>{r.name}</span><strong>{r.decision==='approved'?t('Approved','معتمدة'):t('Changes requested','تحتاج تعديلات')}</strong></div>)}{['owner','reviewer'].includes(project.role)&&project.entitlement?.tier==='studio'&&<><TextField label={t('Review note','ملاحظة المراجعة')} value={note} onChange={setNote}/><div className="row"><Button disabled={busy||!project.revision} onClick={()=>send('reviews',{revision:project.revision,decision:'approved',note})}>{t('Approve revision','اعتماد النسخة')}</Button><Button variant="outline" disabled={busy||!project.revision} onClick={()=>send('reviews',{revision:project.revision,decision:'changes_requested',note})}>{t('Request changes','طلب تعديلات')}</Button></div></>}{project.entitlement?.tier!=='studio'&&<p className="muted">{t('Publication approval policies require Studio.','سياسة اعتماد النشر متاحة في Studio.')}</p>}</div>;
}
export function MemberAllowance({member,project,refresh,ar}:{member:any;project:Project;refresh:()=>Promise<void>;ar:boolean}){
 const [amount,setAmount]=useState((member.monthly_limit||0)/1000000),[busy,setBusy]=useState(false),t=(en:string,a:string)=>ar?a:en;
 return <div className="row"><Field label={t('Monthly allowance ($)','حد الصرف الشهري ($)')} value={amount} onChange={setAmount} type="number" min={0} max={1000}/><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await api(`/api/projects/${project.id}/members/${member.id}`,{method:'PATCH',body:{monthlyLimit:Math.round(amount*1000000)}});await refresh();toast.success(t('Allowance saved.','حُفظ حد الصرف.'))}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}}>{t('Save allowance','حفظ الحد')}</Button></div>;
}
