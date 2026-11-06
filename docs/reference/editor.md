# Editor reference

Look up syntax, defaults, and limits here. For steps, use the [user guides](../README.md).

## Pairs

A **pair** is `!KEY: value` or a block value. Keys start with an ASCII letter or underscore and continue with ASCII letters, digits, underscores, or hyphens. Keys are case-insensitive.

A pair starts on its own line with zero to three leading spaces. A block opener has `{` as its value, and a closing `}` occupies its own line. Nested pairs are allowed. Pair-like text and braces inside fenced code are literal. Unfinished blocks remain editable as source.

```text
!PROJECT: bbb-notepad
!IDEA:{
An idea with a nested task.
!TASK:{
Check the example.
}
}
```

| Key | Presentation | Suggested insertion |
| --- | --- | --- |
| `ENV` | Compact row, eight bullets, reveal/hide and copy-value actions | Scalar |
| `IDEA` | Styled block callout | Block |
| `SCRIPT` | Styled presentation/script block | Block |
| Custom key | Generic pair style | Typed manually |

The three suggested keys appear when `!` or a matching prefix is typed at a line end outside fenced code. Enter inserts the colon and, for block suggestions, the braces. Typing `{` after a pair key also completes its closing brace.

Pair presentation is independent of the Markdown toggle. Editing a value keeps its style; **Edit** exposes the full syntax. ENV values are masked in pair presentation, tab labels, and search previews. Revealing, editing, source copying, and exporting can expose actual values. There is no encryption.

Owning sources: [pair parser and completion](../../src/notes/pairs.ts), [Rust parser and query](../../src-tauri/src/pairs.rs), and [display masking](../../src/notes/storage.ts).

## Markdown presentation

Rendering is off by default on a new installation. The saved preference is local to the device. Supported presentation includes ATX headings, emphasis, links, lists, task lists, blockquotes, tables, fenced code highlighting, and fenced Mermaid diagrams.

A standalone line of three or more hyphens is a separator. Setext underlined headings are disabled; use `#` headings. Markdown preview displays single newlines as line breaks. Task-list boxes are display-only in rendered preview; edit source to change them.

Math rendering, image attachments, and remote Markdown image fetching are not included. Rendered HTML is sanitized. Mermaid uses strict security and sanitized SVG.

The active Markdown block exposes source. Pair value editing retains the callout wrapper. Ordinary text starts in a textarea; the rich editor loads for Markdown, pairs, or pair suggestions. Once loaded, it stays active for that session. The initial textarea undo history cannot transfer across that first transition.

Owning sources: [Markdown parser](../../src/editor/pairs/pair-markdown.ts), [preview construction](../../src/editor/markdown/markdown-preview.ts), [rendering](../../src/editor/markdown/markdown-render.ts), and [editor](../../src/editor/MarkdownEditor.tsx).

## Newlines and folding

| Context | Enter | Shift+Enter |
| --- | --- | --- |
| Ordinary source | One newline | One newline |
| Styled IDEA or SCRIPT value | Exit the innermost block | Newline inside the value |
| Pair exposed through Edit | Ordinary source editing | Ordinary source editing |
| Between completed pair braces | Expand the block body | Ordinary newline |

The editor adds no hard-break spaces or automatic list continuation. A blank line separates Markdown paragraphs.

Headings fold through the next heading of the same or higher level. Pair disclosure arrows fold their values. Nested folds retain their own state. Folds and cursor/scroll positions survive tab switches within a session; cross-restart restoration is not implemented.

`/collapse` and `/expand` execute on a standalone line when confirmed with Enter. They operate on the current note and are removed from its source. Plain-text command handling enables Markdown presentation. Fenced code remains literal.

Owning sources: [plain newline changes](../../src/editor/plain-block-break.ts), [pair exits](../../src/notes/pairs.ts), [folding](../../src/editor/outline.ts), and [app command handling](../../src/app/App.tsx).

## Search

Ordinary search matches a literal substring of stored source. `pair:KEY` filters by key; `pair:KEY text` requires that text inside a matching value. Results include closed notes, sort by latest edit, and are limited to 100.

Desktop search uses SQLite `instr(lower(...))`, whose built-in case folding is ASCII-based. The browser preview uses JavaScript lowercase matching, so Unicode case behavior can differ. An FTS5 index exists but is not the current search query engine.

Owning sources: [desktop search](../../src-tauri/src/store.rs) and [browser storage](../../src/notes/storage.ts).

## Limits

| Item | Limit or default |
| --- | --- |
| Autosave delay | 200 ms after typing stops |
| Search delay | 120 ms before querying; pending writes flush first |
| Search results | 100 |
| File import | 16 MiB |
| Binary ASCII preview | First 64 KiB |
| Markdown preview block | Source fallback above 100,000 characters |
| Mermaid source | 50,000 characters |
| Mermaid edges | 500 |
| Successful diagram cache | 32 entries, keyed by theme and source |
| Editor zoom | 50–250%, initially 100%, changed in 10-point steps |
| Update check timeout | 30 seconds |
| Update download timeout | 120 seconds |

Rendering is virtualized; languages and diagrams load on demand. These bounds do not establish a startup or large-collection performance benchmark.

Owning sources: [app state](../../src/app/App.tsx), [file decoding](../../src-tauri/src/files.rs), [renderer](../../src/editor/markdown/markdown-render.ts), [preferences](../../src/settings/preferences.ts), [update service](../../src/updates/updates.ts), and [update dialog](../../src/updates/UpdateDialog.tsx).
