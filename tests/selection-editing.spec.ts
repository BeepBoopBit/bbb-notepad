import {test,expect,type Page} from '@playwright/test';
const source='First **important** sentence. Second sentence. Third `code` sentence.\n\nOther paragraph.\n\nLast';
async function setup(page:Page,text=source) {
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');
  await page.getByRole('textbox',{name:'Note content'}).fill(text);await page.getByRole('button',{name:'Render Markdown'}).click();
  await page.locator('.cm-content').press('Control+End');
}
const sentence=(page:Page,text:string)=>page.locator('.copy-sentence').filter({hasText:text});
async function saved(page:Page){await expect(page.getByText('All changes saved')).toBeVisible();return page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);}

test('plain clicks clear collection inside and outside the editor, while copy controls preserve it',async({page})=>{
  await setup(page);
  await sentence(page,'Second sentence.').click({modifiers:['Shift']});
  await page.getByRole('button',{name:'Copy selected Markdown'}).click();
  await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
  await page.locator('.cm-line').filter({hasText:'Last'}).click();
  await expect(page.locator('.copy-toolbar')).toHaveCount(0);
  await sentence(page,'Second sentence.').click({modifiers:['Shift']});
  await page.getByRole('button',{name:'Search all notes'}).click();
  await expect(page.locator('.copy-toolbar')).toHaveCount(0);
});

test('a normal drag upgrades when Shift is pressed and stays upgraded when Shift is released',async({page})=>{
  await setup(page);
  const first=await sentence(page,'First important sentence.').boundingBox();
  const second=await sentence(page,'Second sentence.').boundingBox();
  const third=await sentence(page,'Third code sentence.').boundingBox();
  await page.mouse.move(first!.x+10,first!.y+8);await page.mouse.down();
  await page.mouse.move(second!.x+10,second!.y+8,{steps:8});
  await expect(page.locator('.copy-toolbar')).toHaveCount(0);
  await page.keyboard.down('Shift');
  await expect(page.getByText('2 selected',{exact:true})).toBeVisible();
  await page.keyboard.up('Shift');
  await page.mouse.move(third!.x+10,third!.y+8,{steps:8});await page.mouse.up();
  await expect(page.getByText('3 selected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Copy selected Markdown'}).click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(source.split('\n')[0]);
});

test('typing replaces collected sentences and one Undo restores the original',async({page})=>{
  await setup(page);
  await sentence(page,'Second sentence.').click({modifiers:['Shift']});
  await page.keyboard.type('Replacement.');
  expect(await saved(page)).toBe(source.replace('Second sentence.','Replacement.'));
  await expect(page.locator('.copy-toolbar')).toHaveCount(0);
  await page.keyboard.press('Control+z');expect(await saved(page)).toBe(source);
});

test('discontiguous sentences are replaced once and preserve unselected content',async({page})=>{
  await setup(page);
  await sentence(page,'First important sentence.').click({modifiers:['Shift']});
  await sentence(page,'Third code sentence.').click({modifiers:['Shift']});
  await page.keyboard.type('New.');
  expect(await saved(page)).toBe('New. Second sentence.\n\nOther paragraph.\n\nLast');
});

test('Delete and paste operate on collected units',async({page})=>{
  await setup(page);
  await sentence(page,'Second sentence.').click({modifiers:['Shift']});await page.keyboard.press('Delete');
  expect(await saved(page)).toBe(source.replace('Second sentence. ',''));
  await page.keyboard.press('Control+z');await page.locator('.cm-content').press('Control+End');
  await sentence(page,'Second sentence.').click({modifiers:['Shift']});
  await page.evaluate(()=>navigator.clipboard.writeText('Pasted **formatting**.'));
  await page.keyboard.press('Control+v');
  await expect.poll(()=>saved(page)).toBe(source.replace('Second sentence.','Pasted **formatting**.'));
});

test('replacement preserves pair wrappers and unrelated ENV values',async({page})=>{
  const value='!IDEA:{\nFirst thought. Second thought.\n!ENV: keep-this-secret\n}\n\nLast';
  await setup(page,value);await sentence(page,'Second thought.').click({modifiers:['Shift']});
  await page.keyboard.type('Revised.');
  expect(await saved(page)).toBe(value.replace('Second thought.','Revised.'));
});

