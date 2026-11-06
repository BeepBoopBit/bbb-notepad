# bbb-notepad documentation

These pages describe the `0.1.0-beta` working tree and local Windows beta build. They distinguish implemented behavior from planned work. Public hosting and beta update distribution are not configured.

See the [development guide](development/README.md#check-documentation) for documentation checks and maintenance commands.

## Start with your task

| Reader outcome | Page |
| --- | --- |
| Save and reopen your first note | [First note](getting-started/first-note.md) |
| Capture text and search closed notes | [Capture and search](guides/capture-and-search.md) |
| Edit Markdown and styled pairs | [Markdown and pairs](guides/markdown-and-pairs.md) |
| Copy sentences and blocks as a prompt | [Copy prompts](guides/copy-prompts.md) |
| Import or export a file | [Files](guides/files.md) |
| Locate data, back up, or restore notes | [Data and backups](guides/data-and-backups.md) |
| Resolve a save, rendering, or update problem | [Troubleshooting](guides/troubleshooting.md) |
| Find exact syntax and limits | [Editor reference](reference/editor.md) |
| Find a keyboard action | [Shortcuts](reference/shortcuts.md) |
| Understand runtime boundaries | [Architecture](architecture/README.md) |
| Build or change the app | [Development](development/README.md) |
| Check test coverage and limits | [Validation](development/validation.md) |
| Package and publish a version | [Releasing](../RELEASING.md) |

## Maintain these pages

Each topic has one owning page. Keep procedures in guides and exact contracts in reference pages. Root [README](../README.md), [Contributing](../CONTRIBUTING.md), and [Changelog](../CHANGELOG.md) remain the project entry points.

Private working notes under `.docs/` are ignored and are not the published documentation. Public instructions must not depend on those files or a particular developer's checkout path.

Run `npm run docs:check` after editing. Follow [documentation checks](development/README.md#check-documentation) for checker tests and Mermaid rendering. The checker verifies structure and links; it does not prove application behavior.
