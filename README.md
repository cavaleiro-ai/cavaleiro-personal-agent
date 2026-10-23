**English** · [Português (Brasil)](README.pt-BR.md)

<a id="top"></a>

<p align="center">
  <img src="docs/assets/cavaleiro-banner.svg" alt="Cavaleiro Personal Agent — a personal AI assistant that takes action on any platform." width="1600">
</p>

# Cavaleiro Personal Agent

**The AI that really does things. Any OS. Any Platform.**

Cavaleiro Personal Agent is a personal AI assistant that runs on your own computer and meets you in the chat apps you already use: Discord, iMessage, Slack, Teams, Telegram, WhatsApp, and 20+ more, plus a web Control UI, a terminal UI, and companion apps. It keeps the architecture, commands, configuration, and plugin ecosystem of the project it is based on; this distribution adds verified bug fixes, a Portuguese guide, an engineering report, and fork-safe automation.

<p align="center">
  <a href="https://github.com/cavaleiro-ai/cavaleiro-personal-agent/actions/workflows/cavaleiro-ci.yml"><img src="https://github.com/cavaleiro-ai/cavaleiro-personal-agent/actions/workflows/cavaleiro-ci.yml/badge.svg" alt="Cavaleiro CI status"></a>
  &nbsp;
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License: MIT"></a>
  &nbsp;
  <a href="CHANGELOG.md"><strong>Changelog</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/cavaleiro/ENGINEERING.md"><strong>Engineering report</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/cavaleiro/GUIA-PT-BR.md"><strong>Guia em português</strong></a>
</p>

