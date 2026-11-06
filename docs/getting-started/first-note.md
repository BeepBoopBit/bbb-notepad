# Save and reopen your first note

Create a note, find it after closing its tab, and confirm that it survives a normal app restart. This tutorial targets the Windows desktop beta.

## Before you start

Install the local Windows beta installer and open **bbb-notepad**. If you do not have an installer, follow [Releasing](../../RELEASING.md) to build one.

The browser preview uses separate storage.

## Capture an idea

1. Press Ctrl+T to create a note.
2. Type this example:

   ```text
   Watermelon presentation
   Explain how automatic saving helps quick capture.
   ```

3. Wait for **All changes saved** in the status row.
4. Press Ctrl+W to close the tab.
5. Press Ctrl+K and search for `Watermelon presentation`.
6. Select the matching result and press Enter.

The original text reopens. Closing a tab retains the note in search.

## Verify restoration

1. Wait for **All changes saved**.
2. Close the app with its window close button.
3. Open **bbb-notepad** again.

The open note and its text should return. If the app reports a save error, keep it open and use [save-error recovery](../guides/troubleshooting.md#changes-are-not-saved).

Close the example tab when finished. This leaves the saved example searchable; the beta has no permanent-delete command. Continue with [Markdown and pairs](../guides/markdown-and-pairs.md) or [copying prompts](../guides/copy-prompts.md).
