# Troubleshoot the beta

Find the problem below. Keep credentials and private notes out of error reports.

## Changes are not saved

**Symptom:** the status shows **Not saved**, or a save error appears.

Keep the app open. Confirm that the application data directory is writable and the disk has free space, then choose **Retry save**. Verify that the status becomes **All changes saved**. If retry still fails, copy or export important text to a separate location before further diagnosis.

Normal window closure is blocked after a failed save. Force-closing the process can discard pending edits. See [data and backups](data-and-backups.md).

## Search does not find a note

Closing a tab does not delete its note. Press Ctrl/Cmd+K and try a short literal substring from the stored source. Remove a `pair:` filter if you are unsure which key owns the text.

Only the newest 100 matches are returned. Narrow the phrase if the result set is large. Desktop case folding is ASCII-based; try the original case for non-ASCII text. Confirm whether the text was captured in the desktop app or the browser preview: their stores are separate.

## Markdown looks literal or a diagram does not render

Check the **Render Markdown** toggle. Pairs remain styled even when that toggle is off.

The active block can expose source while you edit. Click elsewhere to inspect its presentation. For Mermaid, use a fenced block labeled `mermaid` and check its syntax. Oversized blocks and invalid diagrams retain a source or error fallback; see [limits](../reference/editor.md#limits).

Typing can continue while the rich editor loads. The first transition from a textarea cannot preserve its earlier undo history.

## Copying does not work

Keep the collection selected and retry its copy control. The app uses a clipboard API where available and a browser-copy fallback for HTTP previews or WebViews. A success or failure message should appear.

Normal Ctrl/Cmd+A and Ctrl/Cmd+C copy source, including actual ENV values. This differs from masked collection copies. See [copy prompts](copy-prompts.md).

## A file is unsupported

Files larger than 16 MiB are rejected. Binary-looking files display an ASCII preview rather than their original bytes. Malformed text can also show an unsupported notice.

Choose a text file in a recognized encoding. Exporting a preview saves that preview; it does not recover the original binary. See [file import and export](files.md).

## Updates are not configured

Older `0.1.0-beta` and `0.2.0-beta` installers have no update feed configured. Install an update-enabled release manually once. The message does not mean the app checked a server and found no newer version.

A repository created later cannot automatically supply a feed address to an already-installed unconfigured build. Configure the intended release channel and rebuild before distributing an update-enabled installer. See [Releasing](../../RELEASING.md#update-channels).

## An update fails

Check the visible error and retry the manual check after resolving connectivity. A download or signature failure prevents installation. A save or backup failure keeps notes editable and also aborts installation.

Do not bypass signature verification or replace the signing key to accept a failed package. Keep the installed app and use a package signed by its expected key. For release configuration, see [signing](../../RELEASING.md#protect-the-signing-key).

## Native development does not start

A browser preview does not require the full native GUI toolchain. A desktop build does. Follow [development prerequisites](../development/README.md#prepare-the-checkout) for the target platform and inspect the first native dependency error.

Port 1420 must be available for development. If another preview is running, stop it or use it deliberately; do not confuse it with the desktop app.

## Prepare a useful report

Record the version, operating system, exact action, expected result, observed result, and a minimal synthetic example. State whether it happened in the desktop app or browser preview. Include relevant errors after removing private values.

Use the project issue tracker when available. Do not attach private notes or databases.
