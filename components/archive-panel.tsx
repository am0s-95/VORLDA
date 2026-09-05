"use client";
import {useState,useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {api} from '@/lib/client';
import {toast} from 'sonner';
export function ArchivePanel({ar,onRestored}:{ar:boolean;onRestored:(id:string)=>Promise<void>}){
 const [items,setItems]=useState<any[]>([]),[busy,setBusy]=useState(false);useEffect(()=>{api('/api/projects/archived').then(setItems).catch(e=>toast.error(e.message))},[]);
 return <div dir={ar?'rtl':'ltr'}><p className="muted">{ar?'المشاريع المؤرشفة تحتفظ بملفاتها وتستهلك مساحتها حتى حذف الملفات منها.':'Archived projects retain their files and continue to use storage.'}</p>{items.length?items.map(p=><div className="list-item" key={p.id}><strong>{p.name}</strong><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await api(`/api/projects/${p.id}/restore`,{method:'POST',body:{}});await onRestored(p.id)}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}}>{ar?'استعادة':'Restore'}</Button></div>):<p className="empty-row">{ar?'لا توجد مشاريع مؤرشفة.':'No archived projects.'}</p>}</div>;
}
