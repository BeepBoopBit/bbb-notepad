import { test, expect } from '@playwright/test';

async function capture(page: import('@playwright/test').Page, text: string) {
  await page.goto('/');
  await page.getByRole('textbox',{name:'Note content'}).fill(text);
  await page.getByRole('button',{name:'Render Markdown'}).click();
  await page.locator('.cm-content').press('Control+End');
}

test('ENV pairs mask eight bullets, reveal deliberately, and never leak into titles or search previews', async ({page}) => {
  await capture(page,'!ENV: TOKEN=very-secret-value\n!ENV: x\n!PROJECT: bbb-notes\n\nEditing here');
  const values = page.locator('.pair-env .pair-value');
  await expect(values).toHaveText(['••••••••','••••••••']);
  await expect(page.locator('.titlebar')).not.toContainText('very-secret-value');
  await expect(page.locator('.cm-content')).not.toContainText('very-secret-value');
  await page.getByRole('button',{name:'Reveal ENV value'}).first().click();
  await expect(values.first()).toHaveText('TOKEN=very-secret-value');
  await expect(page.locator('.cm-line').filter({hasText:'!ENV:'})).toHaveCount(0);
  await page.getByRole('button',{name:'Hide ENV value'}).click();
  await expect(values.first()).toHaveText('••••••••');
  await page.getByRole('button',{name:'Search all notes'}).click();
  await page.getByRole('textbox',{name:'Search text'}).fill('pair:ENV very-secret');
  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('.result')).not.toContainText('very-secret-value');
  await expect(page.locator('.result')).toContainText('••••••••');
});

test('IDEA blocks organize Markdown, nested pairs and separators without changing source', async ({page}) => {
  const source = '!IDEA:{\nWe can do **x**\n---\nThen y\n-----\n!ENV: inside-secret\n!TASK:{\nDo z\n}\n}\n\nLast';
  const errors: string[] = []; page.on('pageerror',e=>errors.push(e.message));
  await capture(page,source);
  await expect(page.locator('.pair-idea')).toBeVisible();
  await expect(page.locator('.pair-idea strong').filter({hasText:'x'})).toBeVisible();
  await expect(page.locator('.pair-idea hr')).toHaveCount(2);
  await expect(page.locator('.pair-idea .pair-env .pair-value')).toHaveText('••••••••');
  await expect(page.locator('.pair-idea .pair-generic .pair-value')).toContainText('Do z');
  await page.getByRole('button',{name:'Edit IDEA pair',exact:true}).click();
  await expect(page.locator('.cm-line').filter({hasText:'!IDEA:{'})).toBeVisible();
  await page.locator('.cm-content').press('Control+End');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);
  expect(saved).toBe(source);
  expect(errors).toEqual([]);
});

test('braces complete and Enter expands block pairs in both editor paths', async ({page}) => {
  await page.goto('/');
  const plain = page.getByRole('textbox',{name:'Note content'});
  await plain.fill('!IDEA:');
  await plain.press('End');
  await page.keyboard.type('{');
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content)).toBe('!IDEA:{}');
  await page.keyboard.press('Enter');
  await page.keyboard.type('first idea');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content)).toBe('!IDEA:{\nfirst idea\n}');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const editor = page.locator('.cm-content');
  await editor.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('!TASK:{');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second idea');
  await expect(page.getByText('All changes saved')).toBeVisible();
  const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);
  expect(saved).toBe('!IDEA:{\nfirst idea\n}\n!TASK:{\nsecond idea\n}');
});

test('key filters search the matching pair value and reach closed notes', async ({page}) => {
  const source = '!IDEA:{\nBuild a capture tool\n}\n!ENV: unrelated-secret\n\nLast';
  await capture(page,source);
  await page.getByRole('button',{name:'New note',exact:true}).click();
  await page.locator('.cm-content').pressSequentially('!TASK: capture');
  await expect(page.getByText('All changes saved')).toBeVisible();
  const firstTab = page.locator('.tab').first();
  await firstTab.getByRole('button',{name:/^Close /}).click();
  await page.getByRole('button',{name:'Search all notes'}).click();
  const search = page.getByRole('textbox',{name:'Search text'});
  await search.fill('pair:idea capture');
  await expect(page.locator('.result')).toHaveCount(1);
  await search.press('Enter');
  await expect(page.locator('.pair-shell-start.pair-body-idea')).toBeVisible();
  await expect(page.locator('.cm-line').filter({hasText:'Build a capture tool'})).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes.find((n:{content:string})=>n.content.includes('Build a capture tool')).content)).toBe(source);
  await page.getByRole('button',{name:'Search all notes'}).click();
  await search.fill('pair:IDEA unrelated-secret');
  await expect(page.locator('.result')).toHaveCount(0);
});

