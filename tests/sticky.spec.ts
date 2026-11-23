import { expect, test } from '@playwright/test';

test('sticky restores its own tabs, searches shared notes and saves before handing off or closing', async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (event: unknown) => Promise<void>>();
    let nextId = 0;
    let closeHandler = 0;
    const calls: string[][] = [];
    const draft = { id: 'sticky-draft', content: 'Prior draft', updated: 1 };
    const editorNote = { id: 'editor-note', content: 'Project plan', updated: 2 };
    const bridge = window as unknown as Record<string, unknown>;
    bridge.isTauri = true;
    bridge.stickyCalls = calls;
    bridge.requestStickyClose = () => callbacks.get(closeHandler)?.({ id: 1 });
    bridge.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'sticky' } },
      transformCallback(handler: (event: unknown) => Promise<void>) {
        callbacks.set(++nextId, handler);
        return nextId;
      },
      async invoke(command: string, args: {
        event?: string; handler?: number; sticky?: boolean; noteId?: string;
        note?: { content: string; updated: number }; expected?: number; tabs?: string[];
      }) {
        if (command === 'plugin:event|listen') {
          if (args.event === 'tauri://close-requested') closeHandler = args.handler!;
          return args.handler;
        }
        if (command === 'load_session' && args.sticky) return { notes: [draft], tabs: [draft.id], active: draft.id };
        if (command === 'search_notes') return [editorNote];
        if (command === 'save_session') calls.push(['session', String(args.sticky), ...args.tabs!]);
        if (command === 'open_bnote_window') calls.push(['open', String(args.sticky), args.noteId!]);
        if (command === 'save_note') {
          calls.push(['save', args.note!.content, String(args.expected)]);
          return args.note!.updated;
        }
        if (command === 'plugin:window|destroy') calls.push(['destroy']);
      },
    };
  });
  await page.goto('/');
  const sticky = page.getByRole('textbox', { name: 'Note content' });
  await expect(sticky).toHaveValue('Prior draft');
  await expect(sticky).toBeFocused();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search text' }).fill('Project');
  await page.getByRole('button', { name: /Project plan/ }).click();
  await expect(sticky).toHaveValue('Project plan');
  await expect(page.locator('.tab')).toHaveCount(2);
  await sticky.fill('Plan from sticky');
  await page.getByRole('button', { name: 'Open in Editor' }).click();
  const calls = await page.evaluate(async () => {
    const bridge = window as unknown as { requestStickyClose(): Promise<void>; stickyCalls: string[][] };
    await bridge.requestStickyClose();
    return bridge.stickyCalls;
  });
  expect(calls).toContainEqual(['session', 'true', 'sticky-draft', 'editor-note']);
  expect(calls.filter(call => call[0] !== 'session')).toEqual([
    ['save', 'Plan from sticky', '2'], ['open', 'false', 'editor-note'], ['destroy'],
  ]);
});
