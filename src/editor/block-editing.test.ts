import {expect,test} from 'vitest';
import {EditorState,type Transaction,type TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {markdown} from '@codemirror/lang-markdown';
import {insertBreak} from './block-editing';

function editor(doc:string,anchor=doc.length) {
  const view={state:EditorState.create({doc,selection:{anchor},extensions:[markdown()]}),
    dispatch(transaction:Transaction | TransactionSpec,...specs:TransactionSpec[]) {
      view.state='state' in transaction ? transaction.state : view.state.update(transaction,...specs).state;
    }};
  return view as unknown as EditorView;
}

test.each(['-','*','+'])('Enter continues %s bullets and exits empty items',marker=>{
  const view=editor(`${marker} one`);
  insertBreak(view,true);
  expect(view.state.doc.toString()).toBe(`${marker} one\n${marker} `);
  insertBreak(view,true);
  expect(view.state.doc.toString()).toBe(`${marker} one\n`);
});

test('empty nested bullets move up one level per Enter',()=>{
  const view=editor('- a\n    - b\n        - c');
  insertBreak(view,true);
  expect(view.state.doc.toString()).toBe('- a\n    - b\n        - c\n        - ');
  for(const suffix of ['    - ','- ','']) {
    insertBreak(view,true);
    expect(view.state.doc.toString()).toBe('- a\n    - b\n        - c\n'+suffix);
  }
});

test.each(['.',')'])('ordered %s lists continue and renumber following siblings',delimiter=>{
  const doc=`1${delimiter} one\n2${delimiter} two\n3${delimiter} three`;
  const view=editor(doc,doc.indexOf('\n'));
  insertBreak(view,true);
  expect(view.state.doc.toString()).toBe(`1${delimiter} one\n2${delimiter} \n3${delimiter} two\n4${delimiter} three`);
});

test('nested ordered items step up with the parent numbering',()=>{
  const view=editor('1. a\n    1. b\n        1. c');
  for(const suffix of ['        2. ','    2. ','2. ','']) {
    insertBreak(view,true);
    expect(view.state.doc.toString()).toBe('1. a\n    1. b\n        1. c\n'+suffix);
  }
});

test('Shift Enter inserts a plain newline and code does not continue lists',()=>{
  const view=editor('- one');
  insertBreak(view,false);
  expect(view.state.doc.toString()).toBe('- one\n');
  const code=editor('```\n- one');
  insertBreak(code,true);
  expect(code.state.doc.toString()).toBe('```\n- one\n');
});
