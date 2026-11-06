# Checks and limits

Windows x64 is the tested desktop target. Browser tests cover the shared UI,
but do not verify native storage or installers.

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

## Remaining limits

- macOS and Linux builds, installers, and upgrades need native testing.
- Startup and large-note-collection performance have not been measured.
- Crash recovery and disk or save failures need more native testing.
- Hosted CI, release publication, and live update feeds remain unverified.
- The local beta has no update feed. Beta-to-beta update discovery is not implemented.

Include the app version, platform, commands, and results in test reports.
Keep private notes and credentials out of reports.
