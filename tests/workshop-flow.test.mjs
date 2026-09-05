import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyGraph, makePiece, makeConnection, checkPublish, removeParts } from '../lib/world.ts';
import { compileHTML } from '../lib/compiler.ts';
import { insertionParent, firstInspectorTab, issueDestination, workspaceSaveState } from '../lib/workshop-flow.ts';

test('page → text → button keeps additions in the page and in the exported application', () => {
  const graph = emptyGraph(), page = makePiece('page');
  graph.pieces.push(page);
  const text = makePiece('text', insertionParent(graph, [page.id], null));
  text.props.text = 'included-after-contextual-insertion';
  graph.pieces.push(text);
  const button = makePiece('button', insertionParent(graph, [text.id], null));
  button.props.text = 'included-button-label';
  graph.pieces.push(button);
  assert.equal(text.parentId, page.id);
  assert.equal(button.parentId, page.id);
  const html = compileHTML(graph, { entry: page.id });
  assert.ok(html.includes('included-after-contextual-insertion'));
  assert.ok(html.includes('included-button-label'));
});

test('nested forms and sections, explicit placement, removal and multiple selection resolve without changing data', () => {
  const graph = emptyGraph(), first = makePiece('page'), second = makePiece('page');
  const section = makePiece('section', first.id), form = makePiece('form', section.id), input = makePiece('input', form.id);
  graph.pieces.push(first, second, section, form, input);
  const before = structuredClone(graph);
  assert.equal(insertionParent(graph, [input.id], first.id), form.id);
  assert.equal(insertionParent(graph, [section.id], null), section.id);
  assert.equal(insertionParent(graph, [input.id], first.id, 'root'), null);
  assert.equal(insertionParent(graph, [input.id], first.id, second.id), second.id);
  assert.equal(insertionParent(graph, [first.id, second.id], first.id), first.id);
  assert.equal(insertionParent(graph, [], null), null);
  assert.equal(insertionParent(removeParts(graph, [second.id]), [], null, second.id), null);
  assert.deepEqual(graph, before);
});

test('publication diagnostics route to the actual source and the relevant editing tab', () => {
  const graph = emptyGraph(), page = makePiece('page'), button = makePiece('button', page.id), media = makePiece('image', page.id);
  graph.pieces.push(page, button, media);
  const edge = makeConnection(button.id, null); graph.connections.push(edge);
  const issues = checkPublish(graph);
  assert.deepEqual(issueDestination(graph, issues.find(i => i.code === 'BROKEN_CONNECTION')), { pieceId: button.id, tab: 'actions' });
  assert.deepEqual(issueDestination(graph, issues.find(i => i.code === 'NO_ASSET')), { pieceId: media.id, tab: 'content' });
  assert.equal(issueDestination(graph, { code: 'UNKNOWN', target: 'deleted', severity: 'error', message: '' }), null);
  assert.equal(firstInspectorTab(page), 'design');
  assert.equal(firstInspectorTab(makePiece('text')), 'content');
  assert.equal(firstInspectorTab(makePiece('code')), 'content');
  edge.to = page.id;
  assert.equal(checkPublish(graph).some(i => i.code === 'BROKEN_CONNECTION'), false);
});

test('save errors and unapplied projects never claim to be saving or applied', () => {
  assert.equal(workspaceSaveState('conflict', true, 4), 'error');
  assert.equal(workspaceSaveState('error', false, 4), 'error');
  assert.equal(workspaceSaveState('unsaved', true, 4), 'unsaved');
  assert.equal(workspaceSaveState('saving', true, 4), 'saving');
  assert.equal(workspaceSaveState('loading', false, 0), 'loading');
  assert.equal(workspaceSaveState('saved', false, 0), 'draft');
  assert.equal(workspaceSaveState('saved', true, 4), 'draft');
  assert.equal(workspaceSaveState('saved', false, 4), 'applied');
});
