import { expect, test } from 'vitest';
import { snippet, title } from './storage';
test('labels preserve the stored content and skip blank lines', () => {
  const note = {id:'x',content:'\n  TOKEN=abc  \n',updated:1};
  expect(title(note)).toBe('TOKEN=abc');
  expect(note.content).toBe('\n  TOKEN=abc  \n');
  expect(title()).toBe('Untitled note');
});
test('snippets reveal literal matches in long notes', () => {
  const text = 'a'.repeat(500) + 'TOKEN=100%_value' + 'z'.repeat(500);
  expect(snippet(text,'100%_')).toContain('TOKEN=100%_value');
});
test('ENV values are masked in labels and previews even when the match is a hidden value', () => {
  const secret = 'some-super-secret-token';
  expect(title({id:'env',content:`!ENV: ${secret}`,updated:1})).toBe('!ENV: ••••••••');
  const content = 'prose\n'.repeat(100)+`!ENV: ${secret}\nLast`;
  const preview = snippet(content,secret);
  expect(preview).toContain('!ENV: ••••••••');
  expect(preview).not.toContain(secret);
});
