import {test,expect,type Page} from '@playwright/test';
async function settings(page:Page){await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('menuitem')).toHaveCount(2);await page.getByRole('menuitem',{name:'Normal settings'}).click();}
async function saved(page:Page){await expect(page.getByText('All changes saved')).toBeVisible();return page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes);}
async function upload(page:Page,name:string,buffer:Buffer){const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Open file',exact:true}).click();await (await chooser).setFiles({name,mimeType:'application/octet-stream',buffer});}
async function exportNote(page:Page,name:string){await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Save note as',exact:true}).click();await page.getByRole('textbox',{name:'Filename'}).fill(name);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save',exact:true}).click();const download=await pending;const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));return {name:download.suggestedFilename(),text:Buffer.concat(chunks).toString('utf8')};}

test('settings dropdown exposes normal settings and themes persist across reload without changing notes',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill('Theme test');await settings(page);
  await expect(page.getByRole('dialog',{name:'Normal settings'})).toBeVisible();
  await page.getByRole('button',{name:'Light',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('button',{name:'Close settings'}).click();
  await expect(page.getByRole('button',{name:'Settings',exact:true})).toBeFocused();
  await saved(page);await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.getByRole('textbox',{name:'Note content'})).toHaveValue('Theme test');
  await settings(page);await page.getByRole('button',{name:'Dark',exact:true}).click();await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

test('File is leftmost, Markdown and Settings are on the right, and Copy note is removed',async({page})=>{
  await page.goto('/');const tools=page.getByRole('toolbar',{name:'Note actions'});
  await expect(page.getByRole('button',{name:'Copy entire note'})).toHaveCount(0);
  await expect(page.locator('.titlebar').getByRole('button',{name:'Settings',exact:true})).toHaveCount(0);
  await expect(tools.getByRole('button')).toHaveCount(3);
  await expect(tools.getByRole('button').nth(0)).toHaveText('File');
  await expect(tools.getByRole('button').nth(1)).toHaveAttribute('aria-label','Render Markdown');
  await expect(tools.getByRole('button').nth(2)).toHaveAttribute('aria-label','Settings');
  await expect(tools.getByRole('button',{name:'Render Markdown'})).toHaveAttribute('aria-pressed','false');
  await expect(tools).toHaveText('File');
  await expect(page.getByText('SOURCE',{exact:true})).toHaveCount(0);
  await expect(page.getByText('No filename. No save button. Just capture.',{exact:true})).toHaveCount(0);
});

test('Ctrl+T and Ctrl+N create notes in both editor paths',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill('First');
  await page.keyboard.press('Control+t');await expect(page.locator('.tab')).toHaveCount(2);
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').pressSequentially('Second');
  await page.keyboard.press('Control+t');await expect(page.locator('.tab')).toHaveCount(3);
  await page.keyboard.press('Control+n');await expect(page.locator('.tab')).toHaveCount(4);
  const notes=await saved(page);expect(notes.some((note:{content:string})=>note.content==='First')).toBe(true);expect(notes.some((note:{content:string})=>note.content==='Second')).toBe(true);
});

test('open arbitrary extensions as text and export exact text with a custom extension',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill('Keep existing note');
  const source='!ENV: actual-secret\r\nUnicode 🍉\r\n';await upload(page,'config.custom',Buffer.from(source));
  await expect(page.locator('.tab-title').last()).toHaveText('config.custom');
  const notes=await saved(page);expect(notes.some((note:{content:string})=>note.content==='Keep existing note')).toBe(true);expect(notes.some((note:{content:string})=>note.content===source)).toBe(true);
  expect(await exportNote(page,'presentation.anything')).toEqual({name:'presentation.anything',text:source});
});

test('UTF-16 opens correctly and unsupported binary files show an ASCII preview',async({page})=>{
  await page.goto('/');await upload(page,'windows.txt',Buffer.concat([Buffer.from([255,254]),Buffer.from('Hello\r\nWorld','utf16le')]));
  await expect(page.getByRole('textbox',{name:'Note content'})).toHaveValue('Hello\nWorld');
  await upload(page,'image.bin',Buffer.from([0,1,80,78,71,10,255]));
  await expect(page.getByText(/File unsupported as text/)).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Note content'})).toHaveValue('··PNG\n·');
  expect(await exportNote(page,'preview.txt')).toEqual({name:'preview.txt',text:'··PNG\n·'});
});

