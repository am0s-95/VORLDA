import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyGraph, makePiece } from '../lib/world.ts';
import { toolMode, workshopTools, codeSections } from '../lib/contextual-tools.ts';
import { analyzeCodeProject } from '../lib/code-project.ts';
import { codeSamples } from '../lib/code-templates.ts';

test('automatic tools follow source context and reset after source removal without changing project data', () => {
  const graph = emptyGraph(), source = makePiece('code');
  assert.equal(workshopTools(graph, 'auto', true).showCode, false);
  graph.pieces.push(source);
  const before = structuredClone(graph);
  assert.equal(workshopTools(graph, 'auto', true).showCode, true);
  assert.equal(workshopTools(graph, 'simple', true).showCode, false);
  assert.deepEqual(graph, before);
  graph.pieces.pop();
  assert.equal(workshopTools(graph, 'auto', true).showCode, false);
  assert.equal(workshopTools(graph, 'advanced', true).showCode, true);
  assert.equal(workshopTools(graph, 'advanced', false).showCode, false);
  assert.equal(toolMode('unexpected'), 'auto');
});

test('source tools expose relevant tasks and requirements while a manual override keeps other tools reachable', () => {
  const plain = { version: 1, files: [{ path: 'notes.txt', encoding: 'utf8', content: 'notes' }], tasks: [] };
  assert.deepEqual(codeSections(plain, false, analyzeCodeProject(plain)), { runtime: false, tasks: false, flows: false });
  assert.deepEqual(codeSections(codeSamples.web, false, analyzeCodeProject(codeSamples.web)), { runtime: true, tasks: false, flows: false });
  assert.deepEqual(codeSections(codeSamples.node, false, analyzeCodeProject(codeSamples.node)), { runtime: true, tasks: true, flows: false });
  assert.deepEqual(codeSections(plain, true, analyzeCodeProject(plain)), { runtime: true, tasks: true, flows: true });
});

test('workflow discovery recognizes uppercase extensions and preserves access to invalid-flow diagnostics', () => {
  const project = content => ({ version: 1, files: [{ path: 'WORKFLOW.JSON', encoding: 'utf8', content: JSON.stringify(content) }], tasks: [] });
  const valid = project({ nodes: [{ name: 'Start', type: 'trigger' }], connections: {} });
  const before = structuredClone(valid);
  assert.equal(codeSections(valid, false, null).flows, true);
  assert.deepEqual(valid, before);
  assert.equal(codeSections(project({ nodes: Array.from({ length: 251 }, (_, i) => ({ name: String(i), type: 'trigger' })), connections: {} }), false, null).flows, true);
  assert.equal(codeSections(project({ nodes: [{ name: 'same', type: 'trigger' }, { name: 'same', type: 'trigger' }], connections: {} }), false, null).flows, true);
  assert.equal(codeSections(project({ ordinary: 'JSON' }), false, null).flows, false);
  valid.files[0].encoding = 'base64';
  assert.equal(codeSections(valid, false, null).flows, false);
});
