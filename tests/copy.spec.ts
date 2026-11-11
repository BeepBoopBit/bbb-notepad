import {test,expect,type Page} from '@playwright/test';
const source='First **important** sentence. Second sentence. Third `code` sentence.\n\nAnother paragraph for prompts.\n\n```js\nconst answer = 42;\n```\n\n!ENV: token-secret\n\nLast';
async function setup(page:Page,text=source) {
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill(text);
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+End');
}
async function clipboard(page:Page) {return page.evaluate(()=>navigator.clipboard.readText());}

test('Shift-click on a checklist checkbox collects the whole row',async({page})=>{
  const text='- [ ] First **task**. More details.\n- [x] Finished task.\n\nLast';
  await setup(page,text);
  const row=page.locator('.markdown-block li').filter({hasText:'First task.'});
  const checkbox=await row.locator('input').boundingBox();
  expect(checkbox).not.toBeNull();
  await page.keyboard.down('Shift');
  await page.mouse.click(checkbox!.x+checkbox!.width/2,checkbox!.y+checkbox!.height/2);
  await page.keyboard.up('Shift');
  await expect(row).toHaveClass(/copy-selected/);
  await expect(page.locator('li.copy-selected')).toHaveCount(1);
  await page.getByRole('button',{name:'Copy selected Markdown'}).click();
  await expect.poll(()=>clipboard(page)).toMatch(/^-\s+\[ \]\s+First \*\*task\*\*\. More details\.$/);
  await page.getByRole('button',{name:'Copy selected plain text'}).click();
  await expect.poll(()=>clipboard(page)).toBe('First task. More details.');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content)).toBe(text);
});

test('Shift-click collects individual sentences in document order and copies Markdown or plain text',async({page})=>{
  await setup(page);
  const first=page.locator('.copy-sentence').filter({hasText:'First important sentence.'});
  const third=page.locator('.copy-sentence').filter({hasText:'Third code sentence.'});
  await third.click({modifiers:['Shift']});await first.click({modifiers:['Shift']});
  await expect(page.getByText('2 selected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Copy selected Markdown'}).click();
  await expect.poll(()=>clipboard(page)).toBe('First **important** sentence. Third `code` sentence.');
  await page.getByRole('button',{name:'Copy selected plain text'}).click();
  await expect.poll(()=>clipboard(page)).toBe('First important sentence. Third code sentence.');
  await first.click({modifiers:['Shift']});await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('toolbar',{name:'Copy selected sentences and blocks'})).toHaveCount(0);
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content)).toBe(source);
});

test('Shift-drag collects the complete sentence range',async({page})=>{
  await setup(page);
  const first=await page.locator('.copy-sentence').filter({hasText:'First important sentence.'}).boundingBox();
  const third=await page.locator('.copy-sentence').filter({hasText:'Third code sentence.'}).boundingBox();
  await page.keyboard.down('Shift');await page.mouse.move(first!.x+8,first!.y+8);await page.mouse.down();
  await page.mouse.move(third!.x+10,third!.y+8,{steps:12});await page.mouse.up();await page.keyboard.up('Shift');
  await expect(page.getByText('3 selected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Copy selected Markdown'}).click();
  await expect.poll(()=>clipboard(page)).toBe('First **important** sentence. Second sentence. Third `code` sentence.');
});

test('normal dragging retains precise selection without collecting sentences',async({page})=>{
  await setup(page);
  const first=await page.locator('.copy-sentence').filter({hasText:'First important sentence.'}).boundingBox();
  const second=await page.locator('.copy-sentence').filter({hasText:'Second sentence.'}).boundingBox();
  await page.mouse.move(first!.x+40,first!.y+10);await page.mouse.down();
  await page.mouse.move(second!.x+45,second!.y+10,{steps:12});await page.mouse.up();
  const exact=await page.evaluate(()=>getSelection()?.toString());
  expect(exact?.length).toBeGreaterThan(0);expect(exact).not.toBe('First important sentence. Second sentence.');
  await expect(page.locator('.copy-toolbar')).toHaveCount(0);
  await page.keyboard.press('Control+c');await expect.poll(()=>clipboard(page)).toBe(exact);
  await expect(page.locator('.markdown-block strong').filter({hasText:'important'})).toBeVisible();
});

test('whole-block grab, direct code copy and masked ENV value copy',async({page})=>{
  await setup(page);
  const block=page.locator('.markdown-block').filter({has:page.locator('strong',{hasText:'important'})});
  await block.getByRole('button',{name:'Select whole block'}).click();
  await page.keyboard.press('Control+c');
  await expect.poll(()=>clipboard(page)).toBe('First **important** sentence. Second sentence. Third `code` sentence.');
  await page.getByRole('button',{name:'Clear copied selection'}).click();
  await page.getByRole('button',{name:'Copy code',exact:true}).click();
  await expect.poll(()=>clipboard(page)).toBe('const answer = 42;\n');
  await page.getByRole('button',{name:'Copy ENV value'}).click();
  await expect.poll(()=>clipboard(page)).toBe('token-secret');
  await expect(page.locator('.pair-env .pair-value')).toHaveText('••••••••');
});

test('block copy works over HTTP without navigator.clipboard',async({page})=>{
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');
  await page.getByRole('textbox',{name:'Note content'}).fill('Prompt **formatting**\n\nLast');
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+End');
  await page.evaluate(()=>{
    (window as unknown as {savedClipboard:Clipboard}).savedClipboard=navigator.clipboard;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
  });
  await page.getByRole('button',{name:'Copy block',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {savedClipboard:Clipboard}).savedClipboard.readText())).toBe('Prompt **formatting**');
});