test('Ctrl+scroll zooms both editors and persists; Ctrl+0 restores normal size',async({page})=>{
  await page.goto('/');const editor=page.getByRole('textbox',{name:'Note content'});await editor.fill('Zoom content');await editor.hover();
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
  await expect(page.getByRole('button',{name:'Reset editor zoom'})).toHaveText('110%');
  await expect.poll(()=>editor.evaluate(element=>getComputedStyle(element).fontSize)).toBe('15.4px');
  await saved(page);await page.reload();await expect(page.getByRole('button',{name:'Reset editor zoom'})).toHaveText('110%');
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').hover();
  await page.keyboard.down('Control');await page.mouse.wheel(0,120);await page.keyboard.up('Control');
  await expect(page.getByRole('button',{name:'Reset editor zoom'})).toHaveText('100%');
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');await page.keyboard.press('Control+0');
  await expect(page.getByRole('button',{name:'Reset editor zoom'})).toHaveText('100%');
  expect((await saved(page))[0].content).toBe('Zoom content');
});

test('light theme updates rich content and keeps selection and undo working',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill('# Heading\n\n!SCRIPT:{\nWelcome.\n}\n\nLast');
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+End');
  await settings(page);await page.getByRole('button',{name:'Light',exact:true}).click();await page.getByRole('button',{name:'Close settings'}).click();
  const color=await page.locator('.cm-content').evaluate(element=>getComputedStyle(element).color);expect(color).toBe('rgb(41, 41, 41)');
  await page.locator('.cm-content').press('Control+End');await page.keyboard.type(' changed');await page.keyboard.press('Control+z');
  expect((await saved(page))[0].content).toBe('# Heading\n\n!SCRIPT:{\nWelcome.\n}\n\nLast');
});

test('keyboard open and save use the file controls without editing the note',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').pressSequentially('Keep this');
  const pending=page.waitForEvent('filechooser');await page.keyboard.press('Control+o');await (await pending).setFiles({name:'opened.txt',mimeType:'text/plain',buffer:Buffer.from('Opened')});
  await expect(page.locator('.tab-title').last()).toHaveText('opened.txt');
  await expect(page.getByRole('button',{name:'File',exact:true})).toBeEnabled();
  await page.locator('.cm-content').press('Control+End');await page.keyboard.press('Control+s');
  await expect(page.getByRole('dialog',{name:'Save note as'})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  const notes=await saved(page);expect(notes.some((note:{content:string})=>note.content==='Keep this')).toBe(true);expect(notes.some((note:{content:string})=>note.content==='Opened')).toBe(true);
});

test('Escape still closes search and returns focus to the editor',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill('Search me');
  await page.keyboard.press('Control+k');await expect(page.getByRole('dialog',{name:'Search all notes'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Search all notes'})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Note content'})).toBeFocused();
});
test('changing theme rerenders diagrams with the matching palette',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill('```mermaid\nflowchart LR\nA --> B\n```\n\nLast');
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+End');
  const node=page.locator('.mermaid-diagram svg .node rect').first();await expect(node).toBeVisible({timeout:30_000});
  const dark=await node.evaluate(element=>getComputedStyle(element).fill);
  await settings(page);await page.getByRole('button',{name:'Light',exact:true}).click();await page.getByRole('button',{name:'Close settings'}).click();
  await expect(node).toBeVisible({timeout:30_000});await expect.poll(()=>node.evaluate(element=>getComputedStyle(element).fill)).not.toBe(dark);
});

test('File menu supports keyboard navigation, Escape, and creating a note',async({page})=>{
  await page.goto('/');const file=page.getByRole('button',{name:'File',exact:true});await file.click();
  await expect(file).toBeFocused();
  await expect(page.getByRole('menuitem',{name:/New note/})).not.toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:/New note/})).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'Open file',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'Save note as',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.getByRole('menu',{name:'File menu'})).toHaveCount(0);await expect(file).toBeFocused();
  await file.click();await page.getByRole('menuitem',{name:/New note/}).click();await expect(page.locator('.tab')).toHaveCount(2);
});
test('Ctrl+A then Ctrl+C copies the full source in both editors',async({page})=>{
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');
  const content='# Heading\n\nPrompt **formatting**\n!ENV: actual-value';
  await page.getByRole('textbox',{name:'Note content'}).fill(content);
  await page.keyboard.press('Control+a');await page.keyboard.press('Control+c');
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(content);
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+End');
  await page.keyboard.press('Control+a');await page.keyboard.press('Control+c');
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(content);
});

test('plain, Markdown, and rich source editors use the same content width',async({page})=>{
  await page.goto('/');const plain=page.getByRole('textbox',{name:'Note content'});await plain.fill('# Heading\n\nBody\n\nLast');
  const bounds=(element:Element)=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {left:rect.left+parseFloat(style.paddingLeft),right:rect.right-parseFloat(style.paddingRight)};};
  const original=await plain.evaluate(bounds);
  await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+End');
  const markdown=await page.locator('.cm-content').evaluate(bounds);expect(markdown.left).toBeCloseTo(original.left,0);expect(markdown.right).toBeCloseTo(original.right,0);
  await page.getByRole('button',{name:'Render Markdown'}).click();
  const source=await page.locator('.cm-content').evaluate(bounds);expect(source.left).toBeCloseTo(original.left,0);expect(source.right).toBeCloseTo(original.right,0);
});
