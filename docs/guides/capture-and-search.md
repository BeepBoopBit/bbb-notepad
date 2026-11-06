# Capture and find notes

Use quick capture to keep text without choosing a filename, then find it across open and closed notes.

## Create and close tabs

Press Ctrl/Cmd+T or Ctrl/Cmd+N, or click **New note** in the tab bar. The first nonempty line becomes the tab label. Tabs and window controls share the top row.

Changes save after 200 ms of inactivity. Wait for **All changes saved** before testing restoration. Normal desktop closure waits for pending writes. A failed save keeps the app open with a retry action.

Press Ctrl/Cmd+W to close a tab. The note stays stored and searchable. Closing the last tab creates a new blank note. Use Ctrl+Tab and Ctrl+Shift+Tab to switch open tabs.

Drag empty space in the top row to move the desktop window. Double-click that area to maximize or restore it.

## Search all notes

1. Press Ctrl/Cmd+K or click **Search all notes**.
2. Enter a phrase from the note.
3. Use Up/Down to select a result, then press Enter.

Search returns up to 100 matches, newest edits first. It includes closed notes and searches stored source text. Opening a result reveals its match and expands hidden ancestors where needed.

Ordinary search uses literal text rather than regular expressions or a word-query language. Desktop case folding is ASCII-based; non-ASCII case matching can differ from the browser preview.

## Search a pair value

Use a key filter when a phrase belongs to a particular kind of note:

| Query | Finds |
| --- | --- |
| `pair:IDEA` | Notes containing an IDEA pair |
| `pair:SCRIPT introduction` | SCRIPT values containing `introduction` |
| `pair:ENV token` | ENV values containing `token` |
| `pair:PROJECT bbb-notepad` | Matching values of a custom PROJECT pair |

Keys are case-insensitive. The optional text must occur inside that pair's value. ENV values are masked in result previews, although search still checks their actual text.

If an expected note is missing, check [search troubleshooting](troubleshooting.md#search-does-not-find-a-note). Exact syntax is in the [editor reference](../reference/editor.md#search).
