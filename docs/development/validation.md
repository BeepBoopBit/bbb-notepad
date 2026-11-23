# Checks and limits

Native checks cover Arch Linux x64 on Hyprland 0.57.2 and earlier Windows x64 builds.
Browser tests cover the shared UI and use a mocked bridge for desktop interactions.

## Check coverage

| Check | Covers |
| --- | --- |
| Frontend and release tests | Parsing, copying, file handling, storage helpers, and release metadata |
| Rust core tests | SQLite notes, tabs, pair indexing, file decoding, and update backups |
| Browser tests | Capture, search, editing, selection, shortcuts, and dialogs; updates use a mocked desktop bridge |
| Frontend build | TypeScript and production assets |
| Documentation checks | Local links, anchors, and Markdown structure |
| Windows packaging | Native app, installer, and updater signature |

See the [development guide](README.md#run-focused-checks) for commands.

## Prior native upgrade validation

An isolated Windows test checked a signed upgrade between private test builds.
The app rejected a modified installer and installed the valid package.
Notes, tabs, and the theme survived the upgrade. The backup contained the saved
notes and tabs. These test builds were not public releases.

## Arch Linux window checks

On native Wayland, the sticky note opened floating and the editor tiled beside it.
Launching the sticky again focused its existing window. The sticky window and
editor store their tab sessions independently and search the same notes.

## Remaining limits

- The bnote rename and installer migration need a signed Windows upgrade test.
- macOS and other Linux desktops need native testing.
- Startup and large-note-collection performance have not been measured.
- Crash recovery and disk or save failures need more native testing.
- Hosted CI, release publication, and live update feeds remain unverified.
- The local beta has no update feed. Beta-to-beta update discovery is not implemented.

Include the app version, platform, commands, and results in test reports.
Keep private notes and credentials out of reports.
