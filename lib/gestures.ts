import { clone, effectivePiece, type Graph } from './world.ts';

export type Point = { x: number; y: number };
export type Viewport = Point & { z: number };
type Pinch = { ids: number[]; center: Point; distance: number; view: Viewport };

// Pointer identity is retained until every finger is lifted. A remaining finger
// must not resume a stale element drag after a two-finger camera gesture.
export class TouchCamera {
    points = new Map<number, Point>();
    private pinch: Pinch | null = null;
    blocked = false;
    down(id: number, point: Point, view: Viewport) {
        this.points.set(id, point);
        if (this.points.size === 2) {
            const entries = [...this.points.entries()], a = entries[0][1], b = entries[1][1];
            this.pinch = { ids: entries.map(([key]) => key), center: { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }, distance: Math.max(1, Math.hypot(a.x-b.x,a.y-b.y)), view: { ...view } };
            this.blocked = true;
        }
        return this.blocked;
    }
    move(id: number, point: Point): Viewport | null {
        if (!this.points.has(id)) return null;
        this.points.set(id, point);
        const p = this.pinch;
        if (!p) return null;
        const a = this.points.get(p.ids[0]), b = this.points.get(p.ids[1]);
        if (!a || !b) return null;
        const z = Math.max(.08, Math.min(2.5, p.view.z * Math.hypot(a.x-b.x,a.y-b.y)/p.distance));
        const center = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
        return { x: center.x-(p.center.x-p.view.x)*z/p.view.z, y: center.y-(p.center.y-p.view.y)*z/p.view.z, z };
    }
    up(id: number) {
        this.points.delete(id);
        if (this.pinch?.ids.includes(id)) this.pinch = null;
        if (!this.points.size) this.blocked = false;
    }
    reset() { this.points.clear(); this.pinch = null; this.blocked = false; }
}

export type PieceDrag = { graph: Graph; ids: string[]; pieceId: string; resize: boolean; proxyId?: string };
export function movePieces(drag: PieceDrag, dx: number, dy: number, mobile: boolean, unsnapped = false): Graph {
    const next = clone(drag.graph), snap = (v: number) => unsnapped ? Math.round(v) : Math.round(v/4)*4;
    if (drag.proxyId) {
        const proxy = next.proxies.find(p => p.id === drag.proxyId);
        if (proxy) { proxy.x = snap(proxy.x+dx); proxy.y = snap(proxy.y+dy); }
        return next;
    }
    const dragged = next.pieces.find(p => p.id === drag.pieceId);
    const parent = dragged && next.pieces.find(p => p.id === dragged.parentId);
    const parentStyle = parent && effectivePiece(next,parent,mobile ? 'mobile' : 'desktop').style;
    const layout = parentStyle?.layout;
    // A flow child is reordered among siblings; its x/y are not used by flexbox.
    if (!drag.resize && dragged && !dragged.locked && (layout === 'row' || layout === 'column')) {
        const siblings = next.pieces.filter(p => p.parentId === dragged.parentId && !effectivePiece(next,p,mobile?'mobile':'desktop').hidden);
        const axis = layout === 'row' ? 'w' : 'h', delta = layout === 'row' ? dx : dy;
        const gap = Number(parentStyle!.gap) || 0;
        const origin = siblings.findIndex(p => p.id === dragged.id);
        let target = origin, traversed = 0;
        const direction = delta > 0 ? 1 : -1;
        while (siblings[target+direction]) {
            const neighbor = siblings[target+direction];
            const span = Number(effectivePiece(next,neighbor,mobile ? 'mobile' : 'desktop')[axis])+gap;
            if (Math.abs(delta) < traversed+span/2) break;
            traversed += span;
            target += direction;
        }
        if (target !== origin) {
            const before = siblings[target].id;
            next.pieces = next.pieces.filter(p => p.id !== dragged.id);
            const position = next.pieces.findIndex(p => p.id === before);
            next.pieces.splice(position+(direction > 0 ? 1 : 0),0,dragged);
        }
        return next;
    }
    for (const p of next.pieces) {
        let ancestor=next.pieces.find(x=>x.id===p.parentId),selectedAncestor=false;
        while(ancestor){if(drag.ids.includes(ancestor.id)&&!ancestor.locked){selectedAncestor=true;break;}ancestor=next.pieces.find(x=>x.id===ancestor!.parentId);}
        if (!drag.ids.includes(p.id) || p.locked || selectedAncestor) continue;
        const target = mobile ? p.mobile : p;
        if (drag.resize && p.id === drag.pieceId) {
            target.w = Math.max(16,snap(Number(target.w ?? p.w)+dx));
            target.h = Math.max(16,snap(Number(target.h ?? p.h)+dy));
        } else if (!drag.resize) {
            target.x = snap(Number(target.x ?? p.x)+dx);
            target.y = snap(Number(target.y ?? p.y)+dy);
        }
    }
    return next;
}
