import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,source:string) {
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill(source);
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+End');
}
async function saved(page:Page){await expect(page.getByText('All changes saved')).toBeVisible();return page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);}
const source='# Fruit\n\nApple notes.\n\n## Seeds\n\nSeed notes.\n\n# Work\n\n!IDEA:{\nFirst thought. Second thought.\n\n!TASK:{\nDo this.\n}\n}\n\nBottom';
test('heading toggles fold their section and preserve nested collapse state',async({page})=>{
  await setup(page,source);
  await page.getByRole('button',{name:'Collapse Seeds section',exact:true}).click();
  await expect(page.getByText('Seed notes.',{exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'Collapse Fruit section',exact:true}).click();
  await expect(page.getByText('Apple notes.',{exact:true})).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Collapse IDEA pair',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand Fruit section',exact:true}).click();
  await expect(page.getByText('Apple notes.',{exact:true})).toBeVisible();
  await expect(page.getByText('Seed notes.',{exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'Expand Seeds section',exact:true}).click();
  await expect(page.getByText('Seed notes.',{exact:true})).toBeVisible();
  expect(await saved(page)).toBe(source);
});
test('pairs toggle values and keep their shell while editing contents',async({page})=>{
  await setup(page,source);
  await page.getByRole('button',{name:'Collapse IDEA pair',exact:true}).click();
  await expect(page.getByText('First thought.',{exact:false})).not.toBeVisible();
  await page.getByRole('button',{name:'Expand IDEA pair',exact:true}).click();
  await page.locator('.copy-sentence').filter({hasText:'Second thought.'}).click();
  await expect(page.locator('.pair-shell-start.pair-body-idea')).toBeVisible();
  await expect(page.locator('.cm-line').filter({hasText:'!IDEA:{'})).toHaveCount(0);
  await expect(page.locator('.cm-line.pair-body-idea').filter({hasText:'First thought.'})).toBeVisible();
  await page.keyboard.press('End');await page.keyboard.type(' Extra.');
  expect(await saved(page)).toBe(source.replace('Second thought.','Second thought. Extra.'));
  await page.getByRole('button',{name:'Edit IDEA pair',exact:true}).click();
  await expect(page.locator('.cm-line').filter({hasText:'!IDEA:{'})).toBeVisible();
  await expect(page.locator('.pair-shell-start.pair-body-idea')).toHaveCount(0);
});
test('slash commands show suggestions, consume the command and collapse or expand the whole note',async({page})=>{
  await setup(page,source);const editor=page.locator('.cm-content');
  await editor.press('Control+End');await editor.press('Enter');await page.keyboard.type('/coll');
  await expect(page.getByRole('menu',{name:'Slash commands'})).toBeVisible();
  await expect(page.getByRole('menuitem')).toContainText('/collapse');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Expand Fruit section',exact:true})).toBeVisible();
  await expect(page.getByText('Apple notes.',{exact:true})).not.toBeVisible();
  expect(await saved(page)).toBe(source+'\n');
  await page.keyboard.type('/expand');await page.keyboard.press('Enter');
  await expect(page.getByText('Apple notes.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Collapse IDEA pair',exact:true})).toBeVisible();
  expect(await saved(page)).toBe(source+'\n');
});
test('slash commands are literal inside code and can be dismissed',async({page})=>{
  await setup(page,'```text\n/collapse\n```\n\nBottom');
  await page.locator('.cm-content').press('Control+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.locator('.cm-content').press('Control+End');await page.keyboard.press('Enter');await page.keyboard.type('/');
  await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('a slash command from the lightweight source editor enables rendering and keeps the bottom capture line usable',async({page})=>{
  await page.goto('/');const editor=page.getByRole('textbox',{name:'Note content'});
  await editor.fill('# Heading\n\nContent\n\n/collapse');await editor.press('Control+End');await editor.press('Enter');
  await expect(page.getByRole('button',{name:'Render Markdown'})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Expand Heading section',exact:true})).toBeVisible();
  await page.keyboard.type('New capture');
  expect(await saved(page)).toBe('# Heading\n\nContent\n\nNew capture');
});
test('source code examples do not execute slash commands',async({page})=>{
  await page.goto('/');const editor=page.getByRole('textbox',{name:'Note content'});
  await editor.fill('```text\n/collapse\n```');await editor.press('Control+Home');await editor.press('ArrowDown');await editor.press('End');await editor.press('Enter');
  await expect(page.getByRole('button',{name:'Render Markdown'})).toHaveAttribute('aria-pressed','false');
  await expect(editor).toContainText('/collapse');
});
test('nested headings and pairs toggle independently, including scalar and ENV values',async({page})=>{
  await setup(page,'!IDEA:{\n# Nested\n\nNested content.\n\n# Next\n\n!TASK: do something\n!ENV: secret-value\n}\n\nBottom');
  await page.getByRole('button',{name:'Collapse Nested section',exact:true}).click();
  await expect(page.getByText('Nested content.',{exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'Collapse TASK pair',exact:true}).click();
  await expect(page.getByText('do something',{exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'Collapse ENV pair',exact:true}).click();
  await expect(page.locator('.pair-env .pair-value')).not.toBeVisible();
  await page.getByRole('button',{name:'Expand ENV pair',exact:true}).click();
  await expect(page.locator('.pair-env .pair-value')).toHaveText('••••••••');
  await expect(page.locator('.cm-content')).not.toContainText('secret-value');
  await page.getByRole('button',{name:'Expand TASK pair',exact:true}).click();
  await expect(page.getByText('do something',{exact:true})).toBeVisible();
});
test('collapse state survives switching tabs and search expands matching sections',async({page})=>{
  await setup(page,source);await page.getByRole('button',{name:'Collapse Fruit section',exact:true}).click();
  await page.getByRole('button',{name:'New note',exact:true}).click();
  await page.locator('.tab-title').first().click();
  await expect(page.getByRole('button',{name:'Expand Fruit section',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Search all notes'}).click();
  await page.getByRole('textbox',{name:'Search text'}).fill('Apple notes.');
  await expect(page.locator('.result')).toHaveCount(1);await page.getByRole('textbox',{name:'Search text'}).press('Enter');
  await expect(page.locator('.cm-line').filter({hasText:'Apple notes.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Collapse Fruit section',exact:true})).toBeVisible();
});

test('slash commands enable preview again after rendering was switched off',async({page})=>{
  await setup(page,'# Heading\n\nContent\n\nBottom');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  await page.locator('.cm-content').press('Control+End');await page.keyboard.press('Enter');await page.keyboard.type('/collapse ');await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Render Markdown'})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Expand Heading section',exact:true})).toBeVisible();
  expect(await saved(page)).toBe('# Heading\n\nContent\n\nBottom\n');
});

test('collapsing from inside a pair leaves a visible capture line for subsequent typing',async({page})=>{
  await setup(page,'!IDEA:{\nThought.\n}');
  await page.getByRole('button',{name:'Render Markdown'}).click();
  await page.locator('.cm-content').press('Control+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');await page.keyboard.type('/collapse');await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Expand IDEA pair',exact:true})).toBeVisible();
  await page.keyboard.type('Outside.');
  expect(await saved(page)).toBe('!IDEA:{\nThought.\n\n}\n\nOutside.');
});
test('a heading toggle clears a collected selection and responds to the same click',async({page})=>{
  await setup(page,source);
  await page.locator('.copy-sentence').filter({hasText:'Apple notes.'}).click({modifiers:['Shift']});
  await page.getByRole('button',{name:'Collapse Fruit section',exact:true}).click();
  await expect(page.locator('.copy-toolbar')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Expand Fruit section',exact:true})).toBeVisible();
});

test('collapsed diagrams wait to load Mermaid until their section is expanded',async({page})=>{
  const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
  await page.goto('/');const editor=page.getByRole('textbox',{name:'Note content'});
  await editor.fill('# Diagram\n\n```mermaid\nflowchart LR\nA --> B\n```\n\n/collapse');await editor.press('Control+End');await editor.press('Enter');
  await expect(page.getByRole('button',{name:'Expand Diagram section',exact:true})).toBeVisible();
  await page.keyboard.type('Still capturing');
  expect(requests.some(url=>/mermaid/i.test(url))).toBe(false);
  await page.getByRole('button',{name:'Expand Diagram section',exact:true}).click();
  await expect(page.locator('.mermaid-diagram svg')).toBeVisible({timeout:30_000});
});

test('collapsing the section containing the cursor retains its expand control without a gutter',async({page})=>{
  await setup(page,source);await page.locator('.copy-sentence').filter({hasText:'Apple notes.'}).click();
  await page.getByRole('button',{name:'Collapse Fruit section',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expand Fruit section',exact:true})).toBeVisible();
  await page.locator('.markdown-block h1').filter({hasText:'Fruit'}).click({position:{x:60,y:12}});
  await expect(page.locator('.cm-line').filter({hasText:'# Fruit'})).toBeVisible();
  await expect(page.getByText('Apple notes.',{exact:true})).toBeVisible();
  expect(await saved(page)).toBe(source);
});
