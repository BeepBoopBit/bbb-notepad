# Build and release bbb-notepad

Use this procedure to produce a signed Windows installer and prepare a release. The current accepted baseline is `0.1.0-beta`; no public repository or update feed is configured in this checkout.

## Release scope

Windows x64 is the validated packaging target. The installer runs per user, creates shortcuts and an uninstaller, and includes the WebView2 bootstrapper. Installing a missing WebView2 runtime can still require network access.

Keep the bundle identifier `dev.bbb.notes` and the existing storage keys. They preserve notes and preferences from the earlier bbb-notes name. Renaming the project folder does not require changing this installed identity.

A public release also needs project-specific licensing, reporting channels, and a chosen repository. Documentation-template adoption does not establish those policies or publish an artifact.

## Prepare a version

Run from the project root with Node.js 24 and Rust installed:

```sh
npm ci
npm run release:version -- 0.1.0-beta
npm run release:verify -- v0.1.0-beta
```

The version helper updates package.json, package-lock.json, Cargo.toml, Cargo.lock, and Tauri configuration. Verification checks the primary package/native versions and optional tag. Keep all generated changes together.

Use `0.1.0-beta.1` for a later beta, or `0.1.0` when deliberately promoting this baseline to stable. Do not label a beta as a stable release merely because its installer builds.

Run the [development checks](docs/development/README.md#run-focused-checks) and documentation checks before packaging. Update [CHANGELOG.md](CHANGELOG.md) with user-visible changes and remaining limits.

## Protect the signing key

The updater public key is embedded in `src-tauri/tauri.conf.json`. The matching private key is stored outside the project:

| Machine role | Existing key location |
| --- | --- |
| Development host | `~/.local/share/bbb-notepad/updater.key` |
| Windows build host | `~/.bbb-notepad/updater.key` |

These are maintainer-local locations, not files supplied by a clone. Keep a secure backup of the existing private key. Never commit it, publish it, print it in logs, or replace it just to make a build pass. Future update packages must match the key trusted by installed apps.

The generated local key has an empty password. Set the correct password when using a different protected key. Updater signatures are separate from Windows publisher/Authenticode signing; no publisher certificate is configured here.

## Build the Windows installer

Use PowerShell from the project root on a Windows machine with the [native prerequisites](docs/development/README.md#prepare-the-checkout). The commands use `npm.cmd` to avoid a PowerShell script-policy conflict with npm's wrapper.

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$HOME/.bbb-notepad/updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
npm.cmd run release:build -- --ci
```

Expected outputs for this version:

```text
src-tauri/target/release/bbb-notepad.exe
src-tauri/target/release/bundle/nsis/bbb-notepad_0.1.0-beta_x64-setup.exe
src-tauri/target/release/bundle/nsis/bbb-notepad_0.1.0-beta_x64-setup.exe.sig
```

The build must finish successfully and produce both the installer and its nonempty signature. A missing signing key is a build error. Close running copies normally before replacing the executable used for local testing.

Install a test copy before distribution. Verify the displayed version, capture/save/restart/search workflow, and any changed native behavior. Keep test data separate from personal notes. See [upgrade test coverage](docs/development/validation.md#prior-native-upgrade-validation).

After building, clear signing variables from the shell if no further signing work is needed:

```powershell
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Keep generated installers and build output out of source control.

## Update channels

The current local beta has an empty updater endpoint list. **Settings → Check for updates** reports that configuration explicitly. Creating a repository later cannot teach an already-installed unconfigured build its address; rebuild and reinstall with the intended feed.

The `release:configure` helper configures a **stable** GitHub feed at `releases/latest/download/latest.json`. GitHub prereleases are not discovered by this stable-release route; GitHub defines its [latest release](https://docs.github.com/en/rest/releases/releases#get-the-latest-release) as a published, non-prerelease release. It is not a beta-to-beta update channel.

For a beta release, distribute the installer directly until a deliberate beta-channel design exists. The GitHub workflow labels prerelease versions as prereleases and does not automatically add the stable feed to those builds. Keep the endpoint list empty unless you intentionally provide a compatible feed.

For a future stable release, replace `YOUR-OWNER/YOUR-REPOSITORY` with the public repository that will host its assets:

```sh
npm run release:configure -- YOUR-OWNER/YOUR-REPOSITORY
npm run release:verify
```

Run configuration **before** the build so the address is embedded. The source repository can be separate, but updater metadata and downloads must be accessible without private-repository credentials. A missing feed or a missing manifest must never be described as an up-to-date result.

## Prepare release assets

After a successful build, generate a manifest if the chosen release channel will use it. Replace the repository argument before running:

```sh
npm run release:manifest -- YOUR-OWNER/YOUR-REPOSITORY src-tauri/target/release/bundle/nsis CHANGELOG.md latest.json
```

The helper requires the installer and matching signature for the current version. It writes the version, notes, publication timestamp, platform key, signature, and versioned GitHub installer URL. For this beta, that URL uses tag `v0.1.0-beta`.

Upload the setup executable and matching `.exe.sig` to a draft release. Upload `latest.json` only according to the intended channel policy. A manifest attached to a beta release does not make the stable feed discover it.

Mark `v0.1.0-beta` as a **prerelease**. Review the download, notes, and signatures before publishing. Keep prior release assets available for clients that still reference them. Publishing and live public-feed checks have not been performed for this project.

## CI and release triggers

| Event | Behavior |
| --- | --- |
| Pull request targeting `main` | Version, documentation, unit, Rust core, frontend build, and browser checks |
| Push to `main` | The same checks; no installer build or release |
| Push a `v*` tag | Run those checks, verify the tag matches the version, then build signed Windows installers and create a draft release |
| Push to another branch or PR targeting another branch | No automatic workflow |

The [CI workflow](.github/workflows/ci.yml) is reused by the tag release so checks must pass before packaging. Ordinary CI uses read-only repository permissions and does not receive signing secrets. The frontend build is a compilation check; it does not create an installer.

Installer builds have no manual workflow trigger. Publishing a generated draft remains a separate manual action.

## Use the GitHub workflow later

The [Windows workflow](.github/workflows/release-windows.yml) is ready for a future repository. It is not running merely because it exists locally.

Set repository secrets `TAURI_SIGNING_PRIVATE_KEY` to the existing key file's contents and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to its password. Push a version-matching `v*` tag. It verifies tests and tag versions, derives prerelease status from the package version, and creates a draft release with signed updater artifacts.

Stable-version builds configure the stable feed from the repository name. Prerelease builds retain the source configuration instead. The current beta source configuration has no feed. Review the generated release and publish it deliberately; a draft is not available as a live update.

## Verify an update-enabled release

The app checks only when requested. A newer compatible release displays its version and release notes. **Download and install** performs these steps:

1. Download and verify the package signature.
2. Lock editing during final preparation.
3. Flush pending note and session writes.
4. Create a consistent SQLite backup under the application's `backups/` directory.
5. Start the installer and restart the app.

A save or backup failure aborts installation and leaves editing available. Verify the new version, known note text, tab state, and the backup after an upgrade. Follow [data and backups](docs/guides/data-and-backups.md) for recovery. Updater backups do not make arbitrary future schema changes reversible.

Owning sources: [release helpers](scripts/release-utils.mjs), [release CLI](scripts/release.mjs), [Tauri configuration](src-tauri/tauri.conf.json), [Windows configuration](src-tauri/tauri.windows.conf.json), and [backup commands](src-tauri/src/lib.rs).
