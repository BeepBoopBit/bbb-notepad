# Open and export text files

Import a file into a saved note or export a note as UTF-8. Importing does not connect future note edits to the original file.

## Open a file

1. Choose **File → Open…**, or press Ctrl/Cmd+O.
2. Select the file in the native picker.
3. Review the new note and any encoding notice.

Text is decoded as UTF-8, UTF-16, or Windows-1252 when recognized. Files larger than 16 MiB are rejected. A file detected as binary shows an unsupported-as-text notice and an ASCII preview, limited to its first 64 KiB.

The original file is unchanged. Cancelling the picker creates no imported note. The browser preview uses a browser file chooser instead of the native dialog.

## Save a note as a file

1. Choose **File → Save as…**, or press Ctrl/Cmd+S.
2. Enter a filename, such as `presentation.txt` or `presentation.md`.
3. Confirm the save and check the visible success message.

Choose any extension. Export writes the full source as UTF-8, including actual ENV values. It does not replace the note's internal autosave behavior or establish a live file link.

Press Ctrl/Cmd+Shift+S to save immediately inside bbb-notes without a file dialog. For imported or previously exported notes, this saves the internal copy only; the external file stays unchanged. Notes also continue to autosave.

Saving an ASCII preview writes that displayed preview, not the original binary file. In the browser preview, export uses a filename dialog and download.

If a file cannot be read or written, the note remains available and the app shows an error. Check file permissions and choose another destination. Exact decoding and preview rules are owned by [file decoding](../../src-tauri/src/files.rs) and the [browser adapter](../../src/files/files.ts).
