export type FlowView = { format: 'n8n' | 'Node-RED'; nodes: { id: string; name: string; type: string; x: number; y: number; data: unknown }[]; edges: { from: string; to: string }[]; unresolved: number };
// Read-only view: originals remain in source files. No node code is executed.
export function inspectFlow(content: string): FlowView | null {
  let data: any; try { data = JSON.parse(content); } catch { return null; }
  const n8n = data && !Array.isArray(data) && Array.isArray(data.nodes) && data.connections && typeof data.connections === 'object';
  const red = Array.isArray(data) && data.length > 0 && data.some(n => n && Array.isArray(n.wires)) && data.every(n => n && typeof n.id === 'string' && typeof n.type === 'string');
  if (!n8n && !red) return null;
  const raw = n8n ? data.nodes : data;
  if (raw.length > 250) throw Error('Flow viewer supports up to 250 nodes; the full source remains editable/exportable.');
  const seen = new Set<string>();
  const nodes = raw.map((n: any, i: number) => {
    const id = n8n ? n.name : n.id;
    if (typeof id !== 'string' || !id || id.length > 200 || seen.has(id) || typeof n.type !== 'string') throw Error('Invalid or duplicate flow node identity.');
    seen.add(id);
    const x = n8n ? n.position?.[0] : n.x, y = n8n ? n.position?.[1] : n.y;
    return { id, name: String(n.name || n.label || id).slice(0,200), type: n.type.slice(0,200), x: Number.isFinite(x) ? Math.max(-1000000,Math.min(1000000,x)) : i % 4 * 240, y: Number.isFinite(y) ? Math.max(-1000000,Math.min(1000000,y)) : Math.floor(i / 4) * 140, data: n };
  });
  const edges: FlowView['edges'] = []; let unresolved = 0, count = 0;
  const edge = (from: unknown, to: unknown) => { if (++count > 2000) throw Error('Flow viewer supports up to 2000 connections.'); if (typeof from !== 'string' || typeof to !== 'string' || !seen.has(from) || !seen.has(to)) { unresolved++; return; } edges.push({ from, to }); };
  if (n8n) {
    for (const [from, channels] of Object.entries(data.connections)) if (channels && typeof channels === 'object') for (const ports of Object.values(channels)) if (Array.isArray(ports)) for (const output of ports) if (Array.isArray(output)) for (const wire of output) edge(from, wire?.node);
  } else for (const n of raw) if (Array.isArray(n.wires)) for (const output of n.wires) if (Array.isArray(output)) for (const to of output) edge(n.id, to);
  return { format: n8n ? 'n8n' : 'Node-RED', nodes, edges, unresolved };
}
