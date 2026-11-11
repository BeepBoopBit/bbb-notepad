# Keyboard and mouse shortcuts

Ctrl/Cmd means Ctrl on Windows/Linux or Command on macOS. macOS shortcuts need native testing. Some shortcuts behave differently in the browser preview.

## Notes and files

| Input | Action |
| --- | --- |
| Ctrl/Cmd+T or Ctrl/Cmd+N | New note |
| Ctrl/Cmd+W | Close current tab, retaining its note in search |
| Ctrl+Tab | Next open tab |
| Ctrl+Shift+Tab | Previous open tab |
| Ctrl/Cmd+K | Toggle global note search |
| Up/Down, then Enter in search | Select and open a result |
| Ctrl/Cmd+O | Open a file as text |
| Ctrl/Cmd+S | Save note as a file |
| Ctrl/Cmd+Shift+S | Save notes inside bbb-notes immediately, without writing an external file |
| Ctrl/Cmd+scroll | Change editor zoom |
| Ctrl/Cmd+0 | Reset zoom to 100% |

## Editing and collection

| Input | Action |
| --- | --- |
| Normal drag | Precise text selection |
| Shift+click or Shift+drag | Collect rendered sentences/blocks |
| Press Shift during or after a normal selection | Convert it into collection |
| Ctrl/Cmd+C | Copy source selection or collected Markdown |
| Ctrl/Cmd+A, then Ctrl/Cmd+C | Copy full source, including actual ENV values |
| Type, paste, cut, Backspace, or Delete with a collection | Replace or remove the collection |
| Esc in collection | Clear collection |
| Tab | Reach available copy/menu controls |
| `!`, then arrows and Enter | Insert a supported pair suggestion |
| `/`, then arrows and Enter | Run collapse/expand in the rich editor |

Arrow keys enter expanded pair values and skip collapsed pairs. Raw pair syntax exposed through **Edit** keeps ordinary source navigation. Enter/Shift+Enter behavior depends on the editing context; see [newlines](editor.md#newlines-and-folding).

Menu arrow keys, Home/End, and Escape navigate or dismiss menus. Escape also dismisses suggestions, search, or nonbusy dialogs according to focus. During final update installation, editing and app shortcuts are blocked until installation finishes or fails.

Owning sources: [app shortcuts](../../src/app/App.tsx), [copy controller](../../src/editor/copy/copy-controller.ts), [pair navigation](../../src/editor/pairs/pair-navigation.ts), [file menu](../../src/files/FileMenu.tsx), and [settings](../../src/settings/Settings.tsx).
