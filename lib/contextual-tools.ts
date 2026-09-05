import type { Graph } from './world.ts';
import type { CodeProject, analyzeCodeProject } from './code-project.ts';
import { inspectFlow } from './flow-inspector.ts';

export type ToolMode = 'auto' | 'simple' | 'advanced';
export const toolMode = (value: unknown): ToolMode => value === 'simple' || value === 'advanced' ? value : 'auto';

// Presentation only. Editing and project access still use their existing guards.
export function workshopTools(graph: Graph, mode: ToolMode, ready: boolean) {
  const hasCode = graph.pieces.some(p => p.type === 'code');
  return { hasCode, showCode: ready && (mode === 'advanced' || mode === 'auto' && hasCode) };
}

export function codeSections(project: CodeProject | null, advanced: boolean, info: ReturnType<typeof analyzeCodeProject> | null) {
  let hasFlows = false;
  for (const file of project?.files || []) {
    if (file.encoding !== 'utf8' || !/\.json$/i.test(file.path)) continue;
    try { if (inspectFlow(file.content)) hasFlows = true; }
    catch { hasFlows = true; } // Keep recognized-but-invalid flows and their diagnosis reachable.
    if (hasFlows) break;
  }
  return {
    runtime: advanced || !!(info?.stacks.length || info?.warnings.length),
    tasks: advanced || !!(project?.tasks.length || info?.tasks.length),
    flows: advanced || hasFlows,
  };
}
