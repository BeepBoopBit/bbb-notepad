# Changelog

User-visible changes to bbb-notepad. Local builds and published releases are distinguished explicitly.

## 0.2.1-beta — Unreleased

- Configured a permanent beta update feed for new installers, with publication automation that preserves signed versioned downloads and prevents older releases from replacing newer metadata.
- Existing 0.1.0-beta and 0.2.0-beta installations need one manual installer upgrade to enable future in-app updates.

## 0.2.0-beta — 2026-11-11

- Added a View menu with a persistent Word Wrap preference for plain and Markdown editors.
- Improved rendered checklist appearance and Shift-click collection of whole checklist rows.
- Added optional pair names, such as `!ENV(API token):` and `!SCRIPT(Introduction):`, shown in place of the type label while preserving masking, styling, and type-based search.
- Added automatic list continuation on Enter for numbered lists and `-`, `*`, and `+` bullets, with following numbers updated when inserting an item. Enter on an empty item moves up one nesting level at a time, then exits the list; Shift+Enter inserts a plain newline.
- Added Ctrl/Cmd+Shift+S to save immediately inside bbb-notes without creating or overwriting an external file. Ctrl/Cmd+S keeps the existing file-save dialog.
- Improved small-icon downsampling to reduce jagged taskbar edges while preserving the original artwork.
- CI checks now run on PRs targeting `main` and pushes to `main`.
- Signed Windows installer builds and draft releases run only on matching version-tag pushes, after all checks pass.

## 0.1.0-beta — 2026-11-07

First accepted local quick-capture beta. No public release repository is configured yet.

### Added

- Tabs, automatic saving, restoration of open notes, and search across open and closed notes.
- Literal and pair-value search, with masked ENV previews.
- Optional live Markdown, highlighted fenced code, Mermaid diagrams, and horizontal separators.
- Always-visible ENV, IDEA, and SCRIPT pairs, custom keys, nested blocks, completion, and folding.
- Styled pair-value editing, collapse/expand commands, and keyboard navigation through pairs.
- Sentence and block collection for prompt copying, including Markdown copies and edit replacement.
- File import/export, light and dark themes, editor zoom, and keyboard shortcuts.
- A per-user Windows installer and manual signed-update flow with save and backup protection.
- Reader-oriented guides, reference, development instructions, and documentation checks.

### Changed

- Renamed the app from bbb-notes to bbb-notepad while retaining the installed data identity.
- Integrated the original supplied cat-and-notepad artwork with a transparent exterior and cropped padding.
- Aligned package, native, and installer versions at `0.1.0-beta` and marked prerelease workflow builds accordingly.

### Known limits

- Windows x64 is the validated native installer target; macOS and Linux need native qualification.
- The current local beta has no configured update feed, and beta-to-beta update discovery is not implemented.
- No notes CLI, other modes, global capture shortcut, or cross-restart cursor restoration.
- Performance benchmarks and further native crash/save-failure testing remain outstanding.

See [Validation](docs/development/validation.md) for details.
