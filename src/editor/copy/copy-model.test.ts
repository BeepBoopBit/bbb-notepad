import {expect,test} from 'vitest';
import {joinUnits,toggleUnit,type CopyUnit} from './copy-model';
const unit=(id:string,position:number,group?:string,parents:string[]=[]):CopyUnit=>({id,position,ordinal:0,parents,kind:group?'sentence':'block',group,markdown:`**${id}**`,text:id});
test('collected sentences copy in document order and retain Markdown',()=>{
  expect(joinUnits([unit('third',30,'p'),unit('first',10,'p')])).toBe('**first** **third**');
  expect(joinUnits([unit('third',30,'q'),unit('first',10,'p')],true)).toBe('first\n\nthird');
});
test('whole-block selection absorbs children without duplicate copying',()=>{
  const child=unit('child',1,'p',['parent']),parent=unit('parent',0);
  let selected=toggleUnit(new Map(),child);selected=toggleUnit(selected,parent);
  expect([...selected.keys()]).toEqual(['parent']);
  expect(joinUnits([parent,child])).toBe('**parent**');
  selected=toggleUnit(selected,child);expect([...selected.keys()]).toEqual(['child']);
  expect(toggleUnit(selected,child).size).toBe(0);
});
test('collected quote sentences remain one correctly formatted quote',()=>{
  const a={...unit('a',1,'quote'),markdown:'> First sentence.'};
  const b={...unit('b',2,'quote'),markdown:'> Second sentence.'};
  expect(joinUnits([a,b])).toBe('> First sentence. Second sentence.');
});
test('plain code copies retain meaningful leading indentation',()=>{
  const code={...unit('code',0),kind:'code' as const,text:'    indented code\n'};
  expect(joinUnits([code],true)).toBe('    indented code');
});
