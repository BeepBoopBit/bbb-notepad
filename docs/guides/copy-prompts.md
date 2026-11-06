# Collect text for a prompt

Collect complete sentences or blocks without positioning a normal text selection at every boundary. Markdown is the default clipboard format for a collection.

## Collect sentences and blocks

- Shift+click a rendered sentence to collect it. Shift+click more units to add them, or click a collected unit again with Shift to remove it.
- Shift+drag to collect a continuous range. Drag near the editor edge to scroll.
- Use a block's **Select whole block** grip to collect the complete block.

Starting a normal drag and pressing Shift converts its existing selection into block collection, including when the selection starts on an empty line. Pressing Shift also converts an existing normal selection without requiring another mouse move.

Releasing Shift does not convert an active collection drag back to ordinary selection. Clicking elsewhere without Shift clears the collection; copy-toolbar controls keep it available for copying. Blank lines can anchor a range without becoming collected units.

Collection is temporary and clears after replacement or when switching notes. Selecting alone does not change stored text.

## Copy the collection

Use **Copy Markdown**, **Plain text**, or Ctrl/Cmd+C. Collected units copy in document order, even if you selected them in a different order. ENV values stay masked in collection copies.

Hover a block for its copy action. **Copy code** copies a code block's code. Whole-block copies retain original Markdown; individual rendered sentence copies can normalize Markdown syntax while preserving formatting. Copying an IDEA body omits its pair wrapper.

For exact source, use a normal text selection, or Ctrl/Cmd+A followed by Ctrl/Cmd+C. Source copies include actual ENV values. An ENV row's **Copy value** action also copies its actual value without revealing it on screen.

## Continue editing

Typing, pasting, cutting, Backspace, and Delete operate on a collection. Replacement occurs at its first selected position and retains unselected content. The change is undoable. Markdown around an affected paragraph can be normalized to keep it balanced.

Use **Clear** or Esc to clear the collection. Use Tab to reach the copy controls. If copying fails, keep the collection and retry; see [clipboard troubleshooting](troubleshooting.md#copying-does-not-work).