test('Shift-click can collect the currently edited source paragraph as a whole block',async({page})=>{
  await setup(page);
  await page.locator('.cm-line').filter({hasText:'Last'}).click({modifiers:['Shift']});
  await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Copy selected Markdown'}).click();
  await expect.poll(()=>clipboard(page)).toBe('Last');
});

test('dragging across paragraphs copies clean Markdown with paragraph breaks',async({page})=>{
  await setup(page);
  const start=await page.locator('.copy-sentence').filter({hasText:'Second sentence.'}).boundingBox();
  const end=await page.locator('.copy-sentence').filter({hasText:'Another paragraph for prompts.'}).boundingBox();
  await page.keyboard.down('Shift');await page.mouse.move(start!.x+6,start!.y+8);await page.mouse.down();
  await page.mouse.move(end!.x+20,end!.y+8,{steps:15});await page.mouse.up();await page.keyboard.up('Shift');
  await page.getByRole('button',{name:'Copy selected Markdown'}).click();
  await expect.poll(()=>clipboard(page)).toBe('Second sentence. Third `code` sentence.\n\nAnother paragraph for prompts.');
});

test('Shift-drag scrolls the editor and keeps collecting offscreen paragraphs',async({page})=>{
  const text=Array.from({length:80},(_,i)=>`Paragraph ${i} for a prompt.`).join('\n\n')+'\n\nLast';
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.addInitScript(content=>localStorage.setItem('bbb-notes-preview-v1',JSON.stringify({notes:[{id:'long',content,updated:1}],tabs:['long'],active:'long'})),text);
  await page.goto('/');await page.getByRole('button',{name:'Render Markdown'}).click();
  await page.locator('.cm-content').press('Control+Home');
  const first=await page.locator('.copy-sentence').filter({hasText:'Paragraph 1 for a prompt.'}).boundingBox();
  const scroller=await page.locator('.cm-scroller').boundingBox();
  await page.keyboard.down('Shift');await page.mouse.move(first!.x+8,first!.y+8);await page.mouse.down();
  await page.mouse.move(first!.x+10,scroller!.y+scroller!.height+20,{steps:15});
  await expect.poll(()=>page.locator('.cm-scroller').evaluate(el=>el.scrollTop)).toBeGreaterThan(300);
  await page.mouse.up();await page.keyboard.up('Shift');
  const count=Number((await page.locator('.copy-toolbar > span').textContent())!.split(' ')[0]);expect(count).toBeGreaterThan(10);
  await page.getByRole('button',{name:'Copy selected Markdown'}).click();
  const copied=await clipboard(page);expect(copied).toContain('Paragraph 1 for a prompt.');expect(copied).toContain('Paragraph 10 for a prompt.');
});

test('clipboard failure is visible and does not claim success',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}});
    document.execCommand=()=>false;
  });
  await page.getByRole('button',{name:'Copy code',exact:true}).click();
  await expect(page.locator('.copy-feedback')).toContainText('Copy failed');
  await expect(page.locator('.copy-feedback')).not.toHaveText('Copied');
});

test('collection supports keyboard copying',async({page})=>{
  await setup(page);await expect(page.getByText('All changes saved')).toBeVisible();
  await page.locator('.copy-sentence').filter({hasText:'Second sentence.'}).click({modifiers:['Shift']});
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content)).toBe(source);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Copy selected Markdown'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(()=>clipboard(page)).toBe('Second sentence.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-content')).toBeFocused();
});

test('collected headings, quotes, ordered items, tables and code preserve their Markdown meaning',async({page})=>{
  await setup(page,'# Heading\n\n> First **quoted** sentence. Second quoted sentence.\n\n1. Ordered first.\n2. Ordered second.\n\n| A | B |\n| --- | --- |\n| x | y |\n\n```\n    kept indent\n```\n\nLast');
  const copy=page.getByRole('button',{name:'Copy selected Markdown'});
  const clear=page.getByRole('button',{name:'Clear copied selection'});
  await page.locator('.markdown-block h1').click({modifiers:['Shift']});await copy.click();
  await expect.poll(()=>clipboard(page)).toBe('# Heading');await clear.click();
  await page.locator('.copy-sentence').filter({hasText:'First quoted sentence.'}).click({modifiers:['Shift']});
  await page.locator('.copy-sentence').filter({hasText:'Second quoted sentence.'}).click({modifiers:['Shift']});
  await copy.click();await expect.poll(()=>clipboard(page)).toBe('> First **quoted** sentence. Second quoted sentence.');await clear.click();
  await page.locator('.markdown-block li').filter({hasText:'Ordered second.'}).click({modifiers:['Shift']});await copy.click();
  await expect.poll(()=>clipboard(page)).toMatch(/^2\.\s+Ordered second\.$/);await clear.click();
  await page.locator('.markdown-block td').first().click({modifiers:['Shift']});await copy.click();
  const table=await clipboard(page);expect(table).toContain('| A | B |');expect(table).toContain('| --- | --- |');expect(table).toContain('| x | y |');await clear.click();
  await page.locator('.markdown-block pre').click({modifiers:['Shift']});await copy.click();
  await expect.poll(()=>clipboard(page)).toContain('```\n    kept indent\n```');
  await page.getByRole('button',{name:'Copy selected plain text'}).click();
  await expect.poll(()=>clipboard(page)).toBe('    kept indent');
});