test('Enter and Shift+Enter insert one newline without hidden spaces in both editor paths',async({page})=>{
  await page.goto('/');const plain=page.getByRole('textbox',{name:'Note content'});
  await plain.fill('First');await plain.press('End');await page.keyboard.press('Shift+Enter');await page.keyboard.press('Backspace');
  await expect(plain).toHaveValue('First');
  await page.keyboard.press('Enter');await page.keyboard.type('Second');await page.keyboard.press('Shift+Enter');await page.keyboard.type('continued');
  await expect(plain).toHaveValue('First\nSecond\ncontinued');
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+End');
  await page.keyboard.press('Shift+Enter');await page.keyboard.press('Backspace');
  expect(await saved(page)).toBe('First\nSecond\ncontinued');
  await page.keyboard.press('Enter');await page.keyboard.type('Third');
  expect(await saved(page)).toBe('First\nSecond\ncontinued\nThird');
  await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.type('Last');
  await expect(page.locator('.markdown-block p')).toHaveCount(1);await expect(page.locator('.markdown-block p br')).toHaveCount(3);
});

test('replacing a sentence that shares bold formatting keeps the remaining sentence formatted',async({page})=>{
  await setup(page,'**One sentence. Two sentences.**\n\nLast');
  await sentence(page,'One sentence.').click({modifiers:['Shift']});await page.keyboard.type('New.');
  expect(await saved(page)).toBe('New. **Two sentences.**\n\nLast');
});

test('typing on a selected whole-block grip replaces that block',async({page})=>{
  await setup(page);
  await page.locator('.markdown-block').filter({has:page.locator('strong',{hasText:'important'})}).getByRole('button',{name:'Select whole block'}).click();
  await page.keyboard.type('New block.');
  expect(await saved(page)).toBe('New block.\n\nOther paragraph.\n\nLast');
});

test('cut copies collected content and removes it as one undoable operation',async({page})=>{
  await setup(page);await sentence(page,'Second sentence.').click({modifiers:['Shift']});await page.keyboard.press('Control+x');
  await expect.poll(()=>saved(page)).toBe(source.replace('Second sentence. ',''));
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('Second sentence.');
  await page.keyboard.press('Control+z');expect(await saved(page)).toBe(source);
});

test('replacement spanning paragraph blocks preserves unselected content and Undo',async({page})=>{
  await setup(page);
  const start=await sentence(page,'Second sentence.').boundingBox(),end=await sentence(page,'Other paragraph.').boundingBox();
  await page.keyboard.down('Shift');await page.mouse.move(start!.x+5,start!.y+8);await page.mouse.down();
  await page.mouse.move(end!.x+10,end!.y+8,{steps:12});await page.mouse.up();await page.keyboard.up('Shift');
  await page.keyboard.type('New.');expect(await saved(page)).toBe('First **important** sentence. New.\n\nLast');
  await page.keyboard.press('Control+z');expect(await saved(page)).toBe(source);
});

test('code Enter and Shift+Enter keep ordinary code newlines',async({page})=>{
  await setup(page,'```js\nconst n = 1;\n```\n\nLast');
  await page.locator('.cm-content').press('Control+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');
  await page.keyboard.press('Enter');await page.keyboard.type('const next = 2;');
  await page.keyboard.press('Shift+Enter');await page.keyboard.type('const last = 3;');
  expect(await saved(page)).toBe('```js\nconst n = 1;\nconst next = 2;\nconst last = 3;\n```\n\nLast');
});

test('Enter and Shift+Enter do not add list markers, indentation, or hard-break spaces',async({page})=>{
  await setup(page,'- first\n\nLast');await page.locator('.cm-content').press('Control+Home');await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');await page.keyboard.type('continued');
  await page.keyboard.press('Enter');await page.keyboard.type('second');
  expect(await saved(page)).toBe('- first\ncontinued\nsecond\n\nLast');
});

