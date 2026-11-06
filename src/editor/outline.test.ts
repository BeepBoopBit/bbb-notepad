import {test,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {markdown} from '@codemirror/lang-markdown';
import {pairMarkdown} from './pairs/pair-markdown';
import {outlineItems,outlineState,toggleOutline,setAllOutline,editPairSource} from './outline';
const source='# Top\n\nText\n\n## Child\n\nMore\n\n# Next\n\n!IDEA:{\n# Inside\n\nBody\n}\n\nEnd\n\n';
const create=()=>EditorState.create({doc:source,extensions:[markdown({extensions:pairMarkdown}),outlineState]});
test('heading ranges respect heading levels and pair boundaries',()=>{
  const state=create(),items=outlineItems(state);
  expect(state.sliceDoc(items[0].bodyFrom,items[0].bodyTo)).toBe('\n\nText\n\n## Child\n\nMore');
  const inside=items.find(item=>item.label==='Inside')!;
  expect(state.sliceDoc(inside.bodyFrom,inside.bodyTo)).toBe('\n\nBody');
  expect(items.find(item=>item.kind==='pair')?.label).toBe('IDEA');
});
test('collapse all tracks nested items and edits map their positions',()=>{
  let state=create();state=state.update({effects:setAllOutline.of(true)}).state;
  expect(state.field(outlineState).collapsed.size).toBe(5);
  state=state.update({changes:{from:0,insert:'Intro\n\n'}}).state;
  expect([...state.field(outlineState).collapsed]).toEqual(outlineItems(state).map(item=>item.from));
  state=state.update({effects:setAllOutline.of(false)}).state;
  expect(state.field(outlineState).collapsed.size).toBe(0);
});
test('raw pair editing is explicit and ends when the cursor leaves the pair',()=>{
  let state=create();const pair=outlineItems(state).find(item=>item.kind==='pair')!;
  state=state.update({effects:[toggleOutline.of(pair.from),editPairSource.of(pair.from)],selection:{anchor:pair.from}}).state;
  expect(state.field(outlineState).collapsed.has(pair.from)).toBe(false);
  expect(state.field(outlineState).rawPairs.has(pair.from)).toBe(true);
  state=state.update({selection:{anchor:state.doc.length}}).state;
  expect(state.field(outlineState).rawPairs.size).toBe(0);
});
test('ordinary cursor movement reuses outline state without remounting rendered blocks',()=>{
  const state=create();expect(state.update({selection:{anchor:5}}).state.field(outlineState)).toBe(state.field(outlineState));
});
