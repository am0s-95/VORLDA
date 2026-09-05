"use client";
import { useState, type ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
export function Choice({ value, onChange, options, label, className = '' }: {
    value: string;
    onChange: (v: string) => void;
    options: (string | {
        value: string;
        label: string;
    })[];
    label: string;
    className?: string;
}) { return <Select value={value || '_none'} onValueChange={v => onChange(v === '_none' ? '' : v)}><SelectTrigger aria-label={label} className={'choice ' + className}><SelectValue placeholder={label}/></SelectTrigger><SelectContent position="popper" align="start" sideOffset={4} collisionPadding={12}>{options.map(v => { const item = typeof v === 'string' ? { value: v, label: v } : v; return <SelectItem value={item.value || '_none'} key={item.value}>{item.label}</SelectItem>; })}</SelectContent></Select>; }
export function Field({ label, value, onChange, type = 'text', min, max, step, placeholder }: {
    label: string;
    value: unknown;
    onChange: (value: any) => void;
    type?: string;
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
}) { return <label className="field"><span>{label}</span><Input aria-label={label} value={String(value ?? '')} type={type} min={min} max={max} step={step} placeholder={placeholder} onChange={e => { if (type === 'number') {
    const n = Number(e.target.value);
    if (Number.isFinite(n))
        onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
}
else
    onChange(e.target.value); }}/></label>; }
export function TextField({ label, value, onChange, rows = 3 }: {
    label: string;
    value: unknown;
    onChange: (v: string) => void;
    rows?: number;
}) { return <label className="field"><span>{label}</span><Textarea aria-label={label} rows={rows} value={String(value ?? '')} onChange={e => onChange(e.target.value)}/></label>; }
export function Toggle({ label, checked, onChange }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) { return <label className="toggle-row"><span>{label}</span><Switch aria-label={label} checked={checked} onCheckedChange={onChange}/></label>; }
export function JsonField({ label, value, onChange }: {
    label: string;
    value: unknown;
    onChange: (v: any) => void;
}) { const [editing, setEditing] = useState<string | null>(null); return <div className="field"><span>{label}</span><Textarea aria-label={label} className="code-input" rows={5} value={editing ?? JSON.stringify(value, null, 2)} onChange={e => setEditing(e.target.value)}/>{editing !== null && <div className="row"><Button size="sm" onClick={() => { try {
    onChange(JSON.parse(editing));
    setEditing(null);
}
catch (e) {
    toast.error((e as Error).message || 'Invalid JSON');
} }}>Apply JSON</Button><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button></div>}</div>; }
export function IconButton({ label, onClick, children, active = false, disabled = false, className = '' }: {
    label: string;
    onClick: () => void;
    children: ReactNode;
    active?: boolean;
    disabled?: boolean;
    className?: string;
}) { return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" type="button" className={'icon-button ' + (active ? 'active ' : '') + className} aria-label={label} onClick={onClick} disabled={disabled}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>; }
