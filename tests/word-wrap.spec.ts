import {test,expect} from '@playwright/test';

test('View word wrap applies to both editors and persists',async({page})=>{
  await page.goto('/');
  const text='A long sentence to wrap in the editor. '.repeat(100);
  const editor=page.getByRole('textbox',{name:'Note content'});
  await editor.fill(text);
  const toggle=async()=>{
    await page.getByRole('button',{name:'View',exact:true}).click();
    await page.getByRole('menuitemcheckbox',{name:'Word Wrap'}).click();
  };
  await expect(editor).toHaveCSS('white-space','pre-wrap');
  await toggle();
  await expect(editor).toHaveCSS('white-space','pre');
  await expect(editor).toHaveValue(text);
  await page.reload();
  await expect(editor).toHaveCSS('white-space','pre');
  await page.getByRole('button',{name:'View',exact:true}).click();
  await expect(page.getByRole('menuitemcheckbox',{name:'Word Wrap'})).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'View',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Render Markdown'}).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.cm-content')).not.toHaveClass(/cm-lineWrapping/);
  await toggle();
  await expect(page.locator('.cm-content')).toHaveClass(/cm-lineWrapping/);
  await expect(editor).toHaveText(text);
  await toggle();
  await expect(page.locator('.cm-content')).not.toHaveClass(/cm-lineWrapping/);
});
