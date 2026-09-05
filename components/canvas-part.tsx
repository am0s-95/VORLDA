"use client";
import { useRef, useEffect, type CSSProperties, type PointerEvent } from 'react';
import { type Graph, type Piece, children, effectivePiece, descendants } from '@/lib/world';
import { partStyle, safeMedia } from '@/lib/compiler';
import { keyframeAt } from '@/lib/media';
import { Box, LayoutTemplate, Square, Type, MousePointer2, Image as ImageIcon, Video, Music2, TextCursorInput, Database, Sparkles, UserRound, Code2, Group, ArrowUpRight, Link2, CornerDownLeft } from 'lucide-react';
export const partIcons: Record<string, typeof Box> = { page: LayoutTemplate, section: Square, text: Type, button: MousePointer2, image: ImageIcon, video: Video, audio: Music2, shape: Square, input: TextCursorInput, form: LayoutTemplate, gallery: ImageIcon, data: Database, prompt: Sparkles, generator: Sparkles, character: UserRound, code: Code2, group: Group };
type Props = {
    graph: Graph;
    raw: Piece;
    selected: string[];
    scope: string | null;
    mobile: boolean;
    time: number;
    playing: boolean;
    zoom: number;
    ar: boolean;
    proxyId?: string;
    onDown: (e: PointerEvent, p: Piece, resize?: boolean, proxyId?: string) => void;
    onMove: (e: PointerEvent) => void;
    onUp: () => void;
    enter: (id: string) => void;
    choose: (id: string) => void;
    attach: (id: string) => void;
};
export function CanvasPart(props: Props) {
    const { graph: g, raw, selected, scope, mobile, time, playing, zoom, ar, proxyId, onDown, onMove, onUp, enter, choose, attach } = props, p = effectivePiece(g, raw, mobile ? 'mobile' : 'desktop'), chosen = selected.includes(p.id), Icon = partIcons[p.type] || Box;
    if (p.hidden)
        return null;
    const style = partStyle(p) as CSSProperties, parent = g.pieces.find(a => a.id === p.parentId), flow = parent && ['row', 'column'].includes(String(effectivePiece(g, parent).style.layout));
    if (flow) {
        style.position = 'relative';
        style.left = 0;
        style.top = 0;
        style.flexShrink = 0;
    }
    if (proxyId) {
        const h = g.proxies.find(h => h.id === proxyId)!;
        style.left = h.x;
        style.top = h.y;
    }
    if (playing || time > 0) {
        const k = keyframeAt(p.props.keyframes, time - (Number(p.props.start) || 0));
        if (k.x !== undefined)
            style.left = Number(k.x);
        if (k.y !== undefined)
            style.top = Number(k.y);
        if (k.opacity !== undefined)
            style.opacity = Number(k.opacity);
        if (k.rotation !== undefined)
            style.transform = `rotate(${k.rotation}deg)`;
    }
    const within = !scope || descendants(g, scope).some(a => a.id === p.id) || descendants(g, p.id).some(a => a.id === scope);
    return <div className={'canvas-part ' + (chosen ? 'selected ' : '') + (p.type === 'page' ? 'page-part ' : '') + (!within ? 'dimmed ' : '') + (proxyId ? 'proxy-part ' : '')} style={{ ...style, overflow: 'visible', background: undefined, color: undefined }} onPointerDown={e => onDown(e, p, false, proxyId)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={e => { e.stopPropagation(); enter(p.id); }} role="button" tabIndex={0} aria-label={p.name} onKeyDown={e => { if (e.key === 'Enter') {
        e.stopPropagation();
        choose(p.id);
    } }}>
 {(!p.parentId || proxyId || chosen) && <div className="part-label" style={{ fontSize: Math.min(18, 11 / zoom) }}><Icon size={12 / zoom}/><span>{proxyId ? (ar ? 'نسخة عمل · ' : 'Working proxy · ') : ''}{p.name}</span>{p.sourceId && <Link2 size={12 / zoom}/>}<small>{Math.round(p.w)} × {Math.round(p.h)}</small></div>}
 <div className={'part-content part-' + p.type} style={{ background: String(p.style.background || 'transparent'), color: String(p.style.color || '#17201d'), borderRadius: p.type === 'shape' && p.props.shape === 'ellipse' ? '50%' : Number(p.style.radius) || 0, width: '100%', height: '100%', overflow: p.type === 'group' ? 'visible' : 'hidden', display: ['row', 'column'].includes(String(p.style.layout)) ? 'flex' : undefined, flexDirection: p.style.layout === 'column' ? 'column' : 'row', gap: Number(p.style.gap) || 0, padding: ['row', 'column'].includes(String(p.style.layout)) ? Number(p.style.padding) || 0 : 0 }}><PieceVisual p={p} time={time} playing={playing}/>{children(g, p.id).map(c => <CanvasPart key={c.id} {...props} raw={c} proxyId={undefined}/>)}</div>
 {chosen && !p.locked && <><span className="selection-size">{Math.round(p.w)} × {Math.round(p.h)}</span><button className="resize-handle" aria-label="Resize selected part" onPointerDown={e => onDown(e, p, true)} onPointerMove={onMove} onPointerUp={onUp}/></>}{proxyId && <button className="attach-back" onPointerDown={e => e.stopPropagation()} onClick={() => attach(proxyId)}><CornerDownLeft size={12}/>{ar ? 'إعادة إرفاق' : 'Attach back'}</button>}</div>;
}
export function MiniMap({ graph }: {
    graph: Graph;
}) { const p = graph.pieces.filter(p => !p.parentId); if (!p.length)
    return null; const x = Math.min(...p.map(p => p.x)), y = Math.min(...p.map(p => p.y)), w = Math.max(...p.map(p => p.x + p.w)) - x, h = Math.max(...p.map(p => p.y + p.h)) - y; return <svg viewBox={`${x - 40} ${y - 40} ${w + 80} ${h + 80}`} width="102" height="64">{p.map(p => <rect key={p.id} x={p.x} y={p.y} width={p.w} height={p.h} rx="8" fill={p.type === 'page' ? '#a7b094' : '#636e60'} opacity=".65"/>)}</svg>; }
function PieceVisual({ p, time, playing }: {
    p: Piece;
    time: number;
    playing: boolean;
}) {
    const x = p.props, src = safeMedia(x.src), media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
    useEffect(() => { const v = media.current; if (!v)
        return; const start = Number(x.start) || 0, duration = Number(x.duration) || 8, target = (Number(x.trim) || 0) + Math.max(0, time - start) * (Number(x.speed) || 1); v.volume = Math.max(0, Math.min(1, Number(x.volume ?? 1))); v.playbackRate = Math.max(.25, Math.min(4, Number(x.speed) || 1)); if (Number.isFinite(v.duration) && Math.abs(v.currentTime - target) > .25)
        v.currentTime = Math.min(target, v.duration); if (playing && time >= start && time < start + duration)
        v.play().catch(() => { });
    else
        v.pause(); }, [time, playing, x.start, x.trim, x.duration, x.speed, x.volume]);
    const style: CSSProperties = { fontSize: Number(p.style.fontSize) || 16, fontWeight: String(p.style.fontWeight || 400), textAlign: p.style.textAlign as any, whiteSpace: 'pre-wrap' };
    if (p.type === 'text')
        return <div className="part-text" style={style}>{String(x.text || '')}</div>;
    if (p.type === 'button')
        return <div className="part-button" style={style}>{String(x.text || 'Continue')}<ArrowUpRight size={Math.max(14, Number(p.style.fontSize) || 16)}/></div>;
    if (p.type === 'input')
        return <div className="part-input" style={style}>{String(x.placeholder || 'Input')}{x.required ? ' *' : ''}</div>;
    if (p.type === 'form')
        return <div className="form-submit" style={{ fontSize: 14 }}>{String(x.submitLabel || 'Submit')}<ArrowUpRight size={14}/></div>;
    if (p.type === 'image')
        return src ? <div style={{ width: '100%', height: '100%', overflow: 'hidden', clipPath: x.mask === 'circle' ? 'circle(50%)' : x.mask === 'ellipse' ? 'ellipse(50% 40%)' : undefined }}><img draggable={false} src={src} alt={String(x.alt || p.name)} style={{ width: '100%', height: '100%', objectFit: x.fit === 'contain' ? 'contain' : 'cover', objectPosition: `${Number(x.cropX ?? 50)}% ${Number(x.cropY ?? 50)}%`, transform: `scale(${Number(x.cropZoom) || 1})`, filter: `brightness(${Number(x.brightness ?? 100)}%) contrast(${Number(x.contrast ?? 100)}%) saturate(${Number(x.saturation ?? 100)}%) blur(${Number(x.blur) || 0}px) hue-rotate(${Number(x.hue) || 0}deg)` }}/></div> : <div className="media-empty"><ImageIcon size={30}/><span>Image layer</span><small>Choose an imported image</small></div>;
    if (p.type === 'video')
        return src ? <video ref={media} src={src} playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <div className="media-empty"><Video size={30}/><span>Video clip</span><small>Choose an imported clip</small></div>;
    if (p.type === 'audio')
        return <div className="media-empty audio-piece"><Music2 size={30}/><strong>{p.name}</strong><div className="waveform" aria-hidden>{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ height: 10 + Math.abs(Math.sin(i * 1.7)) * 42 }}/>)}</div>{src && <audio ref={media} src={src} preload="metadata"/>}<small>{String(x.duration)}s · {src ? 'Imported audio' : 'No audio attached'}</small></div>;
    if (p.type === 'prompt' || p.type === 'generator')
        return <div className="prompt-piece"><div><Sparkles size={18}/><span>{p.type === 'prompt' ? 'CONTEXT' : 'GENERATION'}</span></div><p>{String(x.text || x.prompt || 'Add an instruction…')}</p><small>{p.type === 'prompt' ? 'Linked instructions' : 'Provider not connected'}</small></div>;
    if (p.type === 'data')
        return <div className="data-piece"><div><Database size={18}/><strong>{String(x.collection || p.name)}</strong></div><pre>{JSON.stringify(x.records, null, 2)}</pre></div>;
    if (p.type === 'character') {
        const ref = safeMedia((x.references as string[])?.[0]);
        return <div className="character-piece">{ref ? <img draggable={false} src={ref} alt={p.name}/> : <div className="character-silhouette"><UserRound size={80} strokeWidth={.7}/></div>}<div><small>CHARACTER IDENTITY</small><strong>{String(x.identity || p.name)}</strong><p>{String(x.description || 'Add references and define the traits that stay consistent.')} </p></div></div>;
    }
    if (p.type === 'gallery')
        return <div className="gallery-piece" style={{ gridTemplateColumns: `repeat(${Number(x.columns) || 3},1fr)` }}>{((Array.isArray(x.images) && x.images.length ? x.images : [null, null, null]) as any[]).map((src, i) => src ? <img key={i} draggable={false} src={safeMedia(src)} alt="Gallery asset"/> : <div key={i}><ImageIcon size={24}/></div>)}</div>;
    if (p.type === 'code')
        return <div className="code-piece"><Code2 size={24}/><strong>Custom HTML</strong><p>Isolated preview in the application player</p><pre>{String(x.html || '').slice(0, 200)}</pre></div>;
    return null;
}
