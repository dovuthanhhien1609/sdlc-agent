# SDLC Agent

An AI-powered engineering workflow extension for VS Code that guides developers through a structured Software Development Life Cycle — from raw idea to reviewed, shippable code.

> **This is not a chat tool.** It is a guided, state-driven system that enforces good engineering practices.

---

## Demo

[![Watch the demo](https://img.youtube.com/vi/-Z3vj_H2C3w/maxresdefault.jpg)](https://youtu.be/-Z3vj_H2C3w)

---

## Why SDLC Agent?

Developers routinely jump from vague requirements directly to code. The result is predictable: rework when requirements are misunderstood, architecture decisions made ad hoc mid-implementation, and tests written as an afterthought.

Chat-based AI tools make this worse — they are infinitely flexible, which means they impose no structure and produce no durable artifacts.

SDLC Agent is different:

| | Chat Tool | SDLC Agent |
|---|---|---|
| State | Stateless — you re-explain context every session | Persistent, phase-aware, full context carried forward |
| Structure | Freeform | Opinionated phases with gating — you cannot implement before you design |
| Output | Prose in a chat window | Structured, versioned, exportable documents per phase |
| Auditability | None | Full history: approvals, LLM outputs, user edits |

---

## The Six Phases

Each session progresses through six sequential phases. Every phase produces a structured document that feeds into the next.

```
Requirement → Design → Task Breakdown → Implementation → Testing → Review
```

| Phase | Purpose | Output |
|---|---|---|
| **Requirement** | Transform a vague idea into a structured requirements contract | `RequirementDocument` |
| **Design** | Translate requirements into a technical architecture | `DesignDocument` |
| **Task Breakdown** | Decompose the design into atomic, implementable tasks | `TaskList` |
| **Implementation** | AI-guided per-task execution with workspace context | `ImplementationState` |
| **Testing** | Generate a comprehensive test plan tied to requirements | `TestPlan` |
| **Review** | Final coverage audit: requirements → tasks → tests | `ReviewReport` |

Phases are gated. You cannot advance until the current phase is approved. You can re-open any approved phase, but doing so invalidates all downstream phases (with a confirmation prompt).

---

## Features

- **Guided SDLC workflow** — six structured phases enforced by a state machine
- **AI assistance at every phase** — LLM generates structured output per phase, not freeform chat
- **Schema-validated output** — all LLM responses are parsed and validated; invalid output triggers automatic correction retries
- **Persistent sessions** — sessions survive VS Code restarts; stored in workspace state and `.sdlc/` files
- **Workspace-aware** — detects your tech stack (package.json, go.mod, etc.) to provide relevant context
- **Mermaid diagrams** — sequence flows in the Design phase rendered inline
- **Drag-and-drop task ordering** — reorder tasks in the Task Breakdown phase
- **Requirement traceability** — every task and test case links back to a requirement

---

## Getting Started

### 1. Configure your API key

Open the command palette (`Cmd+Shift+P`) and run:

```
SDLC: Set API Key
```

Your key is stored in VS Code's SecretStorage — never in files or settings.

### 2. Create a session

```
SDLC: New Session
```

Give it a name (e.g., "User Authentication") and describe the feature you want to build.

### 3. Work through the phases

The extension opens a panel with a phase stepper at the top. At each phase:

1. Click **Generate** — the LLM produces structured output
2. Review and edit the output inline
3. Click **Approve & Continue** — the next phase unlocks

---

## Commands

| Command | Description |
|---|---|
| `SDLC: New Session` | Create a new feature session |
| `SDLC: Open Session` | Open an existing session |
| `SDLC: Rename Session` | Rename the current session |
| `SDLC: Delete Session` | Delete a session (with confirmation) |
| `SDLC: Export Session` | Export all phase documents to Markdown or JSON |
| `SDLC: Approve Phase` | Approve the current phase and advance |
| `SDLC: Request Revision` | Return the current phase to in-progress |
| `SDLC: Go Back to Previous Phase` | Re-open the previous phase (resets downstream) |
| `SDLC: Set API Key` | Configure your Anthropic API key |
| `SDLC: Clear API Key` | Remove the stored API key |

**Keyboard shortcuts**:
- `Cmd+Shift+S` — Open / focus the SDLC panel
- `Ctrl+Enter` (in a textarea) — Trigger generation
- `Escape` — Cancel active generation

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `sdlcAgent.model` | `claude-sonnet-4-6` | Claude model to use |
| `sdlcAgent.fileBackup.enabled` | `true` | Write session files to `.sdlc/` in the workspace |
| `sdlcAgent.maxTokenBudget` | `100000` | Token budget for accumulated phase context |

---

## Data & Privacy

- Sessions are stored in VS Code `workspaceState` (primary) and `.sdlc/sessions/` (file backup)
- API keys are stored exclusively in VS Code `SecretStorage`
- No data is sent anywhere except to the configured LLM provider (Anthropic by default)
- `.sdlc/` files are human-readable JSON and can be committed to git for team sharing

---

## Documentation

- [Architecture & Design Blueprint](docs/architecture.md) — full system design, state machine, component map, trade-offs
- [Phase Reference](docs/phases.md) — detailed input/output schemas for each phase
- [LLM Integration](docs/llm-integration.md) — prompt strategy, token budget, error handling

---

## Requirements

- VS Code `^1.118.0`
- An Anthropic API key (Claude models)
- Node.js 18+ (for development)

---

## Development

```bash
npm install
npm run watch        # compile + watch
# Press F5 in VS Code to launch Extension Development Host
```

```bash
npm run compile      # type-check + lint + build
npm test             # run test suite
```

---

## License

MIT
