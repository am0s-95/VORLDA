import { type Graph, type Piece, type PieceType, checkPublish, effectivePiece, clone, validateGraph } from './world.ts';

export type InspectorTab = 'content' | 'design' | 'actions';
export const insertionContainers = new Set<PieceType>(['page', 'section', 'group', 'form']);

// A presentation preference selects an insertion target, never edits existing parts.
export function insertionParent(graph: Graph, selected: string[], scope: string | null, location = 'auto'): string | null {
  if (location === 'root') return null;
  const parts = new Map(graph.pieces.map(p => [p.id, p]));
  if (location !== 'auto') return parts.has(location) ? location : null;
  let current = selected.length === 1 ? parts.get(selected[0]) : undefined;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (insertionContainers.has(current.type)) return current.id;
    current = parts.get(current.parentId || '');
  }
  return scope && parts.has(scope) ? scope : null;
}

export function firstInspectorTab(piece: Piece): InspectorTab {
  return ['page', 'section', 'group'].includes(piece.type) ? 'design' : 'content';
}

export function issueDestination(graph: Graph, issue: ReturnType<typeof checkPublish>[number]): { pieceId: string; tab: InspectorTab } | null {
  const edge = graph.connections.find(c => c.id === issue.target);
  const piece = graph.pieces.find(p => p.id === (edge?.from || issue.target));
  return piece ? { pieceId: piece.id, tab: issue.code === 'OUTSIDE_PAGE' ? 'design' : edge || issue.code === 'NO_ACTION' ? 'actions' : firstInspectorTab(piece) } : null;
}

export function deliveryIssues(graph: Graph) {
  const issues = checkPublish(graph);
  if (!graph.pieces.some(p => p.type === 'page')) return issues;
  for (const p of graph.pieces) {
    if (p.parentId || ['page', 'data', 'prompt', 'generator'].includes(p.type)) continue;
    if (effectivePiece(graph,p).hidden && effectivePiece(graph,p,'mobile').hidden) continue;
    issues.push({severity:'warning',code:'OUTSIDE_PAGE',target:p.id,message:`${p.name} is outside application pages. It stays in the project file but does not appear in the delivered app.`});
  }
  return issues;
}

export function moveIntoPage(graph: Graph, pieceId: string, pageId: string): Graph {
  const next = clone(graph), piece = next.pieces.find(p => p.id === pieceId), page = next.pieces.find(p => p.id === pageId && p.type === 'page');
  if (!piece || !page || piece.parentId || ['page','data','prompt','generator'].includes(piece.type)) throw Error('Choose a part outside application pages.');
  if (effectivePiece(graph,page).hidden && effectivePiece(graph,page,'mobile').hidden) throw Error('Choose a visible destination page.');
  if (piece.locked || page.locked) throw Error('Unlock the part and destination page first.');
  piece.parentId = page.id;
  piece.x = 24; piece.y = 24;
  if ('x' in piece.mobile || 'y' in piece.mobile) piece.mobile = {...piece.mobile, x:24, y:24};
  return validateGraph(next);
}

export function workspaceSaveState(status: string, dirty: boolean, revision: number) {
  if (status === 'conflict' || status === 'error') return 'error';
  if (status === 'loading') return 'loading';
  if (status === 'saving') return 'saving';
  if (status === 'unsaved') return 'unsaved';
  return dirty || !revision ? 'draft' : 'applied';
}

export function issueText(graph: Graph, issue: ReturnType<typeof checkPublish>[number], ar: boolean) {
  if (!ar) return issue.message;
  const target = issueDestination(graph, issue);
  const name = graph.pieces.find(p => p.id === target?.pieceId)?.name || 'القطعة';
  const messages: Record<string, string> = {
    NO_PAGE: 'أضف صفحة ظاهرة ليبدأ منها التطبيق.',
    BROKEN_CONNECTION: `رابط في «${name}» يحتاج وجهة صحيحة أو تعطيلًا.`,
    NO_ACTION: `زر «${name}» بلا إجراء تنقل.`,
    NO_PROVIDER: `مولّد «${name}» يحتاج مزوّدًا مربوطًا.`,
    AUTH_BACKEND_REQUIRED: `حقل «${name}» يحتاج نظام دخول آمن؛ النماذج العامة لا تجمع كلمات المرور.`,
    NO_ASSET: `أضف ملف الوسائط إلى «${name}».`,
    OUTSIDE_PAGE: `«${name}» خارج صفحات التطبيق. تبقى في ملف المشروع، لكنها لا تظهر في التطبيق المصدّر.`,
  };
  return messages[issue.code] || issue.message;
}
