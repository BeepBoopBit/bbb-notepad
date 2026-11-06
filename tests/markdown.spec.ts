import { test, expect } from '@playwright/test';

const markdown = '# Capture heading\n\nA **bold** thought with `inline code`.\n\n- [x] saved\n- [ ] next\n\n| Key | Value |\n| --- | --- |\n| speed | first |\n\n```javascript\nconst answer = 42;\n```\n\n```mermaid\nflowchart LR\n  A[Capture] --> B[Find]\n```\n\nEditing here';

test('live Markdown renders inactive blocks, edits source, preserves content and undo', async ({page}) => {
  const failures: string[] = []; page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await page.getByRole('textbox',{name:'Note content'}).fill(markdown);
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.press('Control+End');
  await expect(page.locator('.markdown-block h1')).toHaveText('Capture heading');
  await expect(page.locator('.markdown-block strong')).toHaveText('bold');
  await expect(page.locator('.markdown-block table')).toBeVisible();
  await expect(page.locator('.markdown-block pre code .tok-keyword')).toHaveText('const');
  await expect(page.locator('.mermaid-diagram svg')).toBeVisible({timeout:30_000});
  await page.locator('.markdown-block').filter({has:page.locator('h1')}).click();
  await expect(page.locator('.markdown-block h1')).toHaveCount(0);
  await expect(editor).toContainText('# Capture heading');
  await editor.press('Home');
  await editor.press('End');
  await editor.pressSequentially(' updated');
  await editor.press('Control+z');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  await expect(page.getByRole('button',{name:'Render Markdown'})).toHaveAttribute('aria-pressed','false');
  await expect(editor).toContainText('# Capture heading');
  await expect(page.getByText('All changes saved')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);
  expect(stored).toBe(markdown);
  expect(failures).toEqual([]);
});

