import { children, effectivePiece, type Graph, type Piece, type Fields } from './world.ts';
import { safeMedia } from './compiler.ts';
type Media = HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
export function keyframeAt(frames: unknown, time: number): Fields { if (!Array.isArray(frames) || !frames.length)
    return {}; const f = frames.filter(v => v && typeof v === 'object' && Number.isFinite(v.time)).sort((a, b) => a.time - b.time); if (!f.length)
    return {}; let a = f[0], b = f[f.length - 1]; for (let i = 0; i < f.length; i++) {
    if (f[i].time <= time)
        a = f[i];
    if (f[i].time >= time) {
        b = f[i];
        break;
    }
} const u = b.time === a.time ? 0 : Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))); const result: Fields = {}; for (const k of ['x', 'y', 'opacity', 'rotation', 'scale'])
    if (typeof a[k] === 'number')
        result[k] = a[k] + ((typeof b[k] === 'number' ? b[k] : a[k]) - a[k]) * u; return result; }
function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number, lineHeight: number) { let y = 0; for (const line of text.split('\n')) {
    let row = '';
    for (const word of line.split(' ')) {
        const test = row ? row + ' ' + word : word;
        if (row && ctx.measureText(test).width > width) {
            ctx.fillText(row, 0, y);
            y += lineHeight;
            row = word;
        }
        else
            row = test;
    }
    ctx.fillText(row, 0, y);
    y += lineHeight;
} }
export function sceneMediaParts(g: Graph, scene?: Piece) {
    const visible: Piece[] = [];
    function visit(raw: Piece) { const p = effectivePiece(g,raw); if(p.hidden) return; if(['image','video','audio','character'].includes(p.type)) visible.push(p); for(const child of children(g,p.id)) if(child.type !== 'page') visit(child); }
    if(scene) { for(const child of children(g,scene.id)) if(child.type !== 'page') visit(child); }
    else for(const root of children(g,null)) visit(root);
    return visible;
}
export async function loadSceneMedia(g: Graph, scene?: Piece) {
    const map = new Map<string, Media>();
    try { await Promise.all(sceneMediaParts(g,scene).map(async (p) => { const source = safeMedia(p.type === 'character' ? (p.props.references as string[])?.[0] : p.props.src); if (!source) return;
        const el = p.type === 'image' || p.type === 'character' ? new Image() : document.createElement(p.type === 'audio' ? 'audio' : 'video');
        map.set(p.id,el); el.crossOrigin = 'anonymous';
        if(el instanceof HTMLMediaElement){el.preload='auto';el.setAttribute('playsinline','');}
        await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Timed out loading ${p.name}.`)),20000);el.addEventListener(el instanceof HTMLImageElement?'load':'loadeddata',()=>{clearTimeout(timer);resolve();},{once:true});el.addEventListener('error',()=>{clearTimeout(timer);reject(Error(`Could not load ${p.name}. Re-import external media to export it.`));},{once:true});el.src=source;});
    })); return map; } catch(error) { dispose(map); throw error; }
}
export function drawScene(ctx: CanvasRenderingContext2D, g: Graph, scene: Piece, media: Map<string, Media>, time = 0) {
    scene = effectivePiece(g,scene);
    ctx.clearRect(0, 0, scene.w, scene.h);
    ctx.fillStyle = String(scene.style.background || '#ffffff');
    ctx.fillRect(0, 0, scene.w, scene.h);
    function draw(raw: Piece, position?: {x:number;y:number}) {
        const p = {...effectivePiece(g, raw), ...position}, x = p.props, s = p.style, start = Number(x.start) || 0, duration = Number(x.duration) || 8;
        if (p.hidden || (['video', 'audio'].includes(p.type) && (time < start || time > start + duration)))
            return;
        const k = keyframeAt(x.keyframes, time - start);
        ctx.save();
        ctx.translate(Number(k.x ?? p.x) + p.w / 2, Number(k.y ?? p.y) + p.h / 2);
        ctx.rotate(Number(k.rotation ?? p.rotation) * Math.PI / 180);
        const scale = Number(k.scale ?? 1);
        ctx.scale(scale, scale);
        ctx.translate(-p.w / 2, -p.h / 2);
        ctx.globalAlpha *= Number(k.opacity ?? s.opacity ?? 1);
        ctx.beginPath();
        if (x.mask === 'circle' || x.shape === 'ellipse')
            ctx.ellipse(p.w / 2, p.h / 2, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
        else if (x.mask === 'ellipse')
            ctx.ellipse(p.w / 2, p.h / 2, p.w / 2, p.h * .4, 0, 0, Math.PI * 2);
        else
            ctx.roundRect(0, 0, p.w, p.h, Math.max(0, Math.min(Number(s.radius) || 0, p.w / 2, p.h / 2)));
        if(p.type !== 'group') ctx.clip();
        ctx.fillStyle = String(s.background || 'transparent');
        ctx.fillRect(0, 0, p.w, p.h);
        const el = media.get(p.id);
        if (el && !(el instanceof HTMLAudioElement)) {
            ctx.save();
            ctx.filter = `brightness(${Number(x.brightness ?? 100)}%) contrast(${Number(x.contrast ?? 100)}%) saturate(${Number(x.saturation ?? 100)}%) blur(${Number(x.blur) || 0}px) hue-rotate(${Number(x.hue) || 0}deg)`;
            const iw = el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth, ih = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight;
            if (iw && ih) {
                const fit = x.fit === 'contain' ? Math.min(p.w / iw, p.h / ih) : Math.max(p.w / iw, p.h / ih);
                const zoom = Math.max(1, Number(x.cropZoom) || 1), w = iw * fit * zoom, h = ih * fit * zoom;
                ctx.drawImage(el, (p.w - w) * Number(x.cropX ?? 50) / 100, (p.h - h) * Number(x.cropY ?? 50) / 100, w, h);
            }
            ctx.restore();
        }
        if (p.type === 'text' || p.type === 'button') {
            ctx.fillStyle = String(s.color || '#17201d');
            const fs = Number(s.fontSize) || 16;
            ctx.font = `${String(s.fontWeight || 400)} ${fs}px ${String(s.fontFamily || 'Arial')}`;
            ctx.textBaseline = 'top';
            if (p.type === 'button') {
                ctx.textAlign = 'center';
                ctx.fillText(String(x.text || ''), p.w / 2, (p.h - fs) / 2);
            }
            else
                wrapText(ctx, String(x.text || ''), p.w, fs * 1.25);
        }
        drawChildren(p);
        ctx.restore();
    }
    function drawChildren(parent: Piece) {
        const layout = parent.style.layout, flow = layout === 'row' || layout === 'column', padding = Number(parent.style.padding) || 0, gap = Number(parent.style.gap) || 0;
        let offset = padding;
        for (const raw of children(g,parent.id)) {
            const p = effectivePiece(g,raw);
            if(p.hidden || p.type === 'page') continue;
            const position = flow ? {x:layout === 'row' ? offset : padding,y:layout === 'column' ? offset : padding} : undefined;
            draw(raw,position);
            if(flow) offset += (layout === 'row' ? p.w : p.h) + gap;
        }
    }
    drawChildren(scene);
}
export async function exportStill(g: Graph, scene: Piece, time = 0) { if (scene.w * scene.h > 16777216)
    throw Error('Reduce export dimensions to 16 megapixels or less.'); const media = await loadSceneMedia(g,scene); try {
    for (const [key, el] of media) {
        if (el instanceof HTMLVideoElement) {
            const p = effectivePiece(g,g.pieces.find(p => p.id === key)!);
            await seek(el, Math.max(0, Number(p.props.trim) || 0) + Math.max(0, time - (Number(p.props.start) || 0)) * (Number(p.props.speed) || 1));
        }
    }
    const canvas = document.createElement('canvas');
    canvas.width = scene.w;
    canvas.height = scene.h;
    drawScene(canvas.getContext('2d')!, g, scene, media, time);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('The image could not be exported.')), 'image/png'));
}
finally {
    dispose(media);
} }
function seek(el: HTMLMediaElement, time: number) { return new Promise<void>(resolve => { const target = Math.min(Math.max(0, time), Math.max(0, el.duration - .05)); if (Math.abs(el.currentTime - target) < .03) {
    resolve();
    return;
} const timer = setTimeout(resolve, 2000); el.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true }); el.currentTime = target; }); }
function dispose(media: Map<string, Media>) { for (const el of media.values())
    if (el instanceof HTMLMediaElement) {
        el.pause();
        el.removeAttribute('src');
        el.load();
    } }
export async function exportFilm(g: Graph, scene: Piece, duration: number, onProgress: (n: number) => void, signal: AbortSignal) { if (typeof MediaRecorder === 'undefined')
    throw Error('This browser cannot record video. Use a recent desktop browser.'); if (!Number.isFinite(duration) || duration <= 0 || duration > 180 || scene.w * scene.h > 4194304)
    throw Error('Use a duration up to 180 seconds and a frame of at most 4 megapixels for browser export.'); const audio = new AudioContext(); await audio.resume(); let media = new Map<string, Media>(); let recorder: MediaRecorder | undefined; try {
    media = await loadSceneMedia(g,scene);
    const canvas = document.createElement('canvas');
    canvas.width = scene.w;
    canvas.height = scene.h;
    const ctx = canvas.getContext('2d')!, stream = canvas.captureStream(30), mix = audio.createMediaStreamDestination();
    for (const el of media.values()) {
        if (el instanceof HTMLMediaElement) {
            const source = audio.createMediaElementSource(el), gain = audio.createGain();
            source.connect(gain);
            gain.connect(mix);
            const p = effectivePiece(g,g.pieces.find(p => media.get(p.id) === el)!);
            gain.gain.value = Math.max(0, Math.min(1, Number(p.props.volume ?? 1)));
            el.playbackRate = Math.max(.25, Math.min(4, Number(p.props.speed) || 1));
            await seek(el, Number(p.props.trim) || 0);
        }
    }
    for (const track of mix.stream.getAudioTracks())
        stream.addTrack(track);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
    if (!mime)
        throw Error('No supported video recording format was found.');
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
    const stopped = new Promise<Blob>((resolve, reject) => { recorder!.ondataavailable = e => { if (e.data.size)
        chunks.push(e.data); }; recorder!.onstop = () => resolve(new Blob(chunks, { type: mime })); recorder!.onerror = () => reject(Error('Video recording failed.')); });
    recorder.start(500);
    const start = performance.now(), started = new Set<string>();
    await new Promise<void>((resolve, reject) => { const frame = () => { if (signal.aborted) {
        reject(Error('Export cancelled.'));
        return;
    } const t = (performance.now() - start) / 1000; for (const [key, el] of media) {
        if (!(el instanceof HTMLMediaElement))
            continue;
        const p = effectivePiece(g,g.pieces.find(p => p.id === key)!), from = Number(p.props.start) || 0, end = from + (Number(p.props.duration) || 8);
        if (t >= from && t < end && !started.has(key)) {
            started.add(key);
            el.play().catch(() => { });
        }
        if (t >= end)
            el.pause();
    } drawScene(ctx, g, scene, media, t); onProgress(Math.min(1, t / duration)); if (t >= duration) {
        resolve();
        return;
    } requestAnimationFrame(frame); }; frame(); });
    recorder.stop();
    const blob = await stopped;
    stream.getTracks().forEach(t => t.stop());
    return blob;
}
finally {
    if (recorder && recorder.state !== 'inactive')
        recorder.stop();
    dispose(media);
    await audio.close();
} }
export function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
