# Changelog

This file has two parts. The first section lists the changes made by **Cavaleiro Personal Agent**, maintained by Cavaleiro AI; it follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Below the separator is the original project's changelog index, unchanged.

## Cavaleiro Personal Agent 1.0.0 — 2026-10-17

First release of Cavaleiro Personal Agent, based on the original project's `main` (package version `2026.10.4`) at commit `406772b73f3b1481cfe635561e7643651894676a`. The `openclaw` command, packages, configuration, environment variables, protocol, and plugin IDs are unchanged. Each product fix below has a regression test that fails on the original code and passes with the fix, and the Windows developer-tooling fixes were verified by running the affected suites and commands before and after; the [engineering report](docs/cavaleiro/ENGINEERING.md) has the commands and results.

### Added

- `README.pt-BR.md` and a complete Portuguese guide, [`docs/cavaleiro/GUIA-PT-BR.md`](docs/cavaleiro/GUIA-PT-BR.md): what the assistant is, architecture, step-by-step installation on Windows, macOS, and Linux, first steps, examples, configuration, troubleshooting, and contributing.
- [`docs/cavaleiro/ENGINEERING.md`](docs/cavaleiro/ENGINEERING.md): architecture map, test baseline, findings table, verification evidence for every change, known limitations, and next steps.
- README sections **What Cavaleiro Personal Agent adds**, **Compatibility** (identifiers kept, upstream installers, default update check), and **License**; the banner at `docs/assets/cavaleiro-banner.svg`.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) (Contributor Covenant 2.1), fork-specific bug and improvement issue forms, and issue-chooser links for private security reports, the contributing guide, and the Portuguese guide.
- [`.github/workflows/cavaleiro-ci.yml`](.github/workflows/cavaleiro-ci.yml): format, lint, and focused tests for the changed areas on GitHub-hosted runners with a read-only token.
- A regression test file for plugin capability leases, `src/plugins/capability-lease.test.ts`.

### Changed

