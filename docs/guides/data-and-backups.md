# Locate, back up, and restore notes

Use this guide to protect or restore desktop notes. Database backups contain plaintext note source and tab state, including actual ENV values.

## Find the application data

The desktop database is `notes.sqlite3` under Tauri's application data directory. Its identifier remains `dev.bbb.notes` to preserve data from the earlier bbb-notes name.

| Platform | Default directory |
| --- | --- |
| Windows | `%APPDATA%\dev.bbb.notes\` |
| macOS | `~/Library/Application Support/dev.bbb.notes/` |
| Linux | `$XDG_DATA_HOME/dev.bbb.notes/`, or `~/.local/share/dev.bbb.notes/` when unset |

Windows is the validated desktop target. Other-platform paths follow Tauri's platform directory resolver and still need native validation.

Themes, zoom, Markdown preference, and imported-file labels live in WebView localStorage rather than this database. A database restore does not restore those preferences. Browser preview notes live in browser localStorage and never share the desktop database.

## Understand what saving protects

The app queues note writes after 200 ms of inactivity and records open tabs and the active tab. Normal desktop closure waits for pending writes. If a save fails, it keeps the window open and offers retry.

This does not promise recovery of every keystroke after a process kill, power loss, or disk failure. The database uses SQLite WAL mode and full synchronization, but it cannot recover edits that were never written. Crash-recovery behavior needs further native testing.

ENV masking is presentation only. The database, exported source, and backups can contain the actual values. The app does not provide encryption or an encrypted vault.

## Make a manual backup on Windows

1. Wait for **All changes saved**.
2. Close every bbb-notepad window normally.
3. Confirm that `bbb-notepad.exe` is no longer running in Task Manager.
4. Copy the entire `%APPDATA%\dev.bbb.notes\` directory to a separate backup location.
5. Confirm that the copy contains `notes.sqlite3` and has nonzero size.

Copy the whole directory while the app is stopped, including any remaining SQLite sidecar files. Copying only the database while it is live can omit writes in its WAL file.

For individual notes, [Save note as](files.md#save-a-note-as-a-file) is a simpler text backup. Exporting does not preserve tab state.

## Find the pre-update backup

After downloading and verifying an update, the app flushes pending writes and creates a consistent SQLite backup in:

```text
<application-data>/backups/before-update-<version>-<timestamp>.sqlite3
```

Save or backup failure aborts installation. These backups are made before installation, not on every edit or launch. There is no automatic backup-retention policy in this beta.

## Restore a database backup on Windows

Restoring replaces the note database and its saved tab state. Changes made after the chosen backup will not appear in the restored database.

1. Close the app normally and confirm that its process has stopped.
2. Make a separate copy of the entire current application data directory first.
3. Choose the backup database you intend to restore.
4. Move the current `notes.sqlite3` and any `notes.sqlite3-wal` or `notes.sqlite3-shm` files to your separate recovery copy.
5. Copy the chosen backup into the application data directory as `notes.sqlite3`.
6. Reopen the app and check known note text and the expected tabs.

Do not mix an older database with sidecar files from a newer one. Keep the recovery copy until you have verified the result. If restoration fails, close the app and restore the complete pre-restore copy. A database from an incompatible future schema is not guaranteed to work in an older app.

Storage ownership is defined in [the SQLite store](../../src-tauri/src/store.rs) and [desktop startup and backup commands](../../src-tauri/src/lib.rs).