**Yours, with no catch.** State, memory, and credentials live on your hardware. Models and agent harnesses (Claude, Codex, local models) are plugins you can swap without changing anything else. Your prompts go to the model provider and chat platforms you configure. See [Compatibility](#compatibility) for the one request the inherited code makes by default (a daily update check) and how to turn it off.

**On this page:** [Install](#install) · [Quick start](#quick-start) · [How it fits together](#how-it-fits-together) · [Security](#security) · [Documentation](#documentation) · [Development](#development) · [What Cavaleiro Personal Agent adds](#what-cavaleiro-personal-agent-adds) · [Compatibility](#compatibility) · [License](#license)

## Install

This distribution is installed **from source**. It does not publish its own npm package, Docker image, installer script, or desktop/mobile builds, so the package registries and installers you may find online belong to the original project (see [Compatibility](#compatibility)).

Requirements:

- **Node.js 24.16+ (LTS) or 26.1+** (26 recommended). Node 22, 23, and 25 are not supported.
- **pnpm 12.11.1**, the version pinned in `package.json`. The simplest way to get it without a global install is Corepack, which ships with Node 24: `corepack pnpm --version`.
- **Git**, and on Windows either PowerShell or Git Bash. WSL2 also works.

```bash
git clone --depth 1 https://github.com/cavaleiro-ai/cavaleiro-personal-agent.git
cd cavaleiro-personal-agent
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm ui:build
```

Plain `npm install` at the repository root is not supported: the repository is a pnpm workspace with about 180 bundled plugin packages under `extensions/`. A full install takes a few minutes and a few gigabytes of disk. The Git history is very large, so clone with `--depth 1`; on Windows, add `-c core.longpaths=true` to the clone command because some paths are long.

Prefer to keep Node and pnpm out of your global environment? Download a Node.js zip/tarball into a folder of your choice, put that folder first on `PATH` for the current shell only, and run `corepack enable --install-directory <folder> pnpm`. The [Portuguese guide](docs/cavaleiro/GUIA-PT-BR.md#instalação-passo-a-passo) walks through this on Windows, macOS, and Linux.

## Quick start

From the repository root, run the CLI through pnpm (the command is still `openclaw`):

```bash
corepack pnpm openclaw onboard --install-daemon
```

After onboarding:

```bash
corepack pnpm openclaw gateway status
corepack pnpm openclaw dashboard
```

Onboarding verifies model access, creates the workspace (`~/.openclaw/workspace`), writes the config (`~/.openclaw/openclaw.json`), and configures the Gateway. The last command opens the Control UI; send a message there to confirm the assistant is working. To run the Gateway in the foreground instead of as a service, use `node openclaw.mjs gateway --port 18789 --verbose` after `pnpm build`.

The inherited [getting started guide](docs/start/getting-started.md) covers channel setup and troubleshooting in depth; every command there works the same way in this distribution when prefixed with `corepack pnpm` from a source checkout.

## How it fits together

```text
 Chat apps (WhatsApp, Telegram, Slack, Discord, ...)      Control UI · CLI · TUI · companion apps
                 │  channel plugins                                   │  WebSocket (127.0.0.1:18789)
                 ▼                                                    ▼
        ┌──────────────────────────────── Gateway ─────────────────────────────────┐
        │ sessions & routing · auto-reply · cron · approvals · SQLite state        │
        │ plugin host (providers, channels, tools, memory, skills)                 │
        │ agent runtime (src/agents) ──► model providers (src/llm, extensions/*)   │
        └───────────────────────────────────────────────────────────────────────────┘
                 │  tools: shell, files, browser, web, nodes (camera, screen, ...)
                 ▼
          your machine, sandboxes, and paired devices
```

- The [Gateway](docs/gateway/index.md) is the local control plane for sessions, tools, events, and channel connections.
- The [Control UI](docs/web/control-ui.md), CLI, and [TUI](docs/web/tui.md) connect to the Gateway.
- [Channels](docs/channels/index.md) bring the assistant to WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, and other messaging services.
- [Companion apps and nodes](docs/platforms/index.md) add voice, Canvas, camera, screen, and device-local actions on supported platforms.

It works with hosted and local [model providers](docs/concepts/model-providers.md). Its [tools](docs/tools/index.md), [skills](docs/tools/skills.md), and [plugins](docs/tools/plugin.md) extend what an assistant can do. The [engineering report](docs/cavaleiro/ENGINEERING.md#architecture-map) has a source-level architecture map.

## Security

Treat inbound messages as untrusted input. DM-capable channels pair unknown senders by default; approve a pairing request with `openclaw pairing approve <channel> <code>`.

Tools run on the host for the main session unless you configure sandboxing. Read the [security guide](docs/gateway/security/index.md), [exposure runbook](docs/gateway/security/exposure-runbook.md), and [sandboxing guide](docs/gateway/sandboxing.md) before connecting other users or exposing the Gateway remotely. Report bugs in [GitHub issues](https://github.com/cavaleiro-ai/cavaleiro-personal-agent/issues) and vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Documentation

The `docs/` folder is the inherited technical documentation, with the product renamed to Cavaleiro Personal Agent in its prose. It describes this codebase accurately; only installers, release channels, and hosted services differ, as listed under [Compatibility](#compatibility).

| Goal                             | Start here                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read about this distribution     | [Guia em português](docs/cavaleiro/GUIA-PT-BR.md) · [Engineering report](docs/cavaleiro/ENGINEERING.md) · [Changelog](CHANGELOG.md)                                         |
| Configure models and auth        | [Models](docs/concepts/models.md) · [Model providers](docs/concepts/model-providers.md)                                                                                     |
| Connect a messaging service      | [Channels](docs/channels/index.md)                                                                                                                                          |
| Add tools, skills, and plugins   | [Tools](docs/tools/index.md) · [Skills](docs/tools/skills.md) · [Plugins](docs/tools/plugin.md)                                                                             |
| Run apps and device nodes        | [Platforms](docs/platforms/index.md) · [Nodes](docs/nodes/index.md)                                                                                                         |
| Use the CLI and chat commands    | [CLI reference](docs/cli/index.md) · [Slash commands](docs/tools/slash-commands.md)                                                                                         |
| Configure or operate the Gateway | [Configuration](docs/gateway/configuration.md) · [Architecture](docs/concepts/architecture.md) · [Source setup](docs/start/setup.md) · [Windows](docs/platforms/windows.md) |

## Development

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm test src/plugins/capability-lease.test.ts --maxWorkers=1   # one focused file
corepack pnpm exec oxfmt --check <changed files>                         # formatting
corepack pnpm exec oxlint <changed files>                                # lint
```

`pnpm test <file>` routes each file to its Vitest project. The first run on a machine compiles a large module graph and can take several minutes; add `--fsModuleCache` to reuse transforms between runs. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and the inherited [test suite guide](docs/help/testing/suites.md) for the full matrix.

## What Cavaleiro Personal Agent adds

Everything from the original project's `main` at commit `406772b73f3b` (package version `2026.10.4`, 2026-10-17), plus:

- **Plugin capability leases release everything they hold.** Revoking a plugin's capability lease now runs every retained cleanup even when an earlier one throws, so diagnostics subscriptions, HTTP routes, and event listeners are not left attached after a plugin service stops ([changelog](CHANGELOG.md#fixed)).
- **Contended native-session binding writes respect their wait budget.** Repeated compare-and-swap conflicts on a native session binding now end with the documented lease-timeout error instead of retrying forever ([changelog](CHANGELOG.md#fixed)).
- **ACP startup reconcile failures are visible.** When the startup scan for pending ACP session identities fails before checking any session, the Gateway now logs the failure instead of staying silent ([changelog](CHANGELOG.md#fixed)).
- **Startup orphan cleanup survives transient errors.** A workspace-resolution failure keeps the startup cleanup pass pending, so leftover workspace-result refs are reclaimed by the next sweep instead of waiting for a restart ([changelog](CHANGELOG.md#fixed)).
- **`openclaw attach` fails cleanly on a malformed grant.** An `attach.grant` expiry outside the JavaScript date range now prints the normal diagnostic, exits with code 1, and still revokes the grant instead of crashing with `RangeError` ([changelog](CHANGELOG.md#fixed)).
- **More of the test suite runs on Windows.** A POSIX-only file URL in a shared fixture kept three Gateway test suites from loading on Windows, the `/context` report tests failed while deleting SQLite files Windows still had locked, and `pnpm format:docs:check` crashed with "command line too long"; all three now work on Windows ([changelog](CHANGELOG.md#fixed)).
- **Fork-safe automation.** Workflows that publish, sign, use upstream secrets, or need upstream runners moved to [`.github/workflows-disabled/`](.github/workflows-disabled/README.md); a small [Cavaleiro CI](.github/workflows/cavaleiro-ci.yml) workflow runs on GitHub-hosted runners with a read-only token ([changelog](CHANGELOG.md#changed)).
- **Documentation for this distribution:** a complete [Portuguese guide](docs/cavaleiro/GUIA-PT-BR.md), an [engineering report](docs/cavaleiro/ENGINEERING.md) with the architecture map, baseline, findings, and evidence, plus [contributing](CONTRIBUTING.md), [security](SECURITY.md), and [code of conduct](CODE_OF_CONDUCT.md) files and issue forms for this repository ([changelog](CHANGELOG.md#added)).

## Compatibility

Cavaleiro Personal Agent renames the **project**, not the code. Everything you script against, configure, or install keeps its upstream identifier, so existing guides, plugins, and skills work unchanged:

| Kept as upstream                   | Value                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| CLI command                        | `openclaw` (for example `openclaw onboard`, `openclaw gateway`, `openclaw doctor`)     |
| npm package and workspace packages | `openclaw`, `@openclaw/*`, and `openclaw/plugin-sdk/*` import paths                    |
| Config and state                   | `~/.openclaw/openclaw.json`, `~/.openclaw/workspace`, `~/.openclaw/` state directories |
| Environment variables              | `OPENCLAW_*` (for example `OPENCLAW_TELEMETRY_ENDPOINT`, `OPENCLAW_SKIP_CHANNELS`)     |
| Gateway protocol and ports         | WebSocket protocol, method names, default port `18789`, `/__openclaw__/*` HTTP paths   |
| Plugin, skill, and channel IDs     | Unchanged, so ClawHub and third-party plugins keep loading                             |
| In-product names and icons         | The apps, Control UI, and CLI still show the original project's name                   |
| `docs/` commands and links         | Code samples keep upstream identifiers; site links still point to the original docs    |

What that means in practice:

- **`npm install -g openclaw`, the original project's installer scripts, Docker images, and app-store or desktop builds install the original project**, not this distribution. Build from source as shown in [Install](#install) to run the fixes listed above.
- **`openclaw update` follows upstream release channels.** On a source checkout, update with `git pull` and `corepack pnpm install --frozen-lockfile` instead.
- **Update checks are on by default and go to upstream.** The inherited code sends one daily request to `https://telemetry.openclaw.ai/api/latest-version` with the package version, OS, Node.js version, and CPU architecture in the `User-Agent` (no body or identifiers); anonymous feature statistics are opt-in. Set `update.checkOnStart: false` to disable both, or `OPENCLAW_TELEMETRY_ENDPOINT` to point the check at your own server. Details: [Usage telemetry and update checks](docs/gateway/telemetry.md). This distribution does not repoint or add telemetry.
- Existing configuration, state, and workspaces from the original project work as is: this distribution reads and migrates them exactly like the original project at the same commit. Moving back to an older upstream release is a downgrade, with the same caveats as upstream.

## License

Based on OpenClaw · MIT License · see [LICENSE](LICENSE). Not affiliated with the original project.

<p align="center"><a href="#top">Back to top ↑</a></p>
