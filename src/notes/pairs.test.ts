import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parsePairs, maskedContent, pairCompletion, matchesSearch, searchMatch } from './pairs';
const fixtures = JSON.parse(readFileSync(new URL('../../tests/fixtures/pairs.json',import.meta.url),'utf8'));
for (const fixture of fixtures) test(fixture.name, () => {
  expect(parsePairs(fixture.source).map(p => ({key:p.key,value:fixture.source.slice(p.valueFrom,p.valueTo)}))).toEqual(fixture.pairs);
});
test('ENV masks have fixed length, including nested and multiline values', () => {
  expect(maskedContent('!ENV: short\n!ENV: a much longer value')).toBe('!ENV: ••••••••\n!ENV: ••••••••');
  expect(maskedContent('!ENV:{\nsecret\nother\n}')).toBe('!ENV:{\n••••••••\n}');
});
test('pair filtering matches values of the requested key, not unrelated text', () => {
  const text = '!IDEA: capture\n!ENV: token\nother words';
  expect(matchesSearch(text,'pair:idea capture')).toBe(true);
  expect(matchesSearch(text,'pair:IDEA token')).toBe(false);
  expect(matchesSearch(text,'pair:IDEA other words')).toBe(false);
  expect(matchesSearch(text,'pair:ENV')).toBe(true);
  expect(searchMatch(text,'pair:IDEA capture')).toBe('!IDEA: capture');
});
test('pair brace completion and expansion', () => {
  expect(pairCompletion('!IDEA:',6,6,'{')).toEqual({insert:'{}',head:7});
  expect(pairCompletion('!IDEA:{}',7,7,'Enter')).toEqual({insert:'\n\n',head:8});
  expect(pairCompletion('ordinary text',13,13,'{')).toBeNull();
});

test('pair nodes interrupt paragraphs and standalone hyphens are always separators', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { syntaxTree } = await import('@codemirror/language');
  const { pairMarkdown } = await import('../editor/pairs/pair-markdown');
  const source = 'Before\n!IDEA:{\nInside\n---\n!ENV: value\n}\nAfter\n---\nLast';
  const state = EditorState.create({doc:source,extensions:[markdown({extensions:pairMarkdown})]});
  const tree = syntaxTree(state).toString();
  expect(tree).toContain('Pair(PairKey,Document(Paragraph');
  expect(tree.match(/HorizontalRule/g)?.length).toBe(2);
  expect(tree).not.toContain('SetextHeading');
  expect(state.sliceDoc()).toBe(source);
});

test('supported pair suggestions distinguish scalar and block templates without matching code',async()=>{
  const {pairSuggestions,completePair}=await import('./pairs');
  expect(pairSuggestions('!',1)?.options.map(pair=>pair.key)).toEqual(['ENV','IDEA','SCRIPT']);
  expect(pairSuggestions('!scr',4)?.options.map(pair=>pair.key)).toEqual(['SCRIPT']);
  expect(pairSuggestions('```\n!IDEA',9)).toBeNull();
  expect(completePair('ENV',false)).toEqual({insert:'!ENV: ',head:6});
  expect(completePair('IDEA',true)).toEqual({insert:'!IDEA:{\n\n}',head:8});
});

test('Enter exits the innermost callout and reuses an existing blank line',async()=>{
  const {pairExit}=await import('./pairs');
  const source='!IDEA:{\nBefore\n!SCRIPT:{\nSpeaking\n}\n\nAfter\n}\n\nLast';
  const plan=pairExit(source,source.indexOf('Speaking')+3)!;
  expect(plan.insert).toBe('');expect(source.slice(plan.head)).toBe('\nAfter\n}\n\nLast');
  expect(pairExit(source,source.indexOf('Speaking'),undefined,[0])).toBeNull();
});
test('callout exits create a line after the brace without changing existing text or Windows line endings',async()=>{
  const {pairExit}=await import('./pairs');
  const source='!SCRIPT:{\r\nInside\r\n}';
  expect(pairExit(source,source.indexOf('Inside'))).toEqual({from:source.length,insert:'\r\n',head:source.length+2});
  const followed='!IDEA:{\nInside\n}\nFollowing';const plan=pairExit(followed,9)!;
  expect(followed.slice(0,plan.from)+plan.insert+followed.slice(plan.from)).toBe('!IDEA:{\nInside\n}\n\nFollowing');
  expect(pairExit('Normal text',3)).toBeNull();
});