test('standalone separators need three hyphens and code examples stay literal', async ({page}) => {
  await capture(page,'First\n---\nSecond\n----\nThird\n\n```text\n!ENV: example\n---\n}\n```\n\nLast');
  await expect(page.locator('.markdown-block hr')).toHaveCount(2);
  await expect(page.locator('.pair-env')).toHaveCount(0);
  await expect(page.locator('.markdown-block pre')).toContainText('!ENV: example');
});

test('block brace completion preserves existing Windows line endings', async ({page}) => {
  const source = 'Windows note\r\n\r\n!IDEA:';
  await page.addInitScript(content => localStorage.setItem('bbb-notes-preview-v1',JSON.stringify({notes:[{id:'win',content,updated:1}],tabs:['win'],active:'win'})),source);
  await page.goto('/');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  await page.locator('.cm-content').press('Control+End');
  await page.keyboard.type('{');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Idea on Windows');
  await expect(page.getByText('All changes saved')).toBeVisible();
  const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);
  expect(saved).toBe(source+'{\r\nIdea on Windows\r\n}');
});

test('SCRIPT pairs provide a styled presentation script with editing, folding, copying and search',async({page})=>{
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  const source='!SCRIPT:{\nWelcome **everyone**.\n\nToday we will discuss the plan.\n}\n\nLast';
  await capture(page,source);
  await expect(page.locator('.pair-script')).toBeVisible();
  await expect(page.locator('.pair-script strong').filter({hasText:'everyone'})).toBeVisible();
  await page.locator('.markdown-block').filter({has:page.locator('.pair-script')}).getByRole('button',{name:'Copy block',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('Welcome **everyone**.\n\nToday we will discuss the plan.');
  await page.getByRole('button',{name:'Collapse SCRIPT pair',exact:true}).click();
  await expect(page.locator('.pair-script .pair-value')).not.toBeVisible();
  await page.getByRole('button',{name:'Expand SCRIPT pair',exact:true}).click();
  await page.locator('.pair-script .copy-sentence').filter({hasText:'Today we will discuss'}).click();
  await expect(page.locator('.pair-shell-start.pair-body-script')).toBeVisible();
  await expect(page.locator('.cm-line.pair-body-script').filter({hasText:'Today we will discuss'})).toBeVisible();
  await page.keyboard.press('End');await page.keyboard.type(' Ready.');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content)).toBe(source.replace('the plan.','the plan. Ready.'));
  await page.getByRole('button',{name:'Search all notes'}).click();
  await page.getByRole('textbox',{name:'Search text'}).fill('pair:SCRIPT Ready');
  await expect(page.locator('.result')).toHaveCount(1);
});

test('named pairs display names while preserving masking and source editing',async({page})=>{
  const source='!ENV(API token): secret-value\n!SCRIPT(Introduction):{\nHello everyone\n}\n\nEditing here';
  await capture(page,source);
  await expect(page.locator('.pair-env .pair-label')).toHaveText('API token:');
  await expect(page.locator('.pair-env .pair-value')).toHaveText('••••••••');
  await expect(page.locator('.pair-script .pair-label')).toHaveText('Introduction');
  await page.getByRole('button',{name:'Reveal ENV value'}).click();
  await expect(page.locator('.pair-env .pair-value')).toHaveText('secret-value');
  await page.getByRole('button',{name:'Edit Introduction pair',exact:true}).click();
  await expect(page.locator('.cm-line').filter({hasText:'!SCRIPT(Introduction):{'})).toBeVisible();
});
