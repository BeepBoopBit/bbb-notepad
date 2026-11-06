import { test, expect } from '@playwright/test';
test('capture, restore, close, search and reopen exact text', async ({page}) => {
  // Simulate HTTP environments where the secure-context UUID API is absent.
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
  });
  await page.goto('/');
  const editor = page.getByRole('textbox',{name:'Note content'});
  const content = '  CLOUDFLARE_API_TOKEN=100%_secret\n\n  preserve this  ';
  await editor.fill(content);
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.reload();
  await expect(editor).toHaveValue(content);
  await page.getByRole('button',{name:'New note',exact:true}).click();
  await editor.fill('An unrelated idea');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button',{name:'CLOUDFLARE_API_TOKEN=100%_secret',exact:true}).click();
  await page.getByRole('button',{name:'Close CLOUDFLARE_API_TOKEN=100%_secret',exact:true}).click();
  await expect(editor).toHaveValue('An unrelated idea');
  await page.getByRole('button',{name:/Search all notes/}).click();
  await page.getByRole('textbox',{name:'Search text'}).fill('100%_');
  const result = page.getByRole('button').filter({has:page.locator('strong', {hasText:'CLOUDFLARE_API_TOKEN'})});
  await expect(result).toBeVisible();
  await page.getByRole('textbox',{name:'Search text'}).press('Enter');
  await expect(editor).toHaveValue(content);
  await expect(editor).toBeFocused();
});
