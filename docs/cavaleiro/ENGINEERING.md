# Cavaleiro Personal Agent — engineering report

This report documents how Cavaleiro Personal Agent 1.0.0 was derived from the original project, what was measured, what was changed, and how each change was verified. It is written for maintainers and reviewers. A Portuguese overview for users is in [GUIA-PT-BR.md](GUIA-PT-BR.md).

|                   |                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream          | The original project, branch `main`, commit `406772b73f3b1481cfe635561e7643651894676a` (2026-10-17, package version `2026.10.4`)              |
| License           | MIT (original copyright kept in `LICENSE`); modifications © 2026 Cavaleiro AI                                                                 |
| Derivative        | `cavaleiro-ai/cavaleiro-personal-agent`, release **Cavaleiro Personal Agent 1.0.0**                                                           |
| Verification host | Windows 10 Pro 19045, 16 CPUs (shared with other jobs, often at 100% load), Node 24.21.0 (portable, project-local), pnpm 12.11.1 via Corepack |

**Contents:** [Architecture map](#architecture-map) · [Baseline](#baseline) · [Findings](#findings) · [Improvements and verification](#improvements-and-verification) · [Rebrand and fork safety](#rebrand-and-fork-safety) · [What was not done](#what-was-not-done) · [Known limitations](#known-limitations) · [Recommended next steps](#recommended-next-steps)

## Architecture map

The codebase is a pnpm/TypeScript monorepo (about 27,000 tracked files under `src/`, 25 packages under `packages/`, 182 bundled plugins under `extensions/`, a Solid Control UI under `ui/`, native apps under `apps/`). It runs as one long-lived **Gateway** per host that owns every messaging connection, all state, and the agent runtime.

```text
                      ┌──────────── clients ────────────┐
 chat apps ──channel  │ Control UI (ui/) · CLI (src/cli) │  nodes (apps/*: macOS, iOS, Android,
 plugins (extensions/)│ TUI (src/tui) · attach/ACP       │  Linux, headless node-host)
        │             └───────────────┬──────────────────┘          │
        │                  WebSocket JSON frames (packages/gateway-protocol), 127.0.0.1:18789
        ▼                             ▼                              ▼
 ┌──────────────────────────────── Gateway (src/gateway) ──────────────────────────────────┐
 │ server methods · auth/pairing · sidecars (cron, ACP reconcile, worker recovery, updates) │
 │ routing (src/routing) → sessions (src/sessions, src/config/sessions) → auto-reply        │
 │ (src/auto-reply: slash commands, mentions, delivery)                                     │
 │ plugin host (src/plugins, src/plugin-sdk): manifests, loader, capability leases,         │
 │   services, HTTP routes, hooks                                                            │
 │ agent runtime (src/agents, packages/agent-core): attempt loop, tools, compaction,        │
 │   harness registry (built-in, codex, ACP), native-session bindings and leases            │
 │ model transport (src/llm, provider plugins) · memory (src/memory, memory plugins)        │
 │ state: SQLite databases behind worker threads (src/state, src/storage, src/plugin-state) │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
        │ tools: exec/shell, files, browser (CDP), web fetch/search, canvas, node commands
        ▼
  host, Docker sandboxes, worker environments (src/gateway/worker-environments), paired devices
```

| Area                 | Entry points                                                                | Responsibility                                                                                         |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| CLI                  | `openclaw.mjs` → `src/entry.ts` → `src/cli/**`, `src/commands/**`           | Onboarding, Gateway lifecycle, doctor, config, channels, models, attach, cron                          |
| Gateway              | `src/gateway/server*.ts`, `src/gateway/server-methods/**`                   | WebSocket/HTTP server, method dispatch, startup sidecars, shutdown budget                              |
| Protocol             | `packages/gateway-protocol`, `packages/gateway-client`                      | TypeBox schemas → JSON Schema → generated clients (incl. Swift)                                        |
| Routing and sessions | `src/routing/resolve-route.ts`, `src/sessions/**`, `src/config/sessions/**` | Binding inbound messages to agents, session keys, transcripts                                          |
| Auto-reply           | `src/auto-reply/**`                                                         | Command parsing (`commands-context.ts`), mention stripping (`mentions.ts`), reply delivery, heartbeats |
| Agents               | `src/agents/**`, `packages/agent-core`                                      | Built-in runtime, tool policy, harnesses (`src/agents/harness/**`), ACP spawning                       |
| Plugins              | `src/plugins/**`, `src/plugin-sdk/**`, `extensions/*`                       | Manifest registry, loader, `openclaw/plugin-sdk/*` contracts, runtime capability leases, services      |
| ACP control plane    | `src/acp/**`, `packages/acp-core`                                           | Agent Client Protocol sessions, startup identity reconciliation                                        |
| Worker environments  | `src/gateway/worker-environments/**`                                        | Remote/sandboxed placements, dispatch recovery, workspace-result staging refs                          |
| Storage              | `src/state/*.sql`, Kysely types in `.artifacts/kysely`                      | SQLite schemas, worker-thread access, migrations via Doctor                                            |
| UI                   | `ui/` (Solid, Vite)                                                         | Control UI served by the Gateway                                                                       |
| Security             | `src/security/**`, `src/secrets/**`, `SECURITY.md`                          | Audit, exposure matrix, secrets, trust model                                                           |

**Control flow of one inbound message:** channel plugin receives an event → `src/routing` resolves agent and session key from bindings → `src/auto-reply` normalizes the body (mention stripping in groups, slash-command detection) → commands run directly, other turns enter the agent runtime → the harness builds context, calls the model through `src/llm`, executes tools under approval/sandbox policy → replies are delivered through the originating channel.

**Extension points:** plugins (providers, channels, tools, memory, speech, services, HTTP routes) declared by manifests and loaded through the plugin SDK; skills (`skills/`, workspace skills, ClawHub); agent harnesses; internal hooks; MCP servers; custom providers in config.

**Configuration:** `~/.openclaw/openclaw.json` (JSON5, `$include` supported), workspace in `~/.openclaw/workspace`, `OPENCLAW_*` environment variables, Doctor migrations for legacy shapes (`docs/gateway/doctor/config-migrations.md`).

**Tests:** Vitest 5 with 124 project configs in `test/vitest/`; `scripts/test-projects.mts` (`pnpm test <paths>`) routes each file to its project and runs the shards one after another. About 20,500 test files overall. Unit tests are colocated (`*.test.ts`); maintainer-tooling tests live in `test/scripts/**` and `src/scripts/**`; live, Docker, and E2E suites are opt-in.

**Build and release:** `pnpm build` (`scripts/build-all.mts`, tsdown) produces `dist/`; `pnpm ui:build` builds the Control UI. Upstream releases run through GitHub Actions on Blacksmith runners with npm, ClawHub, Docker Hub, GHCR, app-store, and signing steps; those workflows are disabled in this repository (see [Rebrand and fork safety](#rebrand-and-fork-safety)).

## Baseline

**Environment.** Upstream requires Node `>=24.16.0 <25 || >=26.1.0` and pnpm `12.11.1`; the host had Node 24.15.0 and pnpm 9.15.0. Without touching the global setup, a portable Node 24.21.0 (SHA-256 checked against nodejs.org) was unpacked into the agent's scratch folder and placed first on `PATH` for each command, and Corepack provided pnpm 12.11.1 (`corepack enable --install-directory <scratch>/bin pnpm`, `COREPACK_HOME` and the pnpm store also in scratch). `pnpm install --frozen-lockfile` (full workspace) finished in 2 min 47 s after a filtered root install; a filtered install is not enough because the Vitest configs import `ui/` dependencies. Docker, live provider tests, native apps, and the Bun test runtime ("unsupported platform win32-x64") were out of scope.

**Targeted subset.** The full suite has about 20,500 test files, so the baseline covers the core modules this release touches plus neighbors that exercise the same owners:

```text
src/plugins/http-registry.test.ts            src/plugins/services.test.ts
src/plugins/service-diagnostics.work.test.ts src/agents/harness/native-session/binding-leases.test.ts
src/agents/harness/native-session/binding-leases.worker.test.ts
src/agents/harness/native-session/binding-lifecycle.test.ts
src/acp/control-plane/manager.startup-identity-reconcile.test.ts
src/gateway/server-startup-post-attach.test.ts
src/gateway/worker-environments/placement-dispatch-recovery-admission.test.ts
src/gateway/server-worker-placement-startup-cleanup.test.ts
src/gateway/server-close.cleanup-scope.test.ts   src/gateway/server-maintenance.telemetry.test.ts
src/cli/attach-cli.action.test.ts            src/auto-reply/reply/mentions.test.ts
src/auto-reply/reply/commands-context-report.test.ts
src/auto-reply/reply/commands-acp.test.ts    src/auto-reply/reply/session.test.ts
src/routing                                  (the runner selected resolve-route.cache and session-key)
```

Command (Git Bash, from the repository root, with the scratch toolchain on `PATH`):

```bash
OPENCLAW_NODE_TEST_PLAN_CONTINUE_ON_FAILURE=1 \
  pnpm test src/plugins/capability-lease.test.ts <files above> --maxWorkers=4 --fsModuleCache
```

`pnpm test` runs one Vitest project ("shard") at a time and, locally, stops scheduling after the first failing shard unless `OPENCLAW_NODE_TEST_PLAN_CONTINUE_ON_FAILURE=1` is set. Before the first shard it compiles a worker bundle from about 16,700 inputs (about 17 minutes on this host) and verifies those inputs again at the end, so **files must not change while a run is in progress**.

**Results on the original product code** (Run 1 + Run 1b, 2026-10-18; Run 0 on 2026-10-17 is described below). The counts exclude the 11 tests added for the product fixes (8 regressions, 3 controls):

| Vitest project                              | Files  | Passed  | Failed | Notes                                                                                                                                                                     |
| ------------------------------------------- | ------ | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit-fast                                   | 1      | 16      | 0      |                                                                                                                                                                           |
| unit                                        | 2      | 32      | 0      |                                                                                                                                                                           |
| gateway (database-workers, server-isolated) | 5      | 117     | 1      | `server-startup-post-attach` › "re-enables startup-gated methods after post-attach sidecars start" timed out at 120 s (first test of a cold suite on a host at 100 % CPU) |
| infra                                       | 2      | 129     | 1      | `session.test.ts` › "hands the acknowledged new-id initialization to a fresh view of its original admission": "Agent database execution lost its native owner"            |
| acp                                         | 1      | 1       | 0      |                                                                                                                                                                           |
| cli                                         | 1      | 12      | 0      |                                                                                                                                                                           |
| auto-reply                                  | 1      | 18      | 3      | `commands-context-report.test.ts`: test cleanup fails with `EBUSY`/`ENOTEMPTY` deleting SQLite files that are still open (Windows file locking)                           |
| agents-support                              | 3      | 30      | 0      |                                                                                                                                                                           |
| plugins                                     | 3      | 56      | 0      |                                                                                                                                                                           |
| **Total**                                   | **19** | **411** | **5**  | 0 skipped                                                                                                                                                                 |

Durations: Run 1 31 min 17 s (17 min worker compile, gateway shard 10 min 39 s); Run 1b 13 min 26 s (compiled workers reused).

**Run 0** (2026-10-17, untouched code, same subset without the new files) found the first Windows problem: `server-startup-post-attach.test.ts` could not even load (`TypeError: File URL path must be absolute`, input `file:///openclaw-worker-free-test/entry.js`), while unit-fast (16/16), unit (32/32), and the other gateway files (19/19) passed. That run then ended with exit code 2 because `.github/workflows/plugin-npm-release.yml` was moved for fork safety while it was running; the Vitest worker compiler reads that file as a build asset. Both problems were fixed (F6 and the asset path in `scripts/lib/vitest-worker-build-entries.mts`).

**Static checks.** `oxfmt --check` and `oxlint` (plain and `--type-aware`) on every changed source and test file: clean. `pnpm docs:check-links`: 15,672 internal links, 0 broken. `pnpm docs:check-mdx`: pass (1,380 files). `pnpm format:docs:check`: pass after F16 (it could not run on Windows before). `pnpm tsgo:core`: pass (30 s). `pnpm tsgo:test:src` (21 type-check shards over `src/**` tests): pass (9 min 44 s).

**Results after the changes** (Run 2, same command and files plus `src/plugins/capability-lease.test.ts`, 2026-10-18, 16 min 7 s including a 3.4 min worker compile; then Run 3 for the one test file changed afterwards):

| Vitest project | Files  | Passed  | Failed | Before → after                                                                                                    |
| -------------- | ------ | ------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| unit-fast      | 1      | 16      | 0      | 16/0 → 16/0                                                                                                       |
| unit           | 2      | 32      | 0      | 32/0 → 32/0                                                                                                       |
| gateway        | 5      | 121     | 0      | 117/1 (+3 new: 1 pass, 2 fail) → 121/0; the cold-start timeout did not recur (32.8 s)                             |
| infra          | 2      | 130     | 0      | 129/1 → 130/0; the "native owner" failure did not recur                                                           |
| acp            | 1      | 1       | 0      | 1/0 → 1/0                                                                                                         |
| cli            | 1      | 15      | 0      | 12/0 (+3 new, all fail) → 15/0                                                                                    |
| auto-reply     | 1      | 21      | 0      | 18/3 → 18/3 in Run 2, 21/0 in Run 3 after the cleanup fix                                                         |
| agents-support | 3      | 32      | 0      | 30/0 (+2 new: 1 pass, 1 fail) → 32/0                                                                              |
| plugins        | 4      | 59      | 0      | 56/0 (+3 new: 1 pass, 2 fail) → 59/0                                                                              |
| **Total**      | **20** | **427** | **0**  | baseline 411 passed / 5 failed of 416 existing tests; 11 new tests (8 failing before the fixes); final 427 passed |

Run 3: `pnpm test src/auto-reply/reply/commands-context-report.test.ts --maxWorkers=1 --fsModuleCache` — 21/21 passed in 1 min 9 s; the same command on the original file: 3 failed (`EBUSY`), 18 passed. A last full run of the whole command after all edits is recorded below under [Final verification](#final-verification).

### Final verification

Run 4 (2026-10-18, after every code and documentation change, compiled workers reused): the same command plus `test/scripts/format-docs.test.ts` — **10 Vitest projects, 21 files, 433 tests, all passed, exit code 0, 6 min 8 s** (unit-fast 16, unit 32, tooling 6, gateway 121, infra 130, acp 1, cli 15, auto-reply 21, agents-support 32, plugins 59). Compared with the baseline, the 416 existing tests went from 411 passed / 5 failed to 416 passed, the 12 added tests (8 product regressions, 1 Windows formatter regression, 3 controls) all pass, and so do the 5 existing `format-docs` tests.

## Findings

Sources: careful reading of the core paths touched by recent upstream bug reports, the open upstream issues labeled `bug` that carry a source-level reproduction (`clawsweeper:source-repro`), the project's own linters (oxlint, oxfmt), and running the targeted suite on Windows.

| #   | Finding                                                                                                                                                                                                           | Severity                                                | Status                        | Evidence / test                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `createPluginRuntimeCapabilityLease().revoke()` stops at the first throwing cleanup; later cleanups never run and a retry is a no-op (original issue #175292)                                                     | Medium (resource leak on plugin service stop)           | Fixed                         | `src/plugins/capability-lease.test.ts` (new, 3 tests; 2 fail before)                                                                                                                           |
| F2  | Native-session binding lease `update()` retries compare-and-swap conflicts forever, bypassing `lease.waitMs` (original issue #175290)                                                                             | Medium (stuck bind/renew/release under contention)      | Fixed                         | `binding-leases.test.ts` › "ends repeated compare-and-swap conflicts at the lease wait budget" (fails before) and a transient-conflict control                                                 |
| F3  | ACP startup identity reconcile: `checked=0, failed=1` is swallowed by the caller's `checked === 0` early return (original issue #171958)                                                                          | Low (silent failure)                                    | Fixed                         | `server-startup-post-attach.test.ts` › "logs ACP startup identity reconcile counts after a failed scan" (fails before) and an empty-scan control                                               |
| F4  | Startup orphan workspace-result cleanup reports completion after a workspace-resolution failure, so the pass is dropped until restart (original issue #169209)                                                    | Low (leftover git refs)                                 | Fixed                         | `placement-dispatch-recovery-admission.test.ts` › "keeps the startup orphan pass pending after a transient workspace-resolution failure" (fails before)                                        |
| F5  | `openclaw attach` crashes with `RangeError: Invalid time value` on a finite but Date-invalid `expiresAtMs` (original issue #174524)                                                                               | Low (crash on malformed response)                       | Fixed                         | `attach-cli.action.test.ts` › 3 out-of-range cases (fail before); also asserts the grant is revoked                                                                                            |
| F6  | Gateway "worker-free" test fixture uses a POSIX-only file URL (`file:///openclaw-worker-free-test/entry.js`); on Windows `fileURLToPath` throws `ERR_INVALID_FILE_URL_PATH`, so three Gateway suites fail to load | Low (Windows developer experience; hides real coverage) | Fixed                         | Baseline run: `server-startup-post-attach.test.ts` fails at import on Windows; after the fix the suite loads and runs                                                                          |
| F7  | `commands-context-report.test.ts` deletes its temp directory while Windows still locks the SQLite files; 3 tests fail with `EBUSY`/`ENOTEMPTY` on every Windows run                                               | Low (Windows developer experience)                      | Fixed                         | Same single-file command: original 3 failed / 18 passed, fixed 21 passed                                                                                                                       |
| F8  | The Vitest worker compiler copies `.github/workflows/plugin-npm-release.yml` as a build asset, so moving that workflow broke every `pnpm test` run                                                                | High for a fork                                         | Fixed                         | Run 1 attempt 1 stopped with `ENOENT` in `vitest-worker-compiler.mts`; after the path update the worker bundle compiled                                                                        |
| F9  | `pnpm changelog:check` requires `CHANGELOG.md` to equal the generated upstream index, which conflicts with a prepended derivative section                                                                         | Low                                                     | Accepted; `docs.yml` disabled | Documented in `.github/workflows-disabled/README.md`                                                                                                                                           |
| F10 | Group `mentionPatterns` are stripped as substrings from slash-command arguments, corrupting paths (original issue #175734)                                                                                        | Medium                                                  | Documented, not changed       | Source reading of `commands-context.ts` and `mentions.ts`; workaround in the Portuguese guide                                                                                                  |
| F11 | Session-catalog transcript probe returns `undefined` for non-ENOENT open errors (original issue #173080)                                                                                                          | Low                                                     | Not changed                   | Needs deduplicated logging; see [What was not done](#what-was-not-done)                                                                                                                        |
| F12 | Upstream workflows publish, sign, use upstream secrets, or need upstream runners                                                                                                                                  | High for a fork (identity and credential risk)          | Mitigated                     | 108 workflows moved to `.github/workflows-disabled/`                                                                                                                                           |
| F13 | `.github/dependabot.yml` requires the upstream `NPM_NPMJS_TOKEN` secret                                                                                                                                           | Low                                                     | Fixed                         | Registry block removed                                                                                                                                                                         |
| F14 | Default daily update check to `telemetry.openclaw.ai`                                                                                                                                                             | Informational                                           | Documented                    | README Compatibility section; `docs/gateway/telemetry.md`                                                                                                                                      |
| F15 | `pnpm check:changed` may delegate to upstream Crabbox remote boxes and assumes an `origin/main` ref                                                                                                               | Low (fork DX)                                           | Documented                    | README/CONTRIBUTING recommend direct `oxfmt --check` and `oxlint` on changed files                                                                                                             |
| F16 | `pnpm format:docs:check` / `format:docs` fail on Windows with "The command line is too long": formatter batches allow 24 KiB, but the `oxfmt.cmd` shim runs through `cmd.exe` (8,191-character limit)             | Low (Windows developer experience)                      | Fixed                         | `test/scripts/format-docs.test.ts` › "keeps each Windows cmd.exe command line under its 8,191-character limit" (24,266 characters before); `pnpm format:docs:check` fails before, passes after |
| F17 | Maintainer-tooling tests, their fixtures, and four scripts read workflows by their old `.github/workflows/` path after the fork-safety move (F12)                                                                 | Medium for a fork (hides the tooling suites)            | Fixed                         | 1,783 tests in 134 files failed with `ENOENT` before, none after; see [Workflow paths for maintainer tooling](#workflow-paths-for-maintainer-tooling--f17)                                     |

## Improvements and verification

Each fix is the smallest change at the owner of the broken behavior, in the surrounding style. Regression tests were added first and run against the original code (Run 1 and Run 1b, expected to fail), then the fix was applied and the same command was re-run (Run 2, and Run 4 after all edits). The verification logs (`run1-before-fix.log`, `run1b-before-fix.log`, `run2-after-fix.log`, `run4-final.log`) were kept outside the repository; the relevant assertion messages are quoted below.

### 1. Capability lease revoke runs every cleanup — F1

- **Change:** `src/plugins/capability-lease.ts` (`revoke`). Each retained cleanup runs inside `try`/`catch`; after the loop a single failure is rethrown unchanged and several are thrown as one `AggregateError`. `active = false` still happens first, so retain-after-revoke fencing and one-shot `release()` are unchanged.
- **Why it matters:** `src/plugins/services.ts` revokes a service's lease in a `finally` during stop. With the old loop, one throwing cleanup left every later diagnostic subscription, HTTP route, or event listener attached, and because the lease was already inactive, nothing could release them.
- **Test:** new `src/plugins/capability-lease.test.ts` — a throwing cleanup retained before a real diagnostics subscription (`createPluginServiceDiagnostics`) must not keep `hasGatewayWorkMetricsListeners()` true; multiple failures surface as an `AggregateError` with both errors and no cleanup runs twice; a control keeps one-shot release and fencing.
- **Evidence:** Run 1b: `expected true to be false` (listener still attached) and `expected Error: first to be an instance of AggregateError` — 2 failed, 1 passed → Run 2: plugins project 4 files, 59/59 passed (including `http-registry`, `services`, `service-diagnostics.work`).

### 2. Binding lease conflict retries respect the wait budget — F2

- **Change:** `src/agents/harness/native-session/binding-leases.ts`. `update()` takes a monotonic `deadline` (default `performance.now() + lease.waitMs`); after a compare-and-swap refusal past the deadline it throws `errors.leaseTimeout(key)`. `transact()` passes its own deadline so busy waits and conflict retries share one budget. Renewal and release use the default budget and keep their existing error handling (lost lease / `onReleaseFailure`). Thrown or uncertain writes are still never replayed.
- **Test:** `binding-leases.test.ts` — a store whose `compareAndApply` always reports a conflict (each attempt yields 1 ms, with a 100-attempt safety cap) must reject with "Binding lease timed out" under `waitMs: 40`; a control with two transient conflicts still applies the write.
- **Evidence:** Run 1b: `expected [Function] to throw error including 'Binding lease timed out: binding' but got 'conflict retries ignored the lease wait budget'` (the safety cap fired after 100 unbounded retries) → Run 2: agents-support 3 files, 32/32 passed (including `binding-leases.worker` and `binding-lifecycle`).

### 3. ACP startup reconcile failures are logged — F3

- **Change:** `src/gateway/server-startup-post-attach.ts`. The early return now requires `checked === 0 && failed === 0`, so a scan that failed before checking anything reaches the existing `log.warn` with its counts. Empty scans stay quiet. No retry scheduler was added (the upstream review notes later ACP reads also reconcile).
- **Test:** `server-startup-post-attach.test.ts` — `it.each` over a failed scan (`checked=0 resolved=0 failed=1`, must warn once with those counts) and an empty scan (must not warn).
- **Evidence:** Run 1: `expected [] to deeply equal [ [ StringContaining "checked=0 resolved=0 failed=1" ] ]`; the empty-scan control passed → Run 2: gateway project 5 files, 121/121 passed.

### 4. Startup orphan cleanup stays pending after a resolution failure — F4

- **Change:** `src/gateway/worker-environments/placement-dispatch-orphan-cleanup.ts`. `complete` is declared before the workspace-resolution loop and set to `false` when `deps.resolveWorkspace` throws, so the caller keeps `orphanCleanupPending` and the next minute sweep retries, as the existing comment already promised.
- **Test:** `placement-dispatch-recovery-admission.test.ts` — with a real git checkout holding an orphan cleanup ref, workspace resolution fails during the first sweep and succeeds afterwards; the ref must survive the failed sweep and be deleted by the next one (without a restart).
- **Evidence:** Run 1: `expected 'refs/openclaw/worker-result-cleanup/orphan-claim' to be ''` after the second sweep → Run 2: gateway project 121/121 passed, including the existing 64-checkout orphan inventory test.

### 5. `openclaw attach` rejects Date-invalid expiries cleanly — F5

- **Change:** `src/cli/attach-cli.ts`. Inside the existing `try`/`finally` that owns grant revocation, the expiry is validated with the shared `asDateTimestampMs` helper; an invalid value throws a private `UnexpectedAttachGrantError`, which a new `catch` turns into the existing "attach.grant returned an unexpected response from the gateway." message and exit code 1. Every other error is rethrown unchanged, and the `finally` still revokes the grant.
- **Test:** `attach-cli.action.test.ts` — `it.each` over `8_640_000_000_000_001`, `-8_640_000_000_000_001`, and `1e16`: exit code 1, the diagnostic is printed, and exactly one `attach.revoke` call carries the grant token.
- **Evidence:** Run 1b: all three cases failed with `RangeError: Invalid time value` → Run 2: cli project 15/15 passed.

### 6. Windows-portable worker-free Gateway fixture — F6

- **Change:** `src/gateway/server-worker-free.test-support.ts` builds the inert worker URL with `pathToFileURL("/openclaw-worker-free-test/entry.js")`, which is the same `file:///openclaw-worker-free-test/entry.js` on POSIX and gains a drive letter on Windows.
- **Evidence:** Run 0: `server-startup-post-attach.test.ts` failed at import with `TypeError: File URL path must be absolute` → Run 1/Run 2: the suite loads and runs on Windows (89 tests in the file; `server-close.cleanup-scope` and `server-maintenance.telemetry`, which share the fixture, also pass).

### 7. Windows-safe SQLite cleanup in the `/context` report tests — F7

- **Change:** `src/auto-reply/reply/commands-context-report.test.ts` removes its temporary state directory with `rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })`. Node retries `EBUSY`, `ENOTEMPTY`, and `EPERM` only, so Linux and macOS behave as before.
- **Evidence:** `pnpm test src/auto-reply/reply/commands-context-report.test.ts --maxWorkers=1 --fsModuleCache` — original file: 3 failed (`EBUSY: resource busy or locked, unlink ...openclaw-agent.default.sqlite`), 18 passed; with the change: 21 passed. The same three tests had failed in Run 1b and Run 2.

### 8. Windows-sized formatter batches — F16

- **Change:** `scripts/lib/format-command-batches.mts` defaults to a 7 KiB batch budget on Windows (24 KiB elsewhere), which keeps every `cmd.exe /d /s /c oxfmt.cmd ...` line under 8,191 characters with room for the shim path. Both callers (`format-docs.mts` and `check-changed.mts`) benefit.
- **Evidence:** the new test failed before the change with `expected 24266 to be less than or equal to 8191` and passes after (`test/scripts/format-docs.test.ts` 6/6). The real command `pnpm format:docs:check` crashed before (`Linha de comando muito longa`, the Portuguese-locale cmd.exe message) and now exits 0 in 17 s. `test/scripts/changed-lanes.test.ts` has the same 5 failures with and without the change (63/68 vs 69/74 passing including the new file): they need a Git checkout with history and an `origin/main` ref, which this commit-less verification checkout does not have.

### Fork-safety change needed by the test runner — F8

Moving `plugin-npm-release.yml` out of `.github/workflows/` made the Vitest worker compiler fail before any test ran (`ENOENT ... .github/workflows/plugin-npm-release.yml` at `scripts/lib/vitest-worker-compiler.mts:412`). `scripts/lib/vitest-worker-build-entries.mts` first listed the asset at `.github/workflows-disabled/plugin-npm-release.yml`; it now asks `workflowRepoPath("plugin-npm-release.yml")` from `scripts/lib/workflow-path.mts` (F17), which returns that path while the workflow is parked and the original path if it is moved back. The next run compiled 16,679 inputs into 22,059 outputs and proceeded.

### Workflow paths for maintainer tooling — F17

- **Change:** new `scripts/lib/workflow-path.mts` with three functions: `resolveWorkflowPath(path)` returns a `.github/workflows/...` path unchanged when the file exists and the same path under `.github/workflows-disabled/` when only that exists; `workflowRepoPath(name)` does the same by file name; `listWorkflowFileNames()` lists the workflow files of both directories. Every reader of a moved workflow in `test/scripts/**` now goes through it: direct reads, the shared `readWorkflow` and `readTrackedText` in `test/scripts/ci-workflow.test-support.ts`, local readers, directory listings, and fixture copies (the copied file keeps its `.github/workflows/` path inside the fixture). Outside the tests it is used by `scripts/lib/vitest-worker-build-entries.mts` (F8), `scripts/plugin-npm-publication-readback.mjs`, `scripts/verify-pr-hosted-gates.mts` (the helper is added to `scripts/pr-lib/wrapper-components.txt`, the PR-wrapper inventory), `scripts/generate-ci-git-owner.mts`, and `scripts/docs-mirror-freshness.mjs`. Only path resolution changed: no assertion, expected value, or workflow was edited, and no workflow moved back. Three scripts were left alone because their tests copy them into fixtures that already provide the workflow at its original path (`ci-build-manifest.mjs`, `openclaw-release-ready.mjs`) or because they only run from a separate CI checkout (`find-reusable-release-child.mjs`).
- **Test set:** the 242 test files that read workflows, import a changed support module, or failed with a workflow `ENOENT` in a full run of `test/scripts`, `src/scripts`, and `test/openclaw-npm-postpublish-verify.test.ts`. Command (Git Bash, scratch toolchain on `PATH`): `OPENCLAW_NODE_TEST_PLAN_CONTINUE_ON_FAILURE=1 node scripts/test-projects.mts <the 242 files> --maxWorkers=4 --fsModuleCache`, first on the original files, then on the changed ones.
- **Evidence:**

| 242 files (4 Vitest projects) | Files failed / passed / skipped   | Tests failed / passed / skipped | Tests failing with `ENOENT` on a workflow                                                  |
| ----------------------------- | --------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| Before (18 min 31 s)          | 175 / 27 / 40 (50 could not load) | 2,965 / 3,338 / 1,920           | 1,783 in 134 files                                                                         |
| After (30 min 2 s)            | 111 / 85 / 46                     | 2,035 / 5,483 / 2,605           | 1 (fixed afterwards; that file then had 4 failed / 21 passed, all 4 also failing upstream) |

Test by test, no test that passed before fails after; 1,267 failing tests now pass, and 861 of the tests that could not even load before now pass. The full runs of `test/scripts` and `src/scripts` (about 1,090 files, 74 and 68 minutes) showed the same picture for workflow reads (1,781 failing tests in 133 files before, 3 after, fixed since), but their totals are not comparable run to run: `openclaw-cross-os-release-checks-upgrade-lane.test.ts` leaks `TEMP=C:\Users\RUNNER~1\AppData\Local\Temp` into the shared Vitest worker on Windows, so whichever files run after it fail with `ENOENT` on that path (1,305 tests in one run, 2,224 in the other). The 242-file set does not include that file.

- **Control:** the 111 files that still fail were run with the same command on an unmodified clone of the original project at the same commit (`406772b73f3b`), where every workflow is still in `.github/workflows/`. Of the 2,018 distinct failing tests, 1,876 fail there too (Windows host: `bash`/`jq`/`gh`/`tar` and POSIX shell fixtures, symlink `EPERM`, `--import` with a `C:\` path, path separators). Of the other 142, one was the last workflow read (fixed and re-run above) and 141 are explained under [Known limitations](#known-limitations).

## Rebrand and fork safety

**Renamed (project identity):** README title, tagline, banner (`docs/assets/cavaleiro-banner.svg`), badges, clone URL, issue and security links; `CONTRIBUTING.md`, `SECURITY.md`, issue forms, and the PR template now route to `cavaleiro-ai/cavaleiro-personal-agent`. The README states the origin, license, and non-affiliation in a single line under **License**; the community files no longer list the original project's contacts, community channels, maintainers, or contributors. The repository ships no `BRAND_GUIDELINES` or trademark file; the new name does not contain the original one.

**Kept (code identifiers):** the `openclaw` CLI and binary, `openclaw`/`@openclaw/*` package names and `openclaw/plugin-sdk/*` import paths (the root `package.json` author, homepage, repository, and issue links now point to Cavaleiro AI), `~/.openclaw` config and state paths, `OPENCLAW_*` environment variables, Gateway protocol and methods, `/__openclaw__/*` HTTP paths, plugin/skill/channel IDs, in-product names and icons in `apps/` and `ui/`, the code samples, identifiers, and links of the inherited `docs/` tree (its prose now names the product Cavaleiro Personal Agent), and the upstream telemetry endpoint. The default daily update check to `https://telemetry.openclaw.ai/api/latest-version` is documented in the README with its opt-out (`update.checkOnStart: false`) and override (`OPENCLAW_TELEMETRY_ENDPOINT`); it was not repointed.

**License and attribution:** `LICENSE` keeps the MIT text and the original copyright line verbatim, with the derivative notice and `Copyright (c) 2026 Cavaleiro AI (modifications in Cavaleiro Personal Agent)` added above. `THIRD_PARTY_NOTICES.md` and vendored license files are untouched. The README credits the original project in one line under **License**.

**Workflows:** 108 of 118 upstream workflows moved to `.github/workflows-disabled/` with a README that lists each one and the reason (publishing to npm/ClawHub/Docker Hub/GHCR/app stores/docs hosting, signing and notarization, OIDC and attestations, non-`GITHUB_TOKEN` secrets, Blacksmith/Crabbox/Testbox/release-group runners, upstream bots such as ClawSweeper, Mantis, labeler, stale, and auto-response). `docs.yml` was moved too: its `pnpm check:docs` includes `changelog:check`, which requires `CHANGELOG.md` to equal the generated upstream index, and it checks out `openclaw/clawhub`. Tooling that reads workflow files by path, its tests, and the Vitest worker build (which copies `plugin-npm-release.yml` as an asset) find them through `scripts/lib/workflow-path.mts` (F8, F17). Kept: `browser-mcp-contract`, `codeql`, `codeql-critical-quality`, `codeql-macos-critical-security`, `dependency-audit`, `docs-external-links`, `linux-app`, `node-runtime-compat`, `node-runtime-conformance`, `workflow-sanity`, all on GitHub-hosted runners with `GITHUB_TOKEN` only (CodeQL needs `security-events: write`). Their `github.repository == 'openclaw/openclaw'` conditions now name this repository; pinned action SHAs are unchanged, including the pinned `openclaw/openclaw/.github/actions/git-owner@88095dc` reference in `workflow-sanity.yml`. New `cavaleiro-ci.yml` runs format, lint, and the focused tests. `CODEOWNERS` is `* @cavaleiro-ai`; there was no `FUNDING.yml`; `dependabot.yml` no longer references the `NPM_NPMJS_TOKEN` secret. Bot configuration read only by disabled workflows (`labeler.yml`, `codex/`, `crabbox/`, `pr-proof/`, `release/`, `security-review-policy.yml`) is kept but inert.

## What was not done

- **Mention stripping corrupts slash-command arguments** (original issue #175734). Confirmed by reading `src/auto-reply/reply/commands-context.ts` and `mentions.ts`, but a correct fix has to keep stripping real addressing mentions in two producers (command context and session reset) and touches mention semantics used by every channel. With one test cycle taking close to an hour on the shared host, it was documented (with the boundary-aware pattern workaround) in the Portuguese guide instead of being changed.
- **Session-catalog transcript probe hides non-ENOENT errors** (original issue #173080). The upstream review prefers logging, but a per-probe warning would repeat on every monitor cycle for a permanently unreadable file; doing it well needs a rate-limited or deduplicated warning and changes to bundled plugin tests that pin the current value. Left for upstream.
- **Product decisions:** the cron failure-alert cooldown after a backward clock jump (original issue #170739), a corrupt restore journal during backup (original issue #169998), skill-upload lease renewal tolerance (original issue #173076), and security-audit binding resolution (original issue #175215) all have open maintainer questions; changing them would pick a policy for upstream.
- **Native apps** (macOS, iOS, Android, Windows Hub, Linux desktop) were not built, and in-product branding was not changed.
- **No dependency upgrades, reformatting, or refactors.** The inherited `docs/` tree was not rewritten beyond renaming the product in its prose.
- **The full test suite** (about 20,500 test files) was not run; see [Baseline](#baseline) for the targeted subset.

## Known limitations

- **Some maintainer-tooling tests still fail in this repository.** Resolved: the tests no longer depend on where a workflow lives. They read moved workflows through `scripts/lib/workflow-path.mts`, and no test fails with `ENOENT` on a workflow any more (1,783 tests in 134 files did; see [F17](#workflow-paths-for-maintainer-tooling--f17)). Remaining, in the 242 affected files on this host: 2,017 distinct failing tests (2,034 as Vitest counts them), after the last workflow read was fixed. They are left failing on purpose, without changing any assertion:
  - **1,876 also fail on the unmodified original project** at the same commit on this Windows host: the fixtures run POSIX shells, `jq`, `gh`, and `tar`, create symlinks (`EPERM`), pass `C:\` paths to `node --import`, or compare `/` paths. They are expected to pass on Linux and macOS, where upstream runs them.
  - **116 need Git history.** This checkout has no commits, so `git ls-files` lists no files (57,326 upstream) and `git rev-parse HEAD` fails; test inventories, changed-path plans, and the PR-wrapper closure check come out empty. They pass on the upstream clone.
  - **21 check the upstream CODEOWNERS** (`test/scripts/security-review-workflow.test.ts`, "security review ownership"): they expect the original project's security team as code owner, and this repository's `.github/CODEOWNERS` is `* @cavaleiro-ai`.
  - **4 check content this fork changed on purpose:** three expect `github.repository == 'openclaw/openclaw'` in kept workflows that now name `cavaleiro-ai/cavaleiro-personal-agent` (`ci-hourly.test.ts` and `ci-workflow-cost.test.ts` on `node-runtime-conformance.yml`, `ci-workflow-guards.test.ts` on the Node 26 minimum upload step), and one finds the fork's own `cavaleiro-ci.yml` without the upstream cache setup (`ci-workflow-guards.test.ts`, "keeps setup cache access explicit").

  None of these lanes is part of the product tests.

- **Windows is a secondary platform for source development.** Upstream CI qualifies Linux and macOS first; this release was verified on Windows 10 with a targeted subset only. The first Vitest run compiles a worker bundle from about 16,700 inputs (about 17 minutes on the loaded host), and two existing tests were flaky there under 100 % CPU load (a 120 s cold-start timeout in `server-startup-post-attach` and one "native owner" race in `session.test.ts`); both passed on re-run.
- **Do not edit files while `pnpm test` runs.** The runner re-verifies the hashed inputs of its compiled worker bundle at the end and fails with exit code 2 if any changed.
- **Updates and installers point upstream.** `openclaw update`, the original project's installers, npm, Docker, and app-store builds deliver the original project without these fixes.
- **The ACP fix changes only logging**; it does not add an in-process retry of the startup scan (the upstream review notes later ACP reads also reconcile identities).
- **Binding-lease renewal and release now share the wait budget.** Under conflicts that last longer than `lease.waitMs`, renewal records a lost lease and release reports through `onReleaseFailure`, instead of retrying indefinitely.

## Recommended next steps

1. Offer the five product fixes upstream as separate pull requests that reference the cited issues (each has a focused regression test), plus the three Windows developer-tooling fixes (F6, F7, F16).
2. Fix original issue #175734 with argument-preserving mention stripping in shared command preparation, covering the session-reset producer, with tests through the full command path.
3. Run `test/scripts` and `src/scripts` on Linux in GitHub Actions to confirm that the remaining tooling failures are Windows-only, and decide whether the fork-specific content (CODEOWNERS, the renamed repository conditions, `cavaleiro-ci.yml`) should get its own policy tests next to the upstream ones.
4. Run the full `pnpm test` on Linux in GitHub Actions (enable `ci.yml` with `OPENCLAW_CI_RUNNER_BACKEND=github`) and record the result.
5. Decide whether this distribution should publish its own packages; if so, configure new package names and credentials before re-enabling any release workflow.
