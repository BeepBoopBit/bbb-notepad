# Develop bbb-notepad

Build and test from the project root. Windows x64 is the tested desktop target.

## Prepare the checkout

Install Node.js 24 with npm and a stable Rust toolchain. Native builds also require the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/): MSVC C++ build tools and WebView2 on Windows, the native GTK/WebKit toolchain on Linux, or Xcode tools on macOS.

Python 3.11 or newer is required for documentation checks. `npm run docs:check` expects it to be available as `python`; use `python3` or `py -3` directly if that is your system's executable name.

From the repository root:

```sh
npm ci
```

Use the lockfile rather than changing dependency versions as part of an unrelated task. Keep the installed identifier `dev.bbb.notes` to preserve existing data.

## Run the app

For a browser preview:

```sh
npm run dev
```

Open `http://localhost:1420`. Vite binds to available interfaces for this development command. Preview notes belong to that browser origin's localStorage and are separate from desktop notes.

For desktop development:

```sh
npm run tauri -- dev
```

A desktop window opens after Vite and the native process start. Close it normally to flush pending edits. Stop any remaining development process with Ctrl+C. If native dependencies fail, follow [troubleshooting](../guides/troubleshooting.md#native-development-does-not-start).

## Locate the owning component

| Change | Sources |
| --- | --- |
| Note lifecycle, menus, app shortcuts | [App](../../src/app/App.tsx), [file menu](../../src/files/FileMenu.tsx), [settings](../../src/settings/Settings.tsx) |
| Rich editing and pair behavior | [Editor](../../src/editor/MarkdownEditor.tsx), [pairs](../../src/notes/pairs.ts), [pair navigation](../../src/editor/pairs/pair-navigation.ts) |
| Markdown and Mermaid | [Parser](../../src/editor/pairs/pair-markdown.ts), [rendering](../../src/editor/markdown/markdown-render.ts) |
| Prompt collection | [Copy controller](../../src/editor/copy/copy-controller.ts), [collection model](../../src/editor/copy/copy-model.ts) |
| Desktop notes and search | [Rust store](../../src-tauri/src/store.rs), [commands](../../src-tauri/src/lib.rs) |
| Browser preview storage | [Storage adapter](../../src/notes/storage.ts) |
| File decoding and export | [Rust files](../../src-tauri/src/files.rs), [browser files](../../src/files/files.ts) |
| Updates and packaging | [Update dialog](../../src/updates/UpdateDialog.tsx), [release helpers](../../scripts/release-utils.mjs), [Releasing](../../RELEASING.md) |
| Icons | [Artwork instructions](../../assets/README.md) |

The [architecture](../architecture/README.md) explains the boundaries. A change to persistence, pair syntax, or clipboard contents should keep its TypeScript and Rust behavior aligned where both implement the contract.

## Run focused checks

From the project root:

```sh
npm test
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib
npm run build
```

Expected result: tests pass and the frontend build creates `dist/`. The Rust core tests do not need the desktop GUI libraries. They do not build the native WebView shell.

For browser interaction tests:

```sh
npx playwright install chromium
npm run test:e2e
```

Expected result: the Playwright suite passes. Its ordinary tests use browser storage; update tests mock the desktop bridge. They do not establish native save-failure or installer behavior. If an unrelated preview occupies port 1420, stop it before the run. Use `CI=1` in a POSIX shell to prevent reuse of an existing server when needed.

Generated frontend output, test reports, and native targets are ignored. Checks should use synthetic notes and fixtures, rather than personal credentials or databases.

## Check documentation

```sh
npm run docs:check
python tests/tooling/checks/docs_test.py
```

Both commands should exit zero. They check documentation structure and local links. They do not run examples.

For a changed diagram, use Mermaid CLI 12 to render light and dark previews:

```sh
python scripts/checks/check-docs.py --root . --render-mermaid build/docs-diagrams --mmdc /path/to/mmdc
```

Replace `/path/to/mmdc` with your Mermaid CLI executable. The output directory must not already exist. Inspect labels, arrows, clipping, and contrast in both themes; remove the generated `build/docs-diagrams` folder when finished. Hosting-renderer compatibility still needs review when documentation is published.

## Automatic checks

The [CI workflow](../../.github/workflows/ci.yml) runs on pull requests targeting `main` and pushes to `main`. It checks versions and documentation, runs unit/Rust/browser tests, and compiles the frontend. It creates no installers and uses no signing secrets.

Tag pushes reuse those checks before the Windows release job. Other branches and PR targets do not trigger CI. See [release triggers](../../RELEASING.md#ci-and-release-triggers) for the complete event policy.

## Build a distributable

Use [Releasing](../../RELEASING.md) for signed installers. A plain native build with updater artifacts also needs the signing key. Do not regenerate or replace the existing key merely to make a build pass.

See [checks and limits](validation.md) for test coverage. Contributions follow [the project guide](../../CONTRIBUTING.md).
