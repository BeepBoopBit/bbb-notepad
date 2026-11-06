import { expect, test } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { livePreview, previewBlocks } from './markdown-preview';

const text = '# Heading\n\nA **bold** paragraph.\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nLast paragraph';
function state(anchor: number) {
  return EditorState.create({doc:text,selection:{anchor},extensions:[markdown({extensions:GFM}),livePreview]});
}
test('the block containing the cursor stays source while other blocks render', () => {
  const doc = state(text.indexOf('bold'));
  const blocks = previewBlocks(doc).map(({from,to}) => doc.sliceDoc(from,to));
  expect(blocks).toEqual(['# Heading','```mermaid\nflowchart LR\nA --> B\n```','Last paragraph']);
  expect(doc.sliceDoc()).toBe(text);
});
test('every block touched by a selection stays source', () => {
  const doc = state(0).update({selection:EditorSelection.single(0,text.length)}).state;
  expect(previewBlocks(doc)).toEqual([]);
  expect(doc.field(livePreview).size).toBe(0);
});
test('moving into a diagram reveals its complete fence without changing content', () => {
  const doc = state(0).update({selection:{anchor:text.indexOf('A -->')}}).state;
  expect(previewBlocks(doc).some(({from,to}) => doc.sliceDoc(from,to).includes('```mermaid'))).toBe(false);
  expect(doc.sliceDoc()).toBe(text);
});
