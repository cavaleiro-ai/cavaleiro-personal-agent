# Contributing to Cavaleiro Personal Agent

Thanks for helping improve Cavaleiro Personal Agent, maintained by [Cavaleiro AI](https://github.com/cavaleiro-ai). By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately, as described in the [security policy](SECURITY.md).

## How to contribute

- **Issues:** use the [issue forms](https://github.com/cavaleiro-ai/cavaleiro-personal-agent/issues/new/choose). Questions, setup help, and bug reports all go there; do not file public issues for vulnerabilities.
- **Pull requests:** open them against [`cavaleiro-ai/cavaleiro-personal-agent`](https://github.com/cavaleiro-ai/cavaleiro-personal-agent/pulls) and fill in the [PR template](.github/pull_request_template.md). For non-trivial work, open or reuse an issue first and link it from the PR.
- **Keep upstream identifiers.** Do not rename the `openclaw` command, `openclaw`/`@openclaw/*` packages, `~/.openclaw` paths, `OPENCLAW_*` variables, protocol methods, or plugin and skill IDs. The [README Compatibility section](README.md#compatibility) explains why.
- **Prove bug fixes.** Add a regression test that fails before the fix and passes after it, and say so in the PR. When the bug was reported in the original project, cite its issue number as plain text.
- **Record the change** in the Cavaleiro section at the top of [CHANGELOG.md](CHANGELOG.md), and update [README.pt-BR.md](README.pt-BR.md) and the [Portuguese guide](docs/cavaleiro/GUIA-PT-BR.md) together with `README.md` when user-facing text changes.
- **No publishing from CI.** Workflows that publish, sign, or need secrets live in [`.github/workflows-disabled/`](.github/workflows-disabled/README.md); do not move them back without your own credentials and package names.

## Set up and validate a source checkout

Requires Node.js 24.16+ or 26.1+, Git, and Corepack (bundled with Node 24).

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm test <file> --maxWorkers=1           # focused tests for what you touched
corepack pnpm exec oxfmt --check <files>           # formatting of changed files
corepack pnpm exec oxlint <files>                  # lint of changed files
git diff --check                                   # whitespace errors
```

The first test run on a machine compiles a large module graph and can take several minutes; `--fsModuleCache` reuses transforms between runs. On Windows, run the commands from PowerShell or Git Bash. The [engineering report](docs/cavaleiro/ENGINEERING.md#baseline) lists the exact commands and results used for this release.

## Engineering rules

- Keep PRs focused: one thing per PR, no unrelated changes mixed in. Describe what changed and why.
- Do not submit refactor-only PRs or test-only PRs that just chase known failures; test changes belong with the fix or behavior they validate.
- Describe the user, product, or operational problem in the PR, then the evidence: focused tests, CI results, terminal output, redacted logs, or screenshots (before and after for UI changes).
- Run focused tests for touched code (`pnpm test <file> --maxWorkers=1`) and targeted typecheck, lint, and format checks. Build when the change affects build output or package boundaries.
- For extension/plugin changes, run the fast local lane first:
  - `pnpm test:extension <extension-name>`
  - `pnpm test:extension --list` to see valid extension ids
  - If you changed shared plugin or channel surfaces, run `pnpm test:contracts` (or `pnpm test:contracts:channels` / `pnpm test:contracts:plugins` for targeted work)
- If you touched bundled-plugin boundaries in shared code, run the matching inventories:
  - `node --import tsx scripts/check-src-extension-import-boundary.mts --json` for `src/**`
  - `node --import tsx scripts/check-sdk-package-extension-import-boundary.mts --json` for `src/plugin-sdk/**` and `packages/**`
  - `node --import tsx scripts/check-test-helper-extension-import-boundary.mts --json` for `test/helpers/**`
- Shared test helpers must use `src/test-utils/bundled-plugin-public-surface.ts` instead of repo-relative `extensions/**` imports. Keep plugin-local deep mocks inside the owning bundled plugin package.
- Use American English spelling and grammar in code, comments, docs, and UI strings.
- Use **Node 24.16+ LTS** or **Node 26.1+**. Older Node releases can truncate SQLite TEXT reads; Node 22, 23, and 25 are unsupported. See [Node install guidance](docs/install/node.md). Use `OPENCLAW_VITEST_RUNTIME=node pnpm test <file>` to force the Node test runtime locally; see [local test runtimes](docs/reference/test/local.md).
- Changes to database schemas, durability, retention, or permissions need a design review; see the [database schema review checkpoint](docs/reference/database-schemas.md#review-checkpoint-for-material-changes).
- AI-assisted PRs are welcome and follow the same standards: confirm you understand the code, and run the `autoreview` skill when it is available.

## Source dependencies

Run `pnpm install --frozen-lockfile` from the workspace root. Source checkouts use
pnpm's isolated linker, which keeps dependencies in `node_modules/.pnpm` and links
them into each workspace package. On supported macOS volumes, this also lets pnpm
reuse whole-package APFS clones instead of importing every file separately.

Installation also prepares Kysely declarations from the SQL schemas in `src/state`.
The generated files live in ignored `.artifacts/kysely/`; build, typecheck,
type-aware lint, and test entrypoints refresh them automatically, including after an install with
`--ignore-scripts`. Unchanged inputs reuse the declarations without rewriting
them. `pnpm db:kysely:check` checks schema projection and generator contracts.
Sparse core, script, and root-test lint prepare only the available schemas and
retire declarations for omitted schemas. Normal source generation, verification,
and extension-boundary builds still require complete schemas.

Give each source checkout its own physical dependency installation. Tooling does
not automatically link a missing `node_modules` to another checkout. Existing
borrowed installs can still serve direct Node tooling. Normal pnpm install checks
the checkout-root `node_modules`, the explicitly configured root module directory,
and their `.pnpm` directories before reconciliation, refusing borrowed links there.
Preserve that donor and create an independently owned install instead of removing
or reinstalling through its link. Explicit hydrated module directories remain
supported when the workspace link points to the configured physical directory.
This admission check runs through `pnpm:devPreinstall`; `--ignore-scripts` skips
it. The check does not lock paths against concurrent replacement, inspect every
workspace package's dependencies, or validate every alternate pnpm directory setting.

When updating a checkout that used the hoisted layout, stop builds, tests, and
watchers using that checkout's dependencies before running the install command.
Do not change the linker while other jobs are using the same `node_modules`.
Declare dependencies in the package that imports them; root tooling and tests
must declare their own development dependencies rather than rely on hoisting.

## Local commit hook

The normal `pnpm install` setup enables the repository's pre-commit formatting hook
when `core.hooksPath` is unset. Existing hook selections, including an explicitly
empty value, are preserved. Git scopes initialization to the current checkout.
With multiple worktrees, automatic setup requires `extensions.worktreeConfig`;
otherwise Git reports a warning and installation continues without changing hook
settings. The repository owner can enable per-worktree configuration following
[Git's configuration guidance](https://git-scm.com/docs/git-worktree#_configuration_file).

The hook's optional content guard reads a private UTF-8 file selected by
the native Git setting `hooks.blockedLiteralsFile`. Keep one literal per nonempty
line in a file outside the checkout, such as
`~/.config/openclaw/blocked-literals.txt`, then configure this checkout:

```bash
git config --local hooks.blockedLiteralsFile "$HOME/.config/openclaw/blocked-literals.txt"
```

Git metadata is another safe untracked location for the private file. Never put
private rule contents in tracked files or PRs. With no setting, the content guard
is disabled and formatting runs normally; a configured empty path or missing,
unreadable, empty, or invalid file blocks the commit.

When configured, the guard checks case-sensitive literal substrings before
formatting and again after formatting restages files. Each scan checks the full
staged contents of added, modified, and type-changed files, including rename
destinations and unchanged lines within modified files. Docs, tests, generated
files, and binary files are included; no tracked file is exempt.

If the hook blocks a commit, remove the matching content and restage the reported
files. Unchanged historical files and deletions are not scanned. Submodule contents
and symlink targets are not searched. This is a local safeguard, not CI or server
enforcement: bypassing or disabling hooks also bypasses this check.

## Control UI Decorators

The Control UI uses Lit with **legacy** decorators (current Rollup parsing does not support
`accessor` fields required for standard decorators). When adding reactive fields, keep the
legacy style:

```ts
@state() foo = "bar";
@property({ type: Number }) count = 0;
```

The root `tsconfig.json` is configured for legacy decorators (`experimentalDecorators: true`)
with `useDefineForClassFields: false`. Avoid flipping these unless you are also updating the UI
build tooling to support standard decorators.
