import {test,expect,type Page} from '@playwright/test';
async function saved(page:Page){await expect(page.getByText('All changes saved')).toBeVisible();return page.evaluate(()=>JSON.parse(localStorage.getItem('bbb-notes-preview-v1')!).notes[0].content);}
async function normal(page:Page,source:string){await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill(source);await expect(page.locator('.cm-content')).toBeVisible();await page.locator('.cm-content').press('Control+End');await expect(page.getByRole('button',{name:'Render Markdown'})).toHaveAttribute('aria-pressed','false');}

test('typing ! offers the supported pairs and completing SCRIPT creates an editable block without enabling Markdown',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).pressSequentially('!');
  await expect(page.getByRole('menu',{name:'Supported pairs'})).toBeVisible();await expect(page.getByRole('menuitem')).toHaveCount(3);
  await page.keyboard.type('script');await expect(page.getByRole('menuitem')).toHaveCount(1);await page.keyboard.press('Enter');
  await expect(page.locator('.pair-shell-start.pair-body-script')).toBeVisible();await page.keyboard.type('Speak clearly.');
  expect(await saved(page)).toBe('!SCRIPT:{\nSpeak clearly.\n}');
  await expect(page.getByRole('button',{name:'Render Markdown'})).toHaveAttribute('aria-pressed','false');
});
test('fast typing and Enter during the initial editor load preserve all text',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).pressSequentially('!idea');await page.keyboard.press('Enter');await page.keyboard.type('An idea.');
  expect(await saved(page)).toBe('!IDEA:{\nAn idea.\n}');
});
test('ENV completion adds a colon and values stay masked in normal mode after editing',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).pressSequentially('!');await expect(page.getByRole('menu',{name:'Supported pairs'})).toBeVisible();
  await page.keyboard.press('Enter');await page.keyboard.type('secret-value');await page.keyboard.press('Enter');await page.keyboard.type('Last');
  expect(await saved(page)).toBe('!ENV: secret-value\nLast');await expect(page.locator('.pair-env .pair-value')).toHaveText('••••••••');
  await page.getByRole('button',{name:'Reveal ENV value'}).click();await expect(page.locator('.pair-env .pair-value')).toHaveText('secret-value');
});
test('pairs render in normal mode while Markdown syntax only renders when enabled',async({page})=>{
  const source='# Heading\n\n!IDEA:{\n**Important**\nA second line.\n}\n\n!ENV: hidden\n\nLast';
  await normal(page,source);await expect(page.locator('.pair-idea')).toBeVisible();await expect(page.locator('.pair-env .pair-value')).toHaveText('••••••••');
  await expect(page.locator('.pair-idea .pair-value')).toContainText('**Important**');await expect(page.locator('.markdown-block h1')).toHaveCount(0);
  await page.getByRole('button',{name:'Render Markdown'}).click();await expect(page.locator('.markdown-block h1')).toHaveText('Heading');await expect(page.locator('.pair-idea .pair-value strong')).toHaveText('Important');await expect(page.locator('.pair-idea br')).toHaveCount(1);
  await page.getByRole('button',{name:'Render Markdown'}).click();await expect(page.locator('.pair-idea')).toBeVisible();await expect(page.locator('.pair-idea .pair-value')).toContainText('**Important**');await expect(page.locator('.pair-env .pair-value')).toHaveText('••••••••');expect(await saved(page)).toBe(source);
});
test('normal-mode pair values edit at the clicked line while retaining their styling',async({page})=>{
  const source='!SCRIPT:{\nFirst line.\n\nSecond line.\n}\n\nLast';await normal(page,source);
  const point=await page.locator('.pair-script .pair-plain-text').evaluate(element=>{const node=element.firstChild!;const start=(node.textContent || '').indexOf('Second')+2;const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+1);const rect=range.getBoundingClientRect();return {x:rect.left+1,y:rect.top+6};});
  await page.mouse.click(point.x,point.y);await expect(page.locator('.pair-shell-start.pair-body-script')).toBeVisible();await page.keyboard.press('End');await page.keyboard.type(' Revised.');
  expect(await saved(page)).toBe(source.replace('Second line.','Second line. Revised.'));
});
test('pair suggestions support arrow keys and Escape and stay literal in fenced code',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).pressSequentially('!');await expect(page.getByRole('menu',{name:'Supported pairs'})).toBeVisible();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');expect(await saved(page)).toBe('!IDEA:{\n\n}');
  await page.locator('.cm-content').press('Control+End');await page.keyboard.press('Enter');await page.keyboard.type('!');await expect(page.getByRole('menu',{name:'Supported pairs'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('menu',{name:'Supported pairs'})).toHaveCount(0);
  await page.reload();await page.locator('.cm-content').press('Control+a');await page.keyboard.type('```text\n!SCRIPT\n```');await page.locator('.cm-content').press('Control+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await expect(page.getByRole('menu',{name:'Supported pairs'})).toHaveCount(0);
});

test('saved ENV pairs are masked on reopen with Markdown rendering off',async({page})=>{
  await normal(page,'!ENV: never-show-on-load\n\nLast');await saved(page);await page.reload();
  await expect(page.locator('.pair-env .pair-value')).toHaveText('••••••••');
  await expect(page.locator('.cm-content')).not.toContainText('never-show-on-load');
  await expect(page.getByRole('button',{name:'Render Markdown'})).toHaveAttribute('aria-pressed','false');
});
test('normal-mode pair values allow precise native selection replacement',async({page})=>{
  await normal(page,'!SCRIPT:{\nFirst line. Second line.\n}\n\nLast');
  const range=await page.locator('.pair-script .pair-plain-text').evaluate(element=>{
    const text=element.firstChild!,from=document.createRange(),to=document.createRange();from.setStart(text,0);from.setEnd(text,1);to.setStart(text,5);to.setEnd(text,6);
    const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();return {x:a.left,y:a.top+6,to:b.left};
  });
  await page.mouse.move(range.x,range.y);await page.mouse.down();await page.mouse.move(range.to,range.y,{steps:8});await page.mouse.up();await page.keyboard.type('New');
  const content=await saved(page);expect(content).toContain('!SCRIPT:{\nNew');expect(content).toContain('Second line.');expect(content).toContain('\n}\n\nLast');
});
