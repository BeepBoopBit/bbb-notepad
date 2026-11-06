import {test,expect,type Page} from '@playwright/test';
async function saved(page:Page){await expect(page.getByText('All changes saved')).toBeVisible();return page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);}
async function setup(page:Page,key:string,markdown:boolean){
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).pressSequentially('!');await expect(page.getByRole('menu',{name:'Supported pairs'})).toBeVisible();
  await page.keyboard.type(key);await page.keyboard.press('Enter');if(markdown)await page.getByRole('button',{name:'Render Markdown'}).click();
}
for(const markdown of [false,true])for(const key of ['IDEA','SCRIPT'])test(`${key} Enter exits and Shift+Enter stays inside with Markdown ${markdown ? 'on' : 'off'}`,async({page})=>{
  await setup(page,key,markdown);await page.keyboard.type('Inside.');await page.keyboard.press('Shift+Enter');await page.keyboard.type('Still inside.');
  expect(await saved(page)).toBe(`!${key}:{\nInside.\nStill inside.\n}`);
  await page.keyboard.press('Enter');await page.keyboard.type('Outside.');
  expect(await saved(page)).toBe(`!${key}:{\nInside.\nStill inside.\n}\nOutside.`);
  await expect(page.locator(`.pair-${key.toLowerCase()}`)).toBeVisible();
  await expect(page.locator(`.pair-${key.toLowerCase()} .pair-value`)).not.toContainText('Outside.');
});
test('leaving from the middle preserves the rest of the callout and following text',async({page})=>{
  await page.goto('/');const source='!IDEA:{\nFirst thought. Second thought.\n}\nFollowing text.';
  await page.getByRole('textbox',{name:'Note content'}).fill(source);await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.cm-content').press('Control+Home');await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');await page.keyboard.type('Outside.');
  expect(await saved(page)).toBe('!IDEA:{\nFirst thought. Second thought.\n}\nOutside.\nFollowing text.');
});
test('Enter exits the inner callout while staying inside the parent',async({page})=>{
  await page.goto('/');const source='!IDEA:{\n!SCRIPT:{\nInner.\n}\n\nParent continues.\n}\n\nLast';
  await page.getByRole('textbox',{name:'Note content'}).fill(source);await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.cm-content').press('Control+Home');await page.keyboard.press('End');
  await page.keyboard.press('Enter');await page.keyboard.type('In parent.');
  expect(await saved(page)).toBe('!IDEA:{\n!SCRIPT:{\nInner.\n}\nIn parent.\nParent continues.\n}\n\nLast');
});
test('raw pair editing retains ordinary Enter and Windows callout exits retain CRLF',async({page})=>{
  const source='!SCRIPT:{\r\nInside.\r\n}\r\n\r\nLast';
  await page.addInitScript(content=>localStorage.setItem('bbb-notes-preview-v1',JSON.stringify({notes:[{id:'win',content,updated:1}],tabs:['win'],active:'win'})),source);
  await page.goto('/');await expect(page.locator('.cm-content')).toBeVisible();await page.locator('.cm-content').press('Control+End');
  await page.getByRole('button',{name:'Edit SCRIPT pair',exact:true}).click();await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('Raw line.');
  expect(await saved(page)).toBe(source.replace('Inside.','Inside.\r\nRaw line.'));
  await page.locator('.cm-content').press('Control+End');await page.locator('.pair-script .pair-plain-text').click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('Outside.');
  expect(await saved(page)).toBe(source.replace('Inside.','Inside.\r\nRaw line.').replace('}\r\n\r\nLast','}\r\nOutside.\r\nLast'));
});

test('Enter also exits when a callout is created before the richer editor finishes loading',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).pressSequentially('!idea');await page.keyboard.press('Enter');await page.keyboard.type('Inside.');await page.keyboard.press('Enter');await page.keyboard.type('Outside.');
  expect(await saved(page)).toBe('!IDEA:{\nInside.\n}\nOutside.');
});
