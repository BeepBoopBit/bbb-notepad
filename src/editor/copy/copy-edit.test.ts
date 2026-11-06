import {expect,test} from 'vitest';
import {replacementPlan,type SentencePart} from './copy-edit';
import type {CopyUnit} from './copy-model';
const source='**One sentence. Two sentences. Three sentences.**\n\nLast';
const parts:SentencePart[]=[{markdown:'**One sentence.**',separator:' '},{markdown:'**Two sentences.**',separator:' '},{markdown:'**Three sentences.**',separator:' '}];
const unit=(part:number):CopyUnit=>({id:`s${part}`,position:0,ordinal:part,parents:[],kind:'sentence',markdown:parts[part].markdown,text:'',target:{from:0,to:source.indexOf('\n'),parts,part}});
function apply(changes:ReturnType<typeof replacementPlan>['changes']) {let value=source;for(const change of [...changes].reverse())value=value.slice(0,change.from)+change.insert+value.slice(change.to);return value;}
test('partial replacement retains balanced formatting in unselected sentences',()=>{
  const plan=replacementPlan([unit(1)],'New.',source);
  expect(apply(plan.changes)).toBe('**One sentence.** New. **Three sentences.**\n\nLast');
  expect(plan.cursor).toBe('**One sentence.** New.'.length);
});
test('disjoint selections insert text once at the first selected sentence',()=>{
  expect(apply(replacementPlan([unit(2),unit(0)],'New.',source).changes)).toBe('New. **Two sentences.**\n\nLast');
});
test('deleting a whole paragraph also removes the following empty boundary',()=>{
  expect(apply(replacementPlan([unit(0),unit(1),unit(2)],'',source).changes)).toBe('Last');
});