test('replacement and Enter preserve existing Windows line endings',async({page})=>{
  const original='First sentence. Second sentence.\r\n\r\nLast';
  await page.addInitScript(content=>localStorage.setItem('bbb-notes-preview-v1',JSON.stringify({notes:[{id:'win',content,updated:1}],tabs:['win'],active:'win'})),original);
  await page.goto('/');await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+End');
  await sentence(page,'Second sentence.').click({modifiers:['Shift']});await page.keyboard.type('New.');
  await page.keyboard.press('Enter');await page.keyboard.type('Paragraph.');await page.keyboard.press('Shift+Enter');await page.keyboard.type('Same block.');
  expect(await saved(page)).toBe('First sentence. New.\r\nParagraph.\r\nSame block.\r\n\r\nLast');
});

test('typing replaces a precise normal-drag selection in rendered text',async({page})=>{
  await setup(page);
  const first=await sentence(page,'First important sentence.').boundingBox(),second=await sentence(page,'Second sentence.').boundingBox();
  await page.mouse.move(first!.x+42,first!.y+8);await page.mouse.down();await page.mouse.move(second!.x+45,second!.y+8,{steps:12});await page.mouse.up();
  await expect(page.locator('.copy-toolbar')).toHaveCount(0);
  const exact=await page.evaluate(()=>getSelection()?.toString());expect(exact?.length).toBeGreaterThan(0);
  await page.keyboard.type('NEW');
  const result=await saved(page);expect(result).toContain('NEW');expect(result).not.toContain('Second sentence.');expect(result).toContain('Other paragraph.');
  await page.keyboard.press('Control+z');expect(await saved(page)).toBe(source);
});

test('Shift converts a completed text selection immediately without another mouse move',async({page})=>{
  await setup(page);
  const start=await sentence(page,'Second sentence.').boundingBox(),end=await sentence(page,'Third code sentence.').boundingBox();
  await page.mouse.move(start!.x+10,start!.y+8);await page.mouse.down();
  await page.mouse.move(end!.x+30,end!.y+8,{steps:12});await page.mouse.up();
  await expect(page.locator('.copy-toolbar')).toHaveCount(0);
  await page.keyboard.down('Shift');
  await expect(page.getByText('2 selected',{exact:true})).toBeVisible();
  await page.keyboard.up('Shift');await page.keyboard.press('Control+c');
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('Second sentence. Third `code` sentence.');
  expect(await saved(page)).toBe(source);
});

for(const release of [false,true])test(`Shift converts selection starting on an empty line ${release ? 'after mouseup' : 'during drag'}`,async({page})=>{
  await setup(page);
  const blank=page.locator('.cm-line').filter({hasText:/^$/}).first();
  const start=await blank.boundingBox(),end=await sentence(page,'Other paragraph.').boundingBox();
  await page.mouse.move(start!.x+5,start!.y+8);await page.mouse.down();
  await page.mouse.move(end!.x+30,end!.y+8,{steps:12});
  if(release)await page.mouse.up();
  await page.keyboard.down('Shift');
  await expect(page.locator('.copy-toolbar')).toBeVisible();
  await expect(page.locator('.copy-selected').filter({hasText:'Other paragraph.'})).not.toHaveCount(0);
  await page.keyboard.up('Shift');if(!release)await page.mouse.up();
  await page.keyboard.press('Control+c');
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('Other paragraph.');
  expect(await saved(page)).toBe(source);
});

test('blank lines anchor Shift drags without becoming selected units',async({page})=>{
  await setup(page);
  const blank=page.locator('.cm-line').filter({hasText:/^$/}).first();
  await blank.click({modifiers:['Shift']});
  await expect(page.locator('.copy-toolbar')).toHaveCount(0);
  await expect(blank).not.toHaveClass(/copy-selected/);
  const start=await blank.boundingBox(),end=await sentence(page,'Other paragraph.').boundingBox();
  await page.keyboard.down('Shift');await page.mouse.move(start!.x+5,start!.y+8);await page.mouse.down();
  await page.mouse.move(end!.x+20,end!.y+8,{steps:12});await page.mouse.up();await page.keyboard.up('Shift');
  await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
  await expect(page.locator('.cm-line.copy-selected').filter({hasText:/^$/})).toHaveCount(0);
  await page.keyboard.press('Control+c');
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('Other paragraph.');
  expect(await saved(page)).toBe(source);
});
