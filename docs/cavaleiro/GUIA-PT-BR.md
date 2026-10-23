# Guia do Cavaleiro Personal Agent (português)

Este guia explica o que é o **Cavaleiro Personal Agent**, como ele funciona por dentro, como instalar a partir do código-fonte no Windows, no macOS e no Linux, e como usar, configurar, diagnosticar e contribuir. O [README em português](https://github.com/cavaleiro-ai/cavaleiro-personal-agent/blob/main/README.pt-BR.md) traz o resumo; aqui está o passo a passo completo.

> O Cavaleiro Personal Agent é mantido pela Cavaleiro AI. O comando continua sendo `openclaw` e as configurações existentes do projeto original continuam valendo.

**Sumário:** [O que é e para quem](#o-que-é-e-para-quem) · [Arquitetura](#arquitetura) · [Instalação passo a passo](#instalação-passo-a-passo) · [Primeiros passos](#primeiros-passos) · [Exemplos práticos](#exemplos-práticos) · [Configuração](#configuração) · [Solução de problemas](#solução-de-problemas) · [Como contribuir](#como-contribuir)

## O que é e para quem

O Cavaleiro Personal Agent é um **assistente pessoal de IA que roda no seu computador** e conversa com você pelos aplicativos que você já usa: WhatsApp, Telegram, Slack, Discord, Microsoft Teams, Signal, iMessage, Google Chat e mais de vinte outros canais. Ele também tem uma interface web (Control UI), uma interface de terminal (TUI) e aplicativos complementares.

Diferente de um chatbot comum, ele **executa ações**: roda comandos no terminal, lê e edita arquivos, navega na web, agenda tarefas recorrentes (cron), guarda memória entre conversas e usa ferramentas e habilidades (skills) instaláveis. Os modelos de IA são plugins: você escolhe Claude, GPT, Gemini, modelos locais (llama.cpp, LM Studio, Ollama) ou dezenas de outros provedores.

É para você se:

- quer um assistente que trabalhe por você, e não só responda perguntas;
- prefere manter estado, memória e credenciais **no seu próprio hardware**;
- quer falar com o assistente pelo celular, em qualquer app de mensagens;
- é desenvolvedor e quer estender o assistente com plugins e skills em TypeScript.

O que esta distribuição acrescenta ao projeto original (`main` no commit `406772b73f3b`, versão de pacote `2026.10.4`):

- cinco correções de bugs verificadas com testes de regressão, mais três correções para desenvolvimento no Windows (testes do Gateway, testes do relatório `/context` e a checagem de formatação da documentação) (detalhes no [CHANGELOG](https://github.com/cavaleiro-ai/cavaleiro-personal-agent/blob/main/CHANGELOG.md) e no [relatório de engenharia](ENGINEERING.md));
- automação segura para fork (nada publica nem assina em nome do projeto original);
- este guia, o README em português e o relatório de engenharia.

## Arquitetura

O coração do sistema é o **Gateway**: um processo de longa duração que fica no seu computador (ou servidor) e coordena tudo. Clientes e canais se conectam a ele; ele chama os modelos e executa as ferramentas.

```text
  Apps de mensagem (WhatsApp, Telegram, Slack, Discord, ...)     Control UI · CLI · TUI · apps
                │ plugins de canal                                     │ WebSocket 127.0.0.1:18789
                ▼                                                      ▼
   ┌────────────────────────────────── Gateway (src/gateway) ──────────────────────────────────┐
   │  roteamento e sessões (src/routing, src/sessions)   respostas automáticas (src/auto-reply) │
   │  cron e automações (src/cron)   aprovações e segurança (src/security, src/secrets)        │
   │  estado em SQLite (src/state)   host de plugins (src/plugins, src/plugin-sdk)             │
   │                                                                                           │
   │  runtime do agente (src/agents, packages/agent-core) ──► provedores de modelo (src/llm,   │
   │      ferramentas, skills, memória, compactação            extensions/<provedor>)          │
   └───────────────────────────────────────────────────────────────────────────────────────────┘
                │ ferramentas: shell, arquivos, navegador, web, nós (câmera, tela, voz)
                ▼
        seu computador, sandboxes (Docker) e dispositivos pareados
```

| Componente            | Onde fica                                              | Responsabilidade                                                                         |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| CLI `openclaw`        | `openclaw.mjs`, `src/cli`, `src/commands`              | Comandos de instalação, onboarding, diagnóstico e operação                               |
| Gateway               | `src/gateway`                                          | Servidor WebSocket/HTTP, ciclo de vida, sidecars, autenticação de clientes               |
| Roteamento e sessões  | `src/routing`, `src/sessions`, `src/config/sessions`   | Decide qual agente atende cada mensagem e guarda o histórico                             |
| Respostas automáticas | `src/auto-reply`                                       | Comandos de barra (`/status`, `/model`, `/acp`), menções em grupos, entrega de respostas |
| Runtime do agente     | `src/agents`, `packages/agent-core`                    | Loop do agente, ferramentas, compactação de contexto, harnesses (nativo, Codex, ACP)     |
| Modelos               | `src/llm`, `extensions/<provedor>`                     | Transporte e catálogo de provedores (Anthropic, OpenAI, Google, locais, ...)             |
| Canais                | `src/channels`, `extensions/<canal>`                   | Integrações de mensagem (Telegram, WhatsApp, Slack, Discord, ...)                        |
| Plugins e SDK         | `src/plugins`, `src/plugin-sdk`, `packages/plugin-sdk` | Carregamento, contratos públicos `openclaw/plugin-sdk/*`, leases de capacidade           |
| Estado                | `src/state`, `src/storage`                             | Bancos SQLite com workers dedicados; o Gateway é o dono de todo o estado                 |
| Interfaces            | `ui/` (Control UI em Solid), `src/tui`                 | Painel web e interface de terminal                                                       |
| Apps nativos          | `apps/`                                                | macOS, iOS, Android, Linux (não são compilados neste guia)                               |

**Fluxo de uma mensagem:** o canal recebe a mensagem → o roteador escolhe agente e sessão → o auto-reply trata comandos e menções → o runtime do agente monta o contexto, chama o modelo e executa as ferramentas pedidas (respeitando aprovações e sandbox) → a resposta volta pelo mesmo canal.

**Pontos de extensão:** plugins (`extensions/*`, publicados no ClawHub), skills (`skills/*` e `~/.openclaw/workspace/skills`), harnesses de agente, hooks internos e servidores MCP.

**Testes:** Vitest 5, com projetos separados por área em `test/vitest/*.config.ts`. `pnpm test <arquivo>` escolhe o projeto certo automaticamente. A seção [Baseline](ENGINEERING.md#baseline) do relatório de engenharia lista os comandos exatos usados nesta versão.

## Instalação passo a passo

Esta distribuição é instalada **a partir do código-fonte**. Os instaladores do projeto original, o pacote npm `openclaw`, as imagens Docker e os apps das lojas instalam o projeto original, sem as correções desta distribuição.

Requisitos comuns:

- **Node.js 24.16 ou mais novo (linha 24 LTS) ou 26.1+** — Node 22, 23 e 25 não são suportados;
- **pnpm 12.11.1**, obtido pelo **Corepack** (vem junto com o Node 24, sem instalação global);
- **Git**;
- cerca de **5 GB livres** para o código e as dependências.

O histórico Git do projeto é muito grande. Clone só o último commit com `--depth 1`.

### Windows 10/11

1. Instale o Git for Windows (<https://git-scm.com/download/win>) e o Node.js 24 LTS (<https://nodejs.org>). Confira no PowerShell:

   ```powershell
   node --version   # deve mostrar v24.16.0 ou mais novo
   git --version
   ```

2. Clone o repositório. O projeto tem caminhos longos, então ative `core.longpaths` **só para este clone**:

   ```powershell
   git -c core.longpaths=true clone --depth 1 https://github.com/cavaleiro-ai/cavaleiro-personal-agent.git
   cd cavaleiro-personal-agent
   git config core.longpaths true
   ```

3. Instale as dependências e compile:

   ```powershell
   corepack pnpm install --frozen-lockfile
   corepack pnpm build
   corepack pnpm ui:build
   ```

   Na primeira vez o Corepack baixa o pnpm 12.11.1 e pode pedir confirmação; responda `Y`.

4. Alternativa: se preferir rodar o Gateway dentro do Linux, use o **WSL2** (Ubuntu) e siga a seção [Linux](#linux) dentro do WSL.

**Não quer mexer no Node instalado na máquina?** Baixe o zip do Node (por exemplo `node-v24.21.0-win-x64.zip` em <https://nodejs.org/dist/>), extraia numa pasta sua e, **apenas na sessão atual do PowerShell**, coloque-a no início do `PATH`:

```powershell
$env:Path = "C:\ferramentas\node-v24.21.0-win-x64;" + $env:Path
node --version
```

Nada é instalado globalmente e o `PATH` do sistema não muda.

### macOS

1. Instale as ferramentas de linha de comando da Apple (`xcode-select --install`) e o Node.js 24 LTS ou 26 (pelo instalador de <https://nodejs.org>, por Homebrew com `brew install node@24`, ou por nvm/fnm).
2. Clone, instale e compile:

   ```bash
   git clone --depth 1 https://github.com/cavaleiro-ai/cavaleiro-personal-agent.git
   cd cavaleiro-personal-agent
   corepack pnpm install --frozen-lockfile
   corepack pnpm build
   corepack pnpm ui:build
   ```

3. Na primeira execução, o macOS pode pedir permissões (rede, acesso a pastas, Ferramentas de Linha de Comando). Elas são necessárias para o Gateway e as ferramentas.

### Linux

1. Instale Git e Node.js 24 LTS ou 26 (pelo gerenciador de versões `nvm`/`fnm`, pelos pacotes do NodeSource ou pelo tarball oficial). Em Ubuntu/Debian também instale `build-essential` e `python3`, usados por algumas dependências nativas.
2. Clone, instale e compile:

   ```bash
   git clone --depth 1 https://github.com/cavaleiro-ai/cavaleiro-personal-agent.git
   cd cavaleiro-personal-agent
   corepack pnpm install --frozen-lockfile
   corepack pnpm build
   corepack pnpm ui:build
   ```

3. Para manter o Gateway rodando como serviço do usuário (systemd), use `--install-daemon` no onboarding (próxima seção).

## Primeiros passos

Todos os comandos abaixo rodam na pasta do repositório. Num checkout do código-fonte, prefixe o comando `openclaw` com `corepack pnpm`.

1. **Onboarding** — escolhe o modelo, valida a credencial, cria o workspace e configura o Gateway:

   ```bash
   corepack pnpm openclaw onboard --install-daemon
   ```

   Sem `--install-daemon`, o Gateway não é instalado como serviço; você pode rodá-lo em primeiro plano com `node openclaw.mjs gateway --port 18789 --verbose`.

2. **Confira o Gateway e abra o painel:**

   ```bash
   corepack pnpm openclaw gateway status
   corepack pnpm openclaw dashboard
   ```

   O `dashboard` abre a Control UI no navegador. Envie uma mensagem para confirmar que o assistente responde.

3. **Conecte um canal** (exemplo: Telegram, com o token do BotFather):

   ```bash
   corepack pnpm openclaw channels add --channel telegram --token <token-do-bot>
   ```

4. **Aprove quem pode falar com o assistente.** Por padrão, remetentes desconhecidos recebem um código de pareamento. Aprove com:

   ```bash
   corepack pnpm openclaw pairing approve telegram <codigo>
   ```

5. **Diagnóstico rápido** a qualquer momento:

   ```bash
   corepack pnpm openclaw status
   corepack pnpm openclaw doctor
   ```

## Exemplos práticos

**Trocar o modelo padrão:**

```bash
corepack pnpm openclaw models set anthropic/claude-sonnet-4-6
```

Dentro de uma conversa, `/model` mostra e troca o modelo da sessão.

**Ver os logs do Gateway em tempo real:**

```bash
corepack pnpm openclaw logs --follow
```

**Mudar a frequência do heartbeat (checagens periódicas do agente):**

```bash
corepack pnpm openclaw config set agents.defaults.heartbeat.every "2h"
```

**Usar o assistente num grupo do Telegram** — em grupos, o agente responde quando é mencionado. Configure os padrões de menção do agente principal em `~/.openclaw/openclaw.json`:

```json5
{
  agents: {
    entries: {
      main: { groupChat: { mentionPatterns: ["@cavaleiro"] } },
    },
  },
}
```

Dica: prefira padrões com `@` ou com limites de palavra. Um nome simples como `norma` também casa dentro de caminhos de arquivo enviados em comandos de barra (`/acp spawn ... --cwd /Users/eu/norma/projeto`) — veja o issue original #175734.

**Conectar uma ferramenta externa à sessão (Claude Code via MCP):**

```bash
corepack pnpm openclaw attach --session agent:main:main
```

O `attach` pede ao Gateway uma concessão temporária e abre o Claude Code ligado à sessão. Nesta distribuição, uma concessão com data de expiração inválida gera a mensagem de erro normal e é revogada, em vez de derrubar o comando.

## Configuração

| O quê                                          | Onde                                                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Configuração principal                         | `~/.openclaw/openclaw.json` (JSON5: aceita comentários e vírgulas finais)                                                        |
| Workspace do agente (skills, prompts, memória) | `~/.openclaw/workspace/` — vale versionar num repositório Git privado                                                            |
| Estado (sessões, transcrições, cron)           | Bancos SQLite em `~/.openclaw/`                                                                                                  |
| Variáveis de ambiente                          | `OPENCLAW_*` (por exemplo `OPENCLAW_TELEMETRY_ENDPOINT`) e as chaves dos provedores (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ...) |
| Porta padrão do Gateway                        | `18789` em `127.0.0.1`                                                                                                           |

Comandos úteis:

```bash
corepack pnpm openclaw config get agents.defaults.model --json
corepack pnpm openclaw config set <caminho> <valor>
corepack pnpm openclaw configure          # assistente interativo
```

Exemplo de trecho de configuração com modelo principal, fallback e política de DMs:

```json5
{
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-4-6", fallbacks: ["openai/gpt-5.4"] },
    },
  },
  channels: {
    telegram: { enabled: true, dmPolicy: "pairing" }, // pairing | allowlist | open | disabled
  },
}
```

**Verificação de atualização e telemetria:** o código herdado faz, por padrão, **uma requisição diária** a `https://telemetry.openclaw.ai/api/latest-version` para saber se há versão nova (envia versão, sistema operacional, versão do Node e arquitetura no `User-Agent`, sem identificadores). Estatísticas anônimas de uso são **desligadas** por padrão. Para desligar tudo:

```bash
corepack pnpm openclaw config set update.checkOnStart false
```

Os detalhes estão em [docs/gateway/telemetry.md](../gateway/telemetry.md). Esta distribuição não adiciona nem redireciona telemetria.

**Segurança:** trate toda mensagem recebida como entrada não confiável. As ferramentas rodam no host para a sessão principal, a menos que você configure sandbox (Docker). Leia [docs/gateway/security](../gateway/security/index.md) e [docs/gateway/sandboxing.md](../gateway/sandboxing.md) antes de expor o Gateway na rede ou conectar outras pessoas.

## Solução de problemas

| Sintoma                                                      | Causa provável                                         | O que fazer                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `Node ... is unsupported; OpenClaw requires ...`             | Node antigo (22, 23, 25 ou 24 abaixo de 24.16)         | Instale Node 24.16+ ou 26.1+; veja a alternativa sem instalação global na seção do Windows                                        |
| `pnpm install` reclama da versão do pnpm                     | pnpm global diferente de 12.11.1                       | Use `corepack pnpm ...`, que respeita a versão fixada em `package.json`                                                           |
| `npm install` na raiz falha                                  | O repositório é um workspace pnpm                      | Use somente `corepack pnpm install --frozen-lockfile`                                                                             |
| `Filename too long` no Windows durante o clone               | Caminhos longos                                        | Clone com `git -c core.longpaths=true clone --depth 1 ...`                                                                        |
| Testes demoram muitos minutos na primeira vez                | O Vitest compila um grafo grande de módulos            | Normal; rode arquivos específicos e use `--fsModuleCache` para reaproveitar entre execuções                                       |
| `Cannot find package '@solidjs/vite-plugin'` ao rodar testes | Instalação parcial (com `--filter`)                    | Rode `corepack pnpm install --frozen-lockfile` sem filtro                                                                         |
| A porta 18789 já está em uso                                 | Outro Gateway rodando                                  | `corepack pnpm openclaw gateway status`; pare o serviço antigo ou use `--port`                                                    |
| O canal não responde                                         | Pareamento pendente, token inválido ou Gateway parado  | `corepack pnpm openclaw doctor`, `corepack pnpm openclaw logs --follow`, `corepack pnpm openclaw pairing list telegram`           |
| Aviso `acp startup identity reconcile ... failed=1` no log   | A varredura de identidades ACP falhou na inicialização | Normalmente transitório; verifique o banco de sessões com `openclaw doctor` (nesta distribuição o aviso deixou de ser silenciado) |
| `openclaw update` instala outra coisa                        | O update segue os canais do projeto original           | Atualize com `git pull` e `corepack pnpm install --frozen-lockfile`                                                               |

Ainda com problemas? Abra um issue com o formulário de bug: <https://github.com/cavaleiro-ai/cavaleiro-personal-agent/issues/new/choose>. Não cole chaves, tokens nem conteúdo de conversas.

## Como contribuir

1. Leia o [CONTRIBUTING.md](https://github.com/cavaleiro-ai/cavaleiro-personal-agent/blob/main/CONTRIBUTING.md) e o [Código de Conduta](https://github.com/cavaleiro-ai/cavaleiro-personal-agent/blob/main/CODE_OF_CONDUCT.md).
2. Abra um issue descrevendo o problema (ou use um existente).
3. Faça a mudança mínima, no estilo do código ao redor. **Não renomeie** o comando `openclaw`, os pacotes, os caminhos `~/.openclaw`, as variáveis `OPENCLAW_*` nem os IDs de plugins.
4. Para bugs, escreva um teste de regressão que **falha antes** e **passa depois** da correção:

   ```bash
   corepack pnpm test <arquivo-de-teste> --maxWorkers=1
   corepack pnpm exec oxfmt --check <arquivos-alterados>
   corepack pnpm exec oxlint <arquivos-alterados>
   git diff --check
   ```

5. Registre a mudança na seção Cavaleiro do [CHANGELOG.md](https://github.com/cavaleiro-ai/cavaleiro-personal-agent/blob/main/CHANGELOG.md) e atualize o [README.pt-BR.md](https://github.com/cavaleiro-ai/cavaleiro-personal-agent/blob/main/README.pt-BR.md) e este guia junto com o `README.md` quando o texto para usuários mudar.
6. Abra o pull request preenchendo o template. Vulnerabilidades vão por canal privado: <https://github.com/cavaleiro-ai/cavaleiro-personal-agent/security/advisories/new>.
