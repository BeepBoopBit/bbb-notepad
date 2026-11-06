import {test,expect,type Page} from '@playwright/test';
const fixture='Before\n!IDEA:{\nFirst idea.\nSecond idea.\n}\n!ENV: secret-value\n!SCRIPT:{\nFirst script.\nSecond script.\n}\nAfter';
async function setup(page:Page,markdown:boolean,source=fixture){await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill(source);await expect(page.locator('.cm-content')).toBeVisible();if(markdown)await page.getByRole('button',{name:'Render Markdown'}).click();await page.locator('.cm-content').press('Control+Home');}
async function line(page:Page,text:string){
  await expect.poll(()=>page.evaluate(()=>{const node=getSelection()?.focusNode;const element=node?.nodeType===Node.ELEMENT_NODE ? node as Element : node?.parentElement;return element?.closest('.cm-line')?.textContent || '';})).toContain(text);
  await expect(page.locator('.cm-cursor')).toBeVisible();
}
for(const markdown of [false,true])test(`Up and Down enter values and skip pair syntax with Markdown ${markdown ? 'on' : 'off'}`,async({page})=>{
  await setup(page,markdown);await line(page,'Before');
  for(const text of ['First idea.','Second idea.','secret-value','First script.','Second script.','After']){await page.keyboard.press('ArrowDown');await line(page,text);}
  for(const text of ['Second script.','First script.','secret-value','Second idea.','First idea.','Before']){await page.keyboard.press('ArrowUp');await line(page,text);}
});
for(const markdown of [false,true])test(`collapsed pairs are skipped in both directions with Markdown ${markdown ? 'on' : 'off'}`,async({page})=>{
  await setup(page,markdown);await page.locator('.cm-content').press('Control+End');
  for(const key of ['IDEA','ENV','SCRIPT'])await page.getByRole('button',{name:`Collapse ${key} pair`,exact:true}).click();
  await page.locator('.cm-content').press('Control+Home');await page.keyboard.press('ArrowDown');await line(page,'After');await page.keyboard.press('ArrowUp');await line(page,'Before');
  for(const key of ['IDEA','ENV','SCRIPT'])await expect(page.getByRole('button',{name:`Expand ${key} pair`,exact:true})).toBeVisible();
});
test('nested pair headers and braces do not consume arrow-key stops',async({page})=>{
  await setup(page,true,'Before\n!IDEA:{\n!SCRIPT:{\nInner first.\nInner last.\n}\nOuter last.\n}\nAfter');
  for(const text of ['Inner first.','Inner last.','Outer last.','After']){await page.keyboard.press('ArrowDown');await line(page,text);}
  for(const text of ['Outer last.','Inner last.','Inner first.','Before']){await page.keyboard.press('ArrowUp');await line(page,text);}
});
test('horizontal arrows cross pair boundaries without stopping in hidden syntax',async({page})=>{
  await setup(page,true,'Before\n!SCRIPT:{\nInside.\n}\nAfter');await page.keyboard.press('End');await page.keyboard.press('ArrowRight');await line(page,'Inside.');await page.keyboard.press('ArrowLeft');await line(page,'Before');
  await page.keyboard.press('ArrowRight');await page.keyboard.press('End');await page.keyboard.press('ArrowRight');await line(page,'After');await page.keyboard.press('ArrowLeft');await line(page,'Inside.');
});
test('Home, End and document boundaries land on editable values',async({page})=>{
  await setup(page,false,'!ENV: secret-value');await line(page,'secret-value');await page.keyboard.press('Home');await line(page,'secret-value');await page.keyboard.type('X');
  await expect(page.getByText('All changes saved')).toBeVisible();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content)).toBe('!ENV: Xsecret-value');
  await page.keyboard.press('Control+End');await line(page,'Xsecret-value');
});
test('an expanded pair at EOF keeps the cursor visible on its final editable line',async({page})=>{
  await setup(page,false,'Before\n!SCRIPT:{\nOnly.\n}');await page.keyboard.press('ArrowDown');await line(page,'Only.');await page.keyboard.press('ArrowDown');await line(page,'Only.');await page.keyboard.press('ArrowDown');await line(page,'Only.');await page.keyboard.press('ArrowUp');await line(page,'Before');
});
test('wrapped lines keep ordinary visual vertical movement inside a pair',async({page})=>{
  await page.setViewportSize({width:560,height:500});await setup(page,true,'Before\n!SCRIPT:{\n'+('Wrapped words. '.repeat(70))+'\n}\nAfter');await page.keyboard.press('ArrowDown');await line(page,'Wrapped words.');
  await page.keyboard.press('ArrowDown');await line(page,'Wrapped words.');await page.keyboard.press('ArrowUp');await line(page,'Wrapped words.');
});

test('collapsed EOF pairs stay skipped without hiding the cursor or changing the note',async({page})=>{
  const source='Before\n!SCRIPT:{\nHidden.\n}';await setup(page,false,source);await page.getByRole('button',{name:'Collapse SCRIPT pair',exact:true}).click();await page.locator('.cm-content').press('Control+Home');
  await page.keyboard.press('ArrowDown');await line(page,'Before');
  await expect(page.getByText('All changes saved')).toBeVisible();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content)).toBe(source);
});
test('a collapsed parent skips all nested pairs and raw Edit keeps syntax navigable',async({page})=>{
  await setup(page,true,'Before\n!IDEA:{\n!SCRIPT:{\nHidden inner.\n}\n}\nAfter');await page.getByRole('button',{name:'Collapse IDEA pair',exact:true}).click();await page.locator('.cm-content').press('Control+Home');await page.keyboard.press('ArrowDown');await line(page,'After');
  await page.getByRole('button',{name:'Edit IDEA pair',exact:true}).click();await line(page,'!IDEA:{');await page.keyboard.press('ArrowDown');await line(page,'!SCRIPT:{');await page.keyboard.press('ArrowDown');await line(page,'Hidden inner.');
});
