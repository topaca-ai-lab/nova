# Nova

Nova is an autonomous coding agent platform for local and hybrid AI workflows, built on the Edgent framework.

The repository contains a TypeScript monorepo with a production-grade CLI agent, provider abstraction layer, terminal UI, web UI components, and operational tooling.

## Core Packages

| Package | Purpose |
| --- | --- |
| `@nova-ai/nova-coding-agent` | Main CLI agent (`nova`) with tools, sessions, and local runtime support |
| `@nova-ai/nova-agent-core` | Agent loop, state, tool orchestration, transport abstractions |
| `@nova-ai/nova-ai` | Unified LLM provider layer and streaming interfaces |
| `@nova-ai/nova-tui` | High-performance terminal rendering primitives |
| `@nova-ai/nova-web-ui` | Reusable web components for chat-style AI interfaces |
| `@nova-ai/nova-mom` | Slack integration layer for delegated workflows |
| `@nova-ai/nova-pods` | GPU pod and vLLM operations CLI |

## Requirements

- Node.js `>=20`
- npm `>=10`
- macOS/Linux/WSL recommended for full CLI tooling

## Quick Start

```bash
npm install
npm run check
```

Build all workspace packages:

```bash
npm run build
```

Run development watchers:

```bash
npm run dev
```

## CLI Usage

The main CLI binary is `nova` (from `@nova-ai/nova-coding-agent`).

After package build or global installation:

```bash
nova --help
nova local doctor --json
nova local inspect --json
nova local bench run --json
```

## Configuration

Global agent configuration directory:

- `~/.nova/agent/`

Relevant files:

- `~/.nova/agent/settings.json`
- `~/.nova/agent/models.json`

Project-local overrides:

- `.nova/settings.json`

Local runtime defaults can also be configured through environment variables such as:

- `NOVA_LOCAL_BASE_URL`
- `NOVA_LOCAL_MODEL`
- `NOVA_LOCAL_BACKEND`
- `NOVA_LOCAL_API_KEY`

## Versioning

The monorepo uses lockstep versioning for publishable packages.

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

## License

Nova is dual-licensed:

- **AGPL-3.0** for open-source/community use
- **Commercial license** for proprietary and closed-source deployment scenarios
- **Third-party components** remain under their original licenses (see notices below)

For commercial licensing inquiries:

- hello@topaca.com

License and notice files:

- `LICENSE`
- `COMMERCIAL_LICENSE.md`
- `THIRD_PARTY_NOTICES.md`
- `LICENSES/MIT-pi-mono.txt`

## Maintainer

TOPACA AI-Lab  
Inhaber: Markus Ertel  
Eixendorf 50, 9064 Magdalensberg, Austria