test('render toggle persists and invalid diagrams remain editable', async ({page}) => {
  await page.goto('/');
  const text = '```mermaid\nnot a diagram\n```\n\nEdit below\n\n<script>window.__bad = true</script>\n\n[unsafe](javascript:alert(1))';
  await page.getByRole('textbox',{name:'Note content'}).fill(text);
  await page.getByRole('button',{name:'Render Markdown'}).click();
  await page.locator('.cm-content').press('Control+End');
  await expect(page.getByText('Diagram could not be rendered. Click to edit its source.')).toBeVisible({timeout:30_000});
  await expect(page.locator('.markdown-block script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as {__bad?:boolean}).__bad)).toBeUndefined();
  await expect(page.locator('.markdown-block a[href^="javascript:"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button',{name:'Render Markdown'})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByRole('button',{name:'Render Markdown'}).click();
  await expect(page.locator('.cm-content')).toContainText('not a diagram');
});

test('large notes stay virtualized and Markdown without diagrams does not load Mermaid', async ({page}) => {
  const requests: string[] = [];
  page.on('request',request => requests.push(request.url()));
  const text = Array.from({length:1500},(_,i) => `## Section ${i}\n\nA **bold** idea ${i}.`).join('\n\n') + '\n\nLast thought';
  await page.addInitScript(content => {
    localStorage.setItem('bbb-notes-preview-v1', JSON.stringify({notes:[{id:'large',content,updated:1}],tabs:['large'],active:'large'}));
  }, text);
  await page.goto('/');
  await expect(page.getByRole('textbox',{name:'Note content'})).toHaveValue(text);
  expect(requests.some(url => /MarkdownEditor|mermaid/i.test(url))).toBe(false);
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.press('Control+End');
  await editor.pressSequentially(' typed quickly');
  await expect(page.getByText('All changes saved')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);
  expect(stored).toBe(text+' typed quickly');
  expect(await page.locator('.markdown-block').count()).toBeLessThan(150);
  expect(requests.some(url => /mermaid/i.test(url))).toBe(false);
});

test('keyboard movement reveals blocks and global search reaches raw Markdown matches', async ({page}) => {
  await page.goto('/');
  await page.getByRole('textbox',{name:'Note content'}).fill('# Heading\n\nFind **NEEDLE** here.\n\nLast');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const editor = page.locator('.cm-content');
  await editor.press('Control+Home');
  await expect(editor).toContainText('# Heading');
  await editor.press('Control+End');
  await expect(page.locator('.markdown-block h1')).toHaveText('Heading');
  await page.getByRole('button',{name:'Search all notes'}).click();
  await page.getByRole('textbox',{name:'Search text'}).fill('NEEDLE');
  await expect(page.locator('.result')).toHaveCount(1);
  await page.getByRole('textbox',{name:'Search text'}).press('Enter');
  await expect(editor).toContainText('Find **NEEDLE** here.');
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('NEEDLE');
});

test('editing an existing CRLF note preserves its line endings', async ({page}) => {
  const source = '# Windows note\r\n\r\nKeep **this**\r\n\r\nLast';
  await page.addInitScript(content => {
    if (!localStorage.getItem('bbb-notes-preview-v1')) localStorage.setItem('bbb-notes-preview-v1',JSON.stringify({notes:[{id:'crlf',content,updated:1}],tabs:['crlf'],active:'crlf'}));
  },source);
  await page.goto('/');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const editor = page.locator('.cm-content');
  await editor.press('Control+End');
  await editor.pressSequentially(' edited');
  await expect(page.getByText('All changes saved')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);
  expect(saved).toBe(source+' edited');
});

test('empty-line caret stays visible and rendering toggles return focus to the editor', async ({page}) => {
  await page.goto('/');
  const toggle = page.getByRole('button',{name:'Render Markdown'});
  await toggle.click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeFocused();
  async function expectUnclippedCaret() {
    await expect(page.locator('.cm-cursor')).toHaveCount(1);
    const bounds = await page.locator('.cm-cursor').evaluate(cursor => {
      const caret = cursor.getBoundingClientRect();
      const scroller = document.querySelector('.cm-scroller')!.getBoundingClientRect();
      return {left:caret.left,right:caret.right,height:caret.height,clipLeft:scroller.left,clipRight:scroller.right};
    });
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.clipLeft);
    expect(bounds.right).toBeLessThanOrEqual(bounds.clipRight);
  }
  await expectUnclippedCaret();
  await page.keyboard.press('Enter');
  await expectUnclippedCaret();
  await toggle.click();
  await expect(editor).toBeFocused();
  await toggle.click();
  await expect(editor).toBeFocused();
  await page.keyboard.type('on the empty line');
  await expect(editor).toContainText('on the empty line');
});

test('Up and Down visit blank lines, headings and fenced source without skipping or losing focus', async ({page}) => {
  const source = '# Watermelon\n\n## Apples\n\n```js\nconst n = 1;\n```\n\nLast\n\n';
  await page.goto('/');
  await page.getByRole('textbox',{name:'Note content'}).fill(source);
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const editor = page.locator('.cm-content');
  await editor.press('Control+Home');
  await page.keyboard.press('ArrowDown'); // Empty line after Watermelon.
  await expect(editor).toBeFocused();
  const clip = await page.locator('.cm-scroller').boundingBox();
  await expect.poll(async()=> (await page.locator('.cm-cursor').boundingBox())?.x ?? -Infinity).toBeGreaterThanOrEqual(clip!.x);
  await page.keyboard.press('ArrowDown'); // Apples must become editable.
  await expect(page.locator('.cm-line').filter({hasText:'## Apples'})).toBeVisible();
  await expect(editor).toBeFocused();
  await page.keyboard.type('X');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content))
    .toBe(source.replace('## Apples','X## Apples'));
  await page.keyboard.press('Control+z');
  await page.keyboard.press('ArrowDown'); // Blank before fence.
  await page.keyboard.press('ArrowDown'); // Opening fence.
  await expect(page.locator('.cm-line').filter({hasText:'```js'})).toBeVisible();
  await page.keyboard.press('ArrowDown'); // Code line.
  await page.keyboard.type('Y');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content))
    .toBe(source.replace('const n','Yconst n'));
  await page.keyboard.press('Control+z');
  for (let i=0;i<5;i++) { await page.keyboard.press('ArrowUp'); await expect(editor).toBeFocused(); }
  await expect(page.locator('.cm-line').filter({hasText:'# Watermelon'})).toBeVisible();
});

test('consecutive headings are revealed one line at a time, including Shift selection', async ({page}) => {
  await page.goto('/');
  await page.getByRole('textbox',{name:'Note content'}).fill('# Watermelon\n## Apples\n### Pears');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const editor = page.locator('.cm-content');
  await editor.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.cm-line').filter({hasText:'## Apples'})).toBeVisible();
  await expect(editor).toBeFocused();
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.locator('.cm-line').filter({hasText:'### Pears'})).toBeVisible();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('## Apples\n');
});

test('Down still moves through wrapped text before entering the next rendered block', async ({page}) => {
  await page.setViewportSize({width:540,height:700});
  const paragraph = 'A long paragraph with words that wrap across several visual lines. '.repeat(12).trim();
  await page.goto('/');
  await page.getByRole('textbox',{name:'Note content'}).fill(paragraph+'\n# Following heading');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const editor = page.locator('.cm-content');
  await editor.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.markdown-block h1')).toHaveText('Following heading');
  await expect(editor).toBeFocused();
  await page.keyboard.type('X');
  await expect(page.getByText('All changes saved')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);
  const index = saved.indexOf('X');
  expect(index).toBeGreaterThan(0);
  expect(index).toBeLessThan(paragraph.length);
  expect(saved.replace('X','')).toBe(paragraph+'\n# Following heading');
});

test('vertical movement preserves the intended column across an empty line', async ({page}) => {
  const source = '# Watermelon\n\nabcdefghijklmno';
  await page.goto('/');
  await page.getByRole('textbox',{name:'Note content'}).fill(source);
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const editor = page.locator('.cm-content');
  await editor.press('Control+Home');
  for (let i=0;i<5;i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('X');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content))
    .toBe('# Watermelon\n\nabcdeXfghijklmno');
});