- Project identity: README title, banner, badges, and repository links now name Cavaleiro Personal Agent and `https://github.com/cavaleiro-ai/cavaleiro-personal-agent`. Code identifiers keep their upstream names for compatibility, and in-product names are unchanged. The root `package.json` author, homepage, repository, and issue links point to Cavaleiro AI (the package name stays `openclaw`), and the prose of the inherited `docs/` names the product Cavaleiro Personal Agent; code samples, identifiers, and links in `docs/` are unchanged.
- `LICENSE` adds the derivative-work notice and the Cavaleiro AI copyright line above the unchanged MIT text and the original copyright line.
- `CONTRIBUTING.md` and `SECURITY.md` give the rules and private reporting path for this distribution (<https://github.com/cavaleiro-ai/cavaleiro-personal-agent/security/advisories/new>); `CONTRIBUTING.md` keeps the inherited engineering rules and `SECURITY.md` the inherited trust model, without the original project's contacts, community channels, and maintainer lists. The PR template mentions the fork's checks.
- 108 workflows that publish, sign, attest, need non-`GITHUB_TOKEN` secrets, run on upstream or self-hosted runners, run upstream bots, or check upstream-generated artifacts moved to [`.github/workflows-disabled/`](.github/workflows-disabled/README.md), which explains how to re-enable them with your own credentials. The 10 kept workflows run on GitHub-hosted runners; their `github.repository == 'openclaw/openclaw'` checks now name this repository.
- `docs.yml` moved with them: it runs `pnpm check:docs`, whose `changelog:check` requires `CHANGELOG.md` to equal the generated upstream release index (this file now starts with the Cavaleiro section), and it checks out `openclaw/clawhub`.
- The Vitest worker build (`scripts/lib/vitest-worker-build-entries.mts`) copies `plugin-npm-release.yml` from its new place in `.github/workflows-disabled/`; without this, every `pnpm test` run stopped at the worker-compile step once the workflow moved.
- `.github/CODEOWNERS` is now `* @cavaleiro-ai`.
- `.github/dependabot.yml` no longer references the upstream `NPM_NPMJS_TOKEN` registry secret.
- Upstream bot and app configuration (`.github/labeler.yml`, `.github/codex/`, `.github/crabbox/`, `.github/pr-proof/`, `.github/release/`, `.github/security-review-policy.yml`) is kept for reference but inert, because every workflow that reads it is disabled.

### Fixed

- **Plugin capability lease revoke stops at the first throwing cleanup.** `revoke()` now attempts every retained cleanup, then rethrows the single failure or an `AggregateError`; the lease stays one-shot and fenced. Before, one throwing callback left later subscriptions (diagnostics, HTTP routes, event listeners) attached for good, and a retry was a no-op. Original issue #175292.
- **Native-session binding lease `update()` retried compare-and-swap conflicts forever.** Conflict retries now share the caller's `lease.waitMs` budget and end with the configured lease-timeout error; transient conflicts inside the budget still succeed, and uncertain writes are still never replayed. Renewal and release use the same bound and keep their existing failure handling. Original issue #175290.
- **ACP startup identity reconcile hid scan failures.** When listing ACP sessions failed (`checked=0 failed=1`), the Gateway returned before its warning, so the failure was never logged. It now warns whenever a scan fails; empty scans stay quiet. Original issue #171958.
- **Startup orphan workspace-result cleanup reported completion after a workspace-resolution failure.** The failed resolution now marks the pass incomplete, so the next sweep retries it and deletes the orphan refs instead of waiting for a Gateway restart. Original issue #169209.
- **Three Gateway test suites could not load on Windows.** The worker-free test fixture (`src/gateway/server-worker-free.test-support.ts`) used the POSIX-only URL `file:///openclaw-worker-free-test/entry.js`, which `fileURLToPath` rejects on Windows (`ERR_INVALID_FILE_URL_PATH`). It now builds the URL with `pathToFileURL`, unchanged on Linux and macOS, so `server-startup-post-attach`, `server-close.cleanup-scope`, and `server-maintenance.telemetry` tests run on Windows.
- **`/context` report tests failed on Windows during cleanup.** `src/auto-reply/reply/commands-context-report.test.ts` deleted its temporary state directory right after closing the agent databases, while Windows still held the SQLite files (`EBUSY`/`ENOTEMPTY`); the cleanup now uses `rm` with `maxRetries`, so the three affected tests pass on Windows and nothing changes elsewhere.
- **`pnpm format:docs:check` and `pnpm format:docs` failed on Windows** with "The command line is too long": formatter batches were sized for 24 KiB, but the `oxfmt.cmd` shim runs through `cmd.exe`, which stops at 8,191 characters. `scripts/lib/format-command-batches.mts` now uses a 7 KiB budget on Windows (also used by `check:changed`); other platforms are unchanged. Regression test in `test/scripts/format-docs.test.ts`.
- **`openclaw attach` crashed with `RangeError: Invalid time value`** when `attach.grant` returned a finite expiry outside the JavaScript `Date` range. It now prints the usual "unexpected response" diagnostic, exits with code 1, and still revokes the grant. Original issue #174524.
- **Maintainer-tooling tests could not find the parked workflows.** 1,783 tests in 134 files under `test/scripts/` failed with `ENOENT` because they read workflows from `.github/workflows/`. The new helper `scripts/lib/workflow-path.mts` resolves `.github/workflows/<name>` first and `.github/workflows-disabled/<name>` second; those tests, their fixtures, the Vitest worker build, and four scripts that read a workflow by path now use it, with no assertion changed. The failures that remain are listed in the [engineering report](docs/cavaleiro/ENGINEERING.md#known-limitations).

### Security

- No workflow in this repository can publish, sign, or deploy under the original project's identity, and none receives upstream secrets.
- Private vulnerability reporting for this distribution through [SECURITY.md](SECURITY.md).
- The default daily update check to `telemetry.openclaw.ai` is documented in the README Compatibility section with its opt-out (`update.checkOnStart: false`); it is neither repointed nor extended.

---

## Original project changelog (unchanged)

<!-- openclaw:split-changelog -->

Release notes: https://docs.openclaw.ai/releases

Each release has its complete changelog below. Audited contribution records are retained separately when available.

- [Unreleased](CHANGELOG/Unreleased.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/Unreleased.md)
- [2026.10.4](CHANGELOG/2026.10.4.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.10.4.md)
- [2026.10.3](CHANGELOG/2026.10.3.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.10.3.md)
- [2026.10.2](CHANGELOG/2026.10.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.10.2.md)
- [2026.10.1](CHANGELOG/2026.10.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.10.1.md)
- [2026.9.9](CHANGELOG/2026.9.9.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.9.9.md)
- [2026.9.8](CHANGELOG/2026.9.8.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.9.8.md)
- [2026.9.7](CHANGELOG/2026.9.7.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.9.7.md)
- [2026.9.6](CHANGELOG/2026.9.6.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.9.6.md)
- [2026.9.5](CHANGELOG/2026.9.5.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.9.5.md)
- [2026.9.4](CHANGELOG/2026.9.4.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.9.4.md)
- [2026.9.3](CHANGELOG/2026.9.3.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.9.3.md)
- [2026.9.2](CHANGELOG/2026.9.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.9.2.md)
- [2026.9.1](CHANGELOG/2026.9.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.9.1.md)
- [2026.8.2](CHANGELOG/2026.8.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.8.2.md)
- [2026.8.1](CHANGELOG/2026.8.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.8.1.md)
- [2026.7.1](CHANGELOG/2026.7.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.7.1.md)
- [2026.6.11](CHANGELOG/2026.6.11.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.6.11.md)
- [2026.6.10](CHANGELOG/2026.6.10.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.6.10.md)
- [2026.6.9](CHANGELOG/2026.6.9.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.6.9.md)
- [2026.6.8](CHANGELOG/2026.6.8.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.6.8.md)
- [2026.6.7](CHANGELOG/2026.6.7.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.6.7.md)
- [2026.6.6](CHANGELOG/2026.6.6.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.6.6.md)
- [2026.6.5](CHANGELOG/2026.6.5.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.6.5.md)
- [2026.6.2](CHANGELOG/2026.6.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.6.2.md)
- [2026.6.1](CHANGELOG/2026.6.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.6.1.md)
- [2026.5.31](CHANGELOG/2026.5.31.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.31.md)
- [2026.5.28](CHANGELOG/2026.5.28.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.28.md)
- [2026.5.27](CHANGELOG/2026.5.27.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.27.md)
- [2026.5.26](CHANGELOG/2026.5.26.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.26.md)
- [2026.5.22](CHANGELOG/2026.5.22.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.22.md)
- [2026.5.20](CHANGELOG/2026.5.20.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.20.md)
- [2026.5.19](CHANGELOG/2026.5.19.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.19.md)
- [2026.5.17](CHANGELOG/2026.5.17.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.17.md)
- [2026.5.14](CHANGELOG/2026.5.14.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.14.md)
- [2026.5.12](CHANGELOG/2026.5.12.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.12.md)
- [2026.5.7](CHANGELOG/2026.5.7.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.7.md)
- [2026.5.6](CHANGELOG/2026.5.6.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.6.md)
- [2026.5.5](CHANGELOG/2026.5.5.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.5.md)
- [2026.5.4](CHANGELOG/2026.5.4.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.4.md)
- [2026.5.3-1](CHANGELOG/2026.5.3-1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.3-1.md)
- [2026.5.3](CHANGELOG/2026.5.3.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.3.md)
- [2026.5.2](CHANGELOG/2026.5.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.5.2.md)
- [2026.4.29](CHANGELOG/2026.4.29.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.29.md)
- [2026.4.27](CHANGELOG/2026.4.27.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.27.md)
- [2026.4.26](CHANGELOG/2026.4.26.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.26.md)
- [2026.4.25](CHANGELOG/2026.4.25.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.25.md)
- [2026.4.24](CHANGELOG/2026.4.24.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.24.md)
- [2026.4.23](CHANGELOG/2026.4.23.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.23.md)
- [2026.4.22](CHANGELOG/2026.4.22.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.22.md)
- [2026.4.21](CHANGELOG/2026.4.21.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.21.md)
- [2026.4.20](CHANGELOG/2026.4.20.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.20.md)
- [2026.4.19-beta.2](CHANGELOG/2026.4.19-beta.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.19-beta.2.md)
- [2026.4.19-beta.1](CHANGELOG/2026.4.19-beta.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.19-beta.1.md)
- [2026.4.18](CHANGELOG/2026.4.18.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.18.md)
- [2026.4.15](CHANGELOG/2026.4.15.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.15.md)
- [2026.4.14](CHANGELOG/2026.4.14.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.14.md)
- [2026.4.12](CHANGELOG/2026.4.12.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.12.md)
- [2026.4.11](CHANGELOG/2026.4.11.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.11.md)
- [2026.4.10](CHANGELOG/2026.4.10.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.10.md)
- [2026.4.9](CHANGELOG/2026.4.9.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.9.md)
- [2026.4.8](CHANGELOG/2026.4.8.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.8.md)
- [2026.4.7-1](CHANGELOG/2026.4.7-1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.7-1.md)
- [2026.4.7](CHANGELOG/2026.4.7.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.7.md)
- [2026.4.5](CHANGELOG/2026.4.5.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.5.md)
- [2026.4.2](CHANGELOG/2026.4.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.2.md)
- [2026.4.1](CHANGELOG/2026.4.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.1.md)
- [2026.4.1-beta.1](CHANGELOG/2026.4.1-beta.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.4.1-beta.1.md)
- [2026.3.31](CHANGELOG/2026.3.31.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.31.md)
- [2026.3.31-beta.1](CHANGELOG/2026.3.31-beta.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.31-beta.1.md)
- [2026.3.28](CHANGELOG/2026.3.28.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.28.md)
- [2026.3.24](CHANGELOG/2026.3.24.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.24.md)
- [2026.3.24-beta.2](CHANGELOG/2026.3.24-beta.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.24-beta.2.md)
- [2026.3.24-beta.1](CHANGELOG/2026.3.24-beta.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.24-beta.1.md)
- [2026.3.23](CHANGELOG/2026.3.23.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.23.md)
- [2026.3.22](CHANGELOG/2026.3.22.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.22.md)
- [2026.3.13](CHANGELOG/2026.3.13.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.13.md)
- [2026.3.12](CHANGELOG/2026.3.12.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.12.md)
- [2026.3.11](CHANGELOG/2026.3.11.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.11.md)
- [2026.3.8](CHANGELOG/2026.3.8.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.8.md)
- [2026.3.7](CHANGELOG/2026.3.7.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.7.md)
- [2026.3.2](CHANGELOG/2026.3.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.2.md)
- [2026.3.1](CHANGELOG/2026.3.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.3.1.md)
- [2026.2.27](CHANGELOG/2026.2.27.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.27.md)
- [2026.2.26](CHANGELOG/2026.2.26.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.26.md)
- [2026.2.25](CHANGELOG/2026.2.25.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.25.md)
- [2026.2.24](CHANGELOG/2026.2.24.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.24.md)
- [2026.2.23](CHANGELOG/2026.2.23.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.23.md)
- [2026.2.22](CHANGELOG/2026.2.22.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.22.md)
- [2026.2.21](CHANGELOG/2026.2.21.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.21.md)
- [2026.2.19](CHANGELOG/2026.2.19.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.19.md)
- [2026.2.17](CHANGELOG/2026.2.17.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.17.md)
- [2026.2.15](CHANGELOG/2026.2.15.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.15.md)
- [2026.2.14](CHANGELOG/2026.2.14.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.14.md)
- [2026.2.13](CHANGELOG/2026.2.13.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.13.md)
- [2026.2.12](CHANGELOG/2026.2.12.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.12.md)
- [2026.2.9](CHANGELOG/2026.2.9.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.9.md)
- [2026.2.6](CHANGELOG/2026.2.6.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.6.md)
- [2026.2.3](CHANGELOG/2026.2.3.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.3.md)
- [2026.2.2-3](CHANGELOG/2026.2.2-3.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.2-3.md)
- [2026.2.2-2](CHANGELOG/2026.2.2-2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.2-2.md)
- [2026.2.2-1](CHANGELOG/2026.2.2-1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.2-1.md)
- [2026.2.2](CHANGELOG/2026.2.2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.2.md)
- [2026.2.1](CHANGELOG/2026.2.1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.2.1.md)
- [2026.1.31](CHANGELOG/2026.1.31.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.31.md)
- [2026.1.30](CHANGELOG/2026.1.30.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.30.md)
- [2026.1.29](CHANGELOG/2026.1.29.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.29.md)
- [2026.1.24-3](CHANGELOG/2026.1.24-3.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.24-3.md)
- [2026.1.24-2](CHANGELOG/2026.1.24-2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.24-2.md)
- [2026.1.24-1](CHANGELOG/2026.1.24-1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.24-1.md)
- [2026.1.24](CHANGELOG/2026.1.24.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.24.md)
- [2026.1.23-1](CHANGELOG/2026.1.23-1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.23-1.md)
- [2026.1.23](CHANGELOG/2026.1.23.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.23.md)
- [2026.1.22](CHANGELOG/2026.1.22.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.22.md)
- [2026.1.21-2](CHANGELOG/2026.1.21-2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.21-2.md)
- [2026.1.21](CHANGELOG/2026.1.21.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.21.md)
- [2026.1.20](CHANGELOG/2026.1.20.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.20.md)
- [2026.1.16-2](CHANGELOG/2026.1.16-2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.16-2.md)
- [2026.1.16-1](CHANGELOG/2026.1.16-1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.16-1.md)
- [2026.1.15](CHANGELOG/2026.1.15.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.15.md)
- [2026.1.14-1](CHANGELOG/2026.1.14-1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.14-1.md)
- [2026.1.14](CHANGELOG/2026.1.14.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.14.md)
- [2026.1.13](CHANGELOG/2026.1.13.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.13.md)
- [2026.1.12-2](CHANGELOG/2026.1.12-2.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.12-2.md)
- [2026.1.12-1](CHANGELOG/2026.1.12-1.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.12-1.md)
- [2026.1.12](CHANGELOG/2026.1.12.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.12.md)
- [2026.1.11](CHANGELOG/2026.1.11.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.11.md)
- [2026.1.10](CHANGELOG/2026.1.10.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.10.md)
- [2026.1.9](CHANGELOG/2026.1.9.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.9.md)
- [2026.1.8](CHANGELOG/2026.1.8.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.8.md)
- [2026.1.5](CHANGELOG/2026.1.5.md) · [Raw](https://github.com/openclaw/openclaw/raw/refs/heads/main/CHANGELOG/2026.1.5.md)

Some historical files retain repeated version headings from the original changelog, in their original order. Automated release selection refuses those ambiguous versions.
