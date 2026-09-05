"use client";
import {useState,useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {TextField} from './editor-controls';
import {api} from '@/lib/client';
import {money} from '@/lib/money';
import {toast} from 'sonner';
export function SettlementPanel({ar}:{ar:boolean}){
 const [items,setItems]=useState<any[]>([]),[selected,setSelected]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setItems(await api('/api/admin/production'))}useEffect(()=>{void load().catch(e=>toast.error(e.message))},[]);
 if(!items.length)return null;
 return <section className="resource-card"><strong>{ar?'عمليات تحتاج تسوية':'Operations awaiting settlement'}</strong><p>{ar?'تحقق من حساب المزوّد قبل الإعادة. قد يكون نفذ العملية رغم انقطاع الرد. لا يعيد النظام إرسال طلب مدفوع تلقائيًا.':'Check the provider account before refunding. An operation may have been accepted despite a missing acknowledgement. Paid requests are not resubmitted automatically.'}</p>{items.map(r=><div className="list-item" key={r.id}><span>{r.id.slice(0,8)} · {money(r.amount)}</span><Button variant="outline" onClick={()=>setSelected(r.id)}>{ar?'مراجعة':'Review'}</Button></div>)}{selected&&<><TextField label={ar?'سبب إعادة الرصيد بعد المراجعة':'Reason for the reviewed refund'} value={reason} onChange={setReason}/><Button disabled={busy||reason.trim().length<10} onClick={async()=>{setBusy(true);try{await api(`/api/admin/production/${selected}/refund`,{method:'POST',body:{reason}});setSelected('');setReason('');await load();toast.success(ar?'أعيد الرصيد وسُجل السبب.':'Balance returned and reason recorded.')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}}>{ar?'تأكيد إعادة الرصيد':'Confirm balance refund'}</Button></>}</section>;
}
