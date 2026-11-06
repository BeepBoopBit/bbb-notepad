# Contribute to bbb-notepad

Use this guide to prepare a small, reviewable change to the `0.1.0-beta` app or its documentation. This is an independent personal project.

## Request an update or contribute

Updates follow the maintainer's needs. There is no fixed release schedule.
Open an issue to report a bug or request a feature. Describe the problem and
the behavior you need. You can also fork the project and submit a pull request.
Requests and pull requests do not guarantee an update or acceptance.

## Prepare a change

Follow [development setup](docs/development/README.md). Describe the problem and expected behavior before making a substantial change. Preserve automatic saving, exact source text, searchability of closed notes, and the lightweight initial capture path.

Use synthetic notes and values in examples and tests. Keep private keys, local databases, generated installers, and ignored `.docs/` working notes out of contributions. The supplied icon artwork must remain recognizable; follow [asset instructions](assets/README.md).

## Verify the affected behavior

Run focused checks from the [development guide](docs/development/README.md#run-focused-checks). Include what changed, why, which checks passed, and what remains unverified. UI changes need an appropriate interaction check; storage changes need persistence coverage. A browser preview does not prove desktop behavior.

Update the owning guide or reference when behavior changes. Follow the [documentation checks](docs/development/README.md#check-documentation) and inspect changed diagrams in both themes.

## Review AI-assisted changes

AI tools have been used in this project's development. Review generated changes as you would any other contribution. Identify known third-party sources, retain their applicable notices, and do not assume generated material is original or unrestricted.

The contributor remains responsible for the proposed behavior, evidence, and rights to supplied material. Do not submit private notes or credentials as model inputs or reproduction fixtures.

## Project policies still to be decided

The project uses the [MIT License](LICENSE). A public repository, issue tracker, and maintainer contact have not been selected. This guide welcomes issues and pull requests. It does not establish an inbound license, DCO requirement, or organizational contact. Public contribution links still need to be configured.

For current local problems, use [Troubleshooting](docs/guides/troubleshooting.md) and an established private maintainer contact when available.
