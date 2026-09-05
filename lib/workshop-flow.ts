import { type Graph, type Piece, type PieceType, checkPublish } from './world.ts';

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
  return piece ? { pieceId: piece.id, tab: edge || issue.code === 'NO_ACTION' ? 'actions' : firstInspectorTab(piece) } : null;
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
  };
  return messages[issue.code] || issue.message;
}
