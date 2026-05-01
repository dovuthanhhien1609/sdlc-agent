# SDLC Agent — Architecture & Design Blueprint

This document is the authoritative technical design reference for the SDLC Agent VS Code extension. It covers state management, system architecture, LLM integration, persistence, error handling, and key design decisions.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core Concepts](#2-core-concepts)
3. [State Management Design](#3-state-management-design)
4. [UI/UX Design](#4-uiux-design)
5. [System Architecture](#5-system-architecture)
6. [LLM Integration Strategy](#6-llm-integration-strategy)
7. [Data Persistence Strategy](#7-data-persistence-strategy)
8. [Command & Interaction Model](#8-command--interaction-model)
9. [Error Handling & Edge Cases](#9-error-handling--edge-cases)
10. [Trade-offs & Design Decisions](#10-trade-offs--design-decisions)
11. [Future Extensions](#11-future-extensions)

---

## 1. Product Overview

### Problem

Developers routinely skip from vague requirements directly to code. Chat-based AI tools amplify this — they are infinitely flexible, impose no structure, and produce no durable output. The result is rework, missed requirements, ad hoc architecture, and tests written as an afterthought.

### Target Users

- **Individual contributors** who want to build features with discipline, especially on solo projects where no one else enforces process
- **Tech leads** who want a lightweight, machine-readable workflow for their team without the overhead of Jira
- **Engineers learning software architecture** who benefit from guided, phase-gated thinking

### Why This Is Better Than a Chat Tool

| Dimension | Chat Tool | SDLC Agent |
|---|---|---|
| State | Stateless; user re-explains context each session | Persistent, phase-aware; full context carried forward |
| Structure | Freeform; user drives everything | Opinionated phases with gating |
| Output | Prose in a chat window | Structured, versioned, exportable documents per phase |
| Workflow | Conversation | State machine with explicit approvals |
| Auditability | None | Full history: approvals, LLM outputs, user edits |

The extension is an **engineering workflow engine** that happens to use an LLM — not an LLM wrapper that happens to be in VS Code.

---

## 2. Core Concepts

Each **SDLC Session** represents a single feature or unit of work. It progresses linearly through six phases. Each phase produces a versioned, structured document that becomes input to the next.

### Phase 1 — Requirement

**Purpose**: Transform a vague feature idea into a structured requirements contract.

| | |
|---|---|
| **Input** | Free-text feature description from the user |
| **LLM role** | Extract and structure: functional requirements, non-functional requirements, scope boundaries, acceptance criteria, open questions |
| **Output** | `RequirementDocument` |
| **Completion gate** | User explicitly approves the structured output |

```typescript
interface RequirementDocument {
  summary: string;
  functional: Requirement[];       // { id, description, priority }
  nonFunctional: Requirement[];    // performance, security, scalability
  outOfScope: string[];
  acceptanceCriteria: string[];
  openQuestions: Question[];       // { id, question, status: 'open'|'resolved', answer? }
}
```

### Phase 2 — Design

**Purpose**: Translate requirements into a technical architecture.

| | |
|---|---|
| **Input** | `RequirementDocument` + auto-detected workspace tech stack |
| **LLM role** | Propose system design: component breakdown, data models, API contracts, sequence flows |
| **Output** | `DesignDocument` |
| **Completion gate** | User approves (with optional inline edits) |

```typescript
interface DesignDocument {
  architectureOverview: string;
  components: Component[];         // { name, responsibility, interfaces }
  dataModels: DataModel[];         // { entity, fields, relationships }
  apiContracts: ApiContract[];     // { endpoint, method, request, response }
  sequenceFlows: SequenceDiagram[]; // mermaid-syntax text
  decisionsLog: Decision[];        // { what, why, alternativesConsidered }
}
```

### Phase 3 — Task Breakdown

**Purpose**: Decompose the design into atomic, implementable units.

| | |
|---|---|
| **Input** | `RequirementDocument` + `DesignDocument` |
| **LLM role** | Generate ordered, dependency-aware task list; each task fits a single session of work (<4 hours) |
| **Output** | `TaskList` |
| **Completion gate** | User reviews, reorders, adds/removes tasks, then approves |

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  dependencies: string[];          // task ids
  complexity: 'S' | 'M' | 'L';
  category: 'frontend' | 'backend' | 'infra' | 'test' | 'config';
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
  requirementIds: string[];        // traceability back to requirements
}
```

### Phase 4 — Implementation

**Purpose**: Guide the developer through executing each task with contextual AI assistance.

| | |
|---|---|
| **Input** | Individual `Task` + `DesignDocument` + workspace file context |
| **LLM role** | Per-task: suggest relevant files, patterns, code structure, highlight risks |
| **Output** | `ImplementationState` (per-task log) |
| **Completion gate** | All tasks marked `done` (or explicitly skipped with reason) |

```typescript
interface TaskLog {
  taskId: string;
  status: Task['status'];
  notes: string;
  filesChanged: string[];
  blockers: string[];
  completedAt?: string;
}
```

### Phase 5 — Testing

**Purpose**: Ensure the implementation is verifiably correct.

| | |
|---|---|
| **Input** | `RequirementDocument` + `ImplementationState` |
| **LLM role** | Generate comprehensive test plan: unit, integration, E2E, and manual test cases |
| **Output** | `TestPlan` |
| **Completion gate** | User marks test cases as written/passing |

```typescript
interface TestCase {
  id: string;
  type: 'unit' | 'integration' | 'e2e' | 'manual';
  title: string;
  scenario: string;
  expectedResult: string;
  requirementId?: string;          // traceability
  status: 'pending' | 'written' | 'passing' | 'failing';
}
```

### Phase 6 — Review

**Purpose**: Final sanity check before shipping. Verify requirements were met, design was followed, tests exist.

| | |
|---|---|
| **Input** | All prior documents |
| **LLM role** | Generate a coverage matrix + gap analysis |
| **Output** | `ReviewReport` |
| **Completion gate** | User signs off or elects to cycle back to a named phase |

```typescript
interface ReviewReport {
  requirementCoverage: CoverageItem[];  // { requirementId, taskIds, testIds, status }
  designAdherence: AdherenceNote[];
  gaps: Gap[];                          // { description, severity: 'critical'|'warning'|'info' }
  recommendation: 'ship' | 'revisit';
  revisitPhase?: PhaseId;
}
```

---

## 3. State Management Design

### Session State Shape

```typescript
type PhaseId =
  | 'requirement'
  | 'design'
  | 'task-breakdown'
  | 'implementation'
  | 'testing'
  | 'review';

type PhaseStatus =
  | 'locked'            // prerequisite phase not yet approved
  | 'active'            // unlocked, not yet started
  | 'in-progress'       // user has started; LLM generation underway or input open
  | 'awaiting-approval' // LLM output produced; waiting for user review
  | 'approved';         // user accepted; phase is sealed

interface PhaseState<T> {
  status: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  document?: T;
  llmMessages: LLMMessage[];   // full conversation history for this phase
  userEdits: EditRecord[];     // diff of what user changed from LLM output
}

interface SDLCSession {
  schemaVersion: string;       // e.g. "1.0" — used for migrations
  id: string;                  // UUID
  name: string;
  createdAt: string;
  updatedAt: string;
  currentPhase: PhaseId;
  phases: {
    requirement: PhaseState<RequirementDocument>;
    design: PhaseState<DesignDocument>;
    'task-breakdown': PhaseState<TaskList>;
    implementation: PhaseState<ImplementationState>;
    testing: PhaseState<TestPlan>;
    review: PhaseState<ReviewReport>;
  };
}
```

### Phase Status State Machine

```
                 ┌──────────────────┐
     ┌──────────►│     locked       │
     │           └────────┬─────────┘
     │     prev phase     │ approved
     │     re-opened      │
     │           ┌────────▼─────────┐
     │           │     active       │◄────────────────┐
     │           └────────┬─────────┘                 │
     │                    │ user begins                │ user requests
     │           ┌────────▼─────────┐                 │ revision
     │           │   in-progress    │                 │
     │           └────────┬─────────┘                 │
     │                    │ LLM output received        │
     │           ┌────────▼─────────┐                 │
     │           │awaiting-approval │─────────────────┘
     │           └────────┬─────────┘
     │                    │ user approves
     │           ┌────────▼─────────┐
     └───────────│     approved     │
                 └──────────────────┘
```

### Transition Rules

**Forward (normal flow)**:
- `currentPhase` advances when the current phase status reaches `approved`
- The next phase transitions `locked` → `active`

**Backward (re-open)**:
- User can re-open any approved phase with explicit confirmation
- Re-opening phase N resets phases N+1 through 6 to `locked` (invalidated by upstream change)
- User is shown the exact list of phases that will reset before confirming

**Invalid transition guards**:

| Attempted action | Guard | Response |
|---|---|---|
| Approve without document | Document must exist and pass schema validation | Inline validation, highlight missing sections |
| Advance past unapproved phase | Session state check | Modal: "Complete [phase name] before continuing" |
| Re-open phase without confirmation | Require explicit confirmation | Dialog listing which downstream phases reset |
| Navigate to locked phase | Phase status check | Phase greyed out; click shows tooltip explaining prerequisite |

---

## 4. UI/UX Design

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Activity Bar   │ Sidebar              │ Main Panel (WebView)     │
│                │                      │                          │
│  [SDLC Icon]   │ SDLC SESSIONS        │ ┌──────────────────────┐ │
│                │ ─────────────        │ │  Phase Stepper       │ │
│                │ + New Session        │ │  ①②③④⑤⑥             │ │
│                │                      │ ├──────────────────────┤ │
│                │ ▼ Feature: Auth      │ │                      │ │
│                │   ✓ Requirement      │ │  Phase Content       │ │
│                │   ● Design           │ │  (scrollable)        │ │
│                │   ○ Tasks            │ │                      │ │
│                │   🔒 Implement       │ │                      │ │
│                │   🔒 Testing         │ ├──────────────────────┤ │
│                │   🔒 Review          │ │  Action Bar (fixed)  │ │
│                │                      │ └──────────────────────┘ │
│                │ ▶ Feature: Payments  │                          │
└─────────────────────────────────────────────────────────────────┘
```

### Sidebar (VS Code TreeView)

- Custom activity bar icon
- Session list: each session shows name + phase progress (e.g. `3/6`)
- Session context menu: Rename, Export, Delete
- Phase nodes: clickable if unlocked; click opens that phase in the main panel
- Phase status icons:
  - `✓` approved
  - `●` active / in-progress
  - `⟳` awaiting approval
  - `○` available (not started)
  - `🔒` locked

### Main Panel (WebView)

Three fixed vertical zones:

**Zone 1 — Phase Stepper** (~60px, fixed top):
Horizontal step indicators. Each step is clickable if unlocked. Current phase is highlighted. Approved phases show checkmark. Shows session name in header.

**Zone 2 — Phase Content** (middle, scrollable):
Phase-specific UI. See per-phase layouts below.

**Zone 3 — Action Bar** (~64px, fixed bottom):
Context-sensitive buttons. Never more than three actions visible at once.

### Per-Phase UI

**Requirement**:
```
┌─ Requirement ─────────────────────────────────────────────┐
│  Describe your feature:                                    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ [textarea — multi-line, with placeholder text]       │ │
│  └──────────────────────────────────────────────────────┘ │
│                                     [Generate Requirements]│
│ ──────────────────────────────────────────────────────    │
│  ▼ Summary                                                │
│  ▼ Functional Requirements        [+ Add]                 │
│     • [FR-1] editable inline...                           │
│     • [FR-2] ...                                          │
│  ▼ Non-Functional                 [+ Add]                 │
│  ▼ Out of Scope                                           │
│  ▼ Open Questions                                         │
└───────────────────────────────────────────────────────────┘
Action Bar: [Request Revision]   [Approve & Continue →]
```

**Design**:
- Auto-populated header: "Based on N requirements"
- Tabbed content: Architecture | Data Models | APIs | Sequences
- Sequences tab renders Mermaid diagrams inline (mermaid.js bundled in WebView)
- All sections inline-editable (click → textarea mode)

**Task Breakdown**:
- Ordered task card list with drag handles (drag-to-reorder)
- Each card: title, complexity badge (S/M/L color-coded), category tag
- Collapsible card body: description, acceptance criteria, linked requirements
- [+ Add Task] and [Delete] per card
- Filter bar: by category, by complexity

**Implementation**:
- Two-column layout within the panel:
  - Left (30%): task list with status toggles (todo / in-progress / done / blocked)
  - Right (70%): selected task detail
- Task detail: description, acceptance criteria, [Get Guidance] button, notes textarea, files changed list
- Progress bar at top: `4 / 12 tasks complete`

**Testing**:
- [Generate Test Plan] button
- Tabs: Unit | Integration | E2E | Manual
- Per test case: scenario, expected result, status toggle (pending / written / passing / failing)
- Coverage summary: requirements → test case count

**Review**:
- Coverage matrix table (requirements × tasks × tests)
- Gaps list with severity indicators (critical / warning / info)
- LLM recommendation badge: "Ready to ship" or "Review needed"
- [Complete Feature] or [Go Back to Phase...] dropdown

### Progress Tracking

- VS Code status bar (right): `SDLC: Feature: Auth — Design (awaiting approval)`
- Sidebar session node: `3/6` completion fraction
- Phase stepper: visual state per step
- Implementation phase: explicit `N/M tasks complete` progress bar

---

## 5. System Architecture

### Component Map

```
Extension Host Process
├── extension.ts                Entry: activate/deactivate, DI wiring
├── commands/
│   └── CommandRegistry         Maps vscode.commands to handlers
├── session/
│   ├── SessionManager          CRUD operations on sessions; owns transition logic
│   ├── PhaseTransitionGuard    Validates state transitions; throws typed errors
│   └── StateStore              In-memory session map + persistence coordination
├── llm/
│   ├── LLMService              API calls, streaming, retry logic
│   ├── PromptBuilder           Constructs phase-specific prompts from session context
│   └── ResponseParser          Validates + parses LLM output against Zod schemas
├── persistence/
│   ├── WorkspaceStateAdapter   VS Code workspaceState read/write
│   ├── FileAdapter             .sdlc/ file read/write
│   └── MigrationRunner         Schema version upgrade functions
├── workspace/
│   └── TechStackDetector       Reads package.json, pom.xml, go.mod → infers stack
└── panel/
    └── WebViewPanelManager     WebView lifecycle + message bridge

WebView (sandboxed, built separately)
├── App.tsx                     React root; renders phase router
├── phases/
│   ├── RequirementPhase.tsx
│   ├── DesignPhase.tsx
│   ├── TaskBreakdownPhase.tsx
│   ├── ImplementationPhase.tsx
│   ├── TestingPhase.tsx
│   └── ReviewPhase.tsx
├── components/                 Shared: PhaseSteppper, ActionBar, TaskCard, etc.
└── store/
    └── sessionStore.ts         Local mirror of session state (read-only replica)
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| `SessionManager` | CRUD sessions; enforces transition guards; single source of state mutations |
| `PhaseTransitionGuard` | Pure function: `(session, action) → void \| TransitionError` |
| `StateStore` | In-memory map of sessions; delegates persistence to adapters; emits change events |
| `LLMService` | HTTP client for Anthropic API; handles streaming, retry, rate-limiting |
| `PromptBuilder` | Assembles context-aware prompts per phase; manages token budget |
| `ResponseParser` | Zod schema validation; extracts structured output; classifies parse errors |
| `TechStackDetector` | Reads workspace root files to infer language/framework context |
| `WebViewPanelManager` | Creates/shows/destroys panel; routes messages between extension and WebView |
| WebView `sessionStore` | Maintains local state replica; triggers re-renders on extension messages |

### Communication Flow

```
User clicks "Generate" in WebView
  │
  ▼
WebView: vscodeApi.postMessage({ type: 'GENERATE_PHASE', phase: 'design' })
  │
  ▼
WebViewPanelManager.onDidReceiveMessage handler
  │
  ▼
SessionManager.generatePhase(sessionId, 'design')
  │
  ├─► PhaseTransitionGuard.assertCanGenerate(session, 'design')
  │
  ├─► TechStackDetector.detect(workspaceRoot)
  │
  ├─► PromptBuilder.buildDesignPrompt(session)
  │
  └─► LLMService.streamCompletion(prompt)
        │
        ├─ onChunk → panel.postMessage({ type: 'LLM_CHUNK', content })
        │
        └─ onComplete → ResponseParser.parseDesignDocument(fullText)
              │
              ├─ success → StateStore.updatePhase(...)
              │            panel.postMessage({ type: 'SESSION_UPDATE', session })
              │
              └─ failure → retry or panel.postMessage({ type: 'LLM_ERROR', ... })
```

**Key invariant**: The extension host owns all state. The WebView only sends commands and receives state snapshots. It never mutates state directly.

---

## 6. LLM Integration Strategy

### Configuration

- API key stored exclusively in `vscode.ExtensionContext.secrets` (VS Code SecretStorage)
- Model: user-configurable via VS Code settings, defaulting to `claude-sonnet-4-6`
- Streaming enabled by default; WebView renders tokens progressively

### Prompt Structure (per phase)

Each phase has a dedicated prompt template in `PromptBuilder`. The structure is consistent:

```
System: [Role persona] + [Output contract: schema description] + [Quality constraints]
User:   [Prior phase documents as structured context] + [Task instruction] + [Schema reminder]
```

| Phase | System persona | Key constraints |
|---|---|---|
| Requirement | Senior business analyst | At least one acceptance criterion per functional requirement |
| Design | Senior software architect | Include mermaid diagrams for all async or multi-step flows; use detected tech stack |
| Task Breakdown | Technical lead | Each task atomic, <4 hours, traceable to at least one requirement |
| Implementation | Senior engineer | Suggest specific files, patterns, and pitfalls; do NOT generate code to write to disk |
| Testing | QA lead | At least one test case per requirement; cover unit/integration/E2E |
| Review | Technical reviewer | Rate coverage as complete/partial/missing per requirement |

### Token Budget Management

`PromptBuilder` enforces a hard cap (configurable, default 100K tokens). If accumulated context exceeds budget:

1. Prior phase documents are replaced with LLM-generated summaries (one per phase)
2. Summaries are generated on-demand and cached in session state
3. If even summaries exceed budget: only the immediately preceding phase's full document is included

### Handling Partial or Incorrect Output

```
LLM response received
  │
  ├─ Valid JSON conforming to schema
  │    → success path
  │
  ├─ Invalid JSON
  │    → retry once: "Your previous response was not valid JSON.
  │      Error: {parseError}. Return only JSON."
  │
  ├─ Valid JSON but schema violations
  │    → retry once: "Your response was missing required fields: {fields}.
  │      Correct and return full JSON."
  │
  └─ Still invalid after 2 retries
       → Show raw response in a code block
         with manual "Edit & Accept" option
```

---

## 7. Data Persistence Strategy

### Storage Layers

**Primary — VS Code `workspaceState`**:
- Key: `sdlc.sessions` → array of session IDs
- Key: `sdlc.session.{id}` → serialized `SDLCSession`
- Survives VS Code restarts; scoped to workspace

**Secondary — File backup (`.sdlc/sessions/{id}.json`)**:
- Human-readable, git-committable
- Opt-out via `sdlcAgent.fileBackup.enabled: false`
- Enabled by default: SDLC artifacts are team documents that belong alongside the code

**Secrets — VS Code `SecretStorage`**:
- API key only
- Never written to workspace state or files

### Write Strategy

- Every state mutation triggers a debounced write (300ms delay) to both layers
- LLM streaming chunks are not individually persisted; only the final assembled response is saved
- Write order: `workspaceState` first (fast, synchronous), then file system (async, non-blocking)

### Schema Migration

```typescript
const MIGRATIONS: Record<string, (session: unknown) => SDLCSession> = {
  '1.0': identity,
  '1.1': migrateFrom1_0_to_1_1,
};
```

On load: detect `schemaVersion`, run applicable migrations in sequence, persist migrated result. Unknown future version: warn user, open in read-only mode.

### Recovery Scenarios

| Scenario | Recovery |
|---|---|
| `workspaceState` empty, `.sdlc/` present | Offer "Restore from files" prompt on activation |
| File corrupted (JSON parse error) | Load from `workspaceState` fallback; warn user |
| Generation interrupted (crash mid-stream) | Phase status is `in-progress` on reload; show "Generation was interrupted" banner; user can re-trigger |
| External edit to `.sdlc/` file | Detect mtime change on next load; show diff and ask: "Keep mine / Use file version" |
| Two VS Code windows, same workspace | Last writer wins; each window shows "Session was updated externally — reloaded" notification |

---

## 8. Command & Interaction Model

### VS Code Commands

| Command ID | Title | Available when |
|---|---|---|
| `sdlc.session.new` | SDLC: New Session | Always |
| `sdlc.session.open` | SDLC: Open Session | Sessions exist |
| `sdlc.session.rename` | SDLC: Rename Session | Session selected |
| `sdlc.session.delete` | SDLC: Delete Session | Session selected |
| `sdlc.session.export` | SDLC: Export Session | Session selected |
| `sdlc.phase.generate` | SDLC: Generate Current Phase | Phase is active/in-progress |
| `sdlc.phase.approve` | SDLC: Approve Phase | Phase is awaiting-approval |
| `sdlc.phase.revise` | SDLC: Request Revision | Phase is awaiting-approval |
| `sdlc.phase.back` | SDLC: Go Back to Previous Phase | Not on first phase |
| `sdlc.config.setApiKey` | SDLC: Set API Key | Always |
| `sdlc.config.clearApiKey` | SDLC: Clear API Key | Key is set |

### WebView → Extension Message Types

```typescript
type WebViewCommand =
  | { type: 'GENERATE_PHASE'; phase: PhaseId }
  | { type: 'APPROVE_PHASE'; phase: PhaseId }
  | { type: 'REVISE_PHASE'; phase: PhaseId }
  | { type: 'UPDATE_DOCUMENT'; phase: PhaseId; patch: Partial<PhaseDocument> }
  | { type: 'UPDATE_TASK'; taskId: string; patch: Partial<Task> }
  | { type: 'REORDER_TASKS'; orderedIds: string[] }
  | { type: 'ADD_TASK'; task: Omit<Task, 'id'> }
  | { type: 'DELETE_TASK'; taskId: string }
  | { type: 'NAVIGATE_PHASE'; phase: PhaseId }
  | { type: 'COMPLETE_SESSION' }
  | { type: 'RESTART_FROM_PHASE'; phase: PhaseId };
```

### Extension → WebView Message Types

```typescript
type ExtensionMessage =
  | { type: 'SESSION_UPDATE'; session: SDLCSession }
  | { type: 'LLM_CHUNK'; content: string; phase: PhaseId }
  | { type: 'LLM_COMPLETE'; phase: PhaseId }
  | { type: 'LLM_ERROR'; phase: PhaseId; error: LLMError }
  | { type: 'TRANSITION_ERROR'; message: string; requiredPhase?: PhaseId }
  | { type: 'VALIDATION_ERROR'; phase: PhaseId; fields: string[] };
```

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+S` (Mac) / `Ctrl+Shift+S` (Win/Linux) | Open / focus the SDLC panel |
| `Ctrl+Enter` in textarea | Trigger generate |
| `Escape` | Cancel active generation |

---

## 9. Error Handling & Edge Cases

### Missing or Invalid Data

| Scenario | Handling |
|---|---|
| User submits empty requirement | Client-side validation before postMessage; "Feature description cannot be empty." No LLM call made. |
| Required fields missing from LLM output | ResponseParser reports missing fields; retry with correction prompt; after 2 failures, surface raw output with manual edit mode |
| No workspace folder open | Sessions stored in `globalState` instead of `workspaceState`; file backup disabled with a notification |

### Invalid State Transitions

| Scenario | Handling |
|---|---|
| Navigate to locked phase | WebView disables the step button (greyed out); clicking shows tooltip "Complete [X] first" |
| Race condition (two messages for same phase) | Extension processes messages through a per-session FIFO queue |
| Re-open approved phase | Confirmation dialog explicitly lists downstream phases that will reset |

### LLM Failures

| Failure | Detection | Response |
|---|---|---|
| Network error | Fetch throws | Retry 3× with exponential backoff (1s, 2s, 4s); then "Network error" UI + Try Again |
| HTTP 429 rate limit | Response status 429 | Parse retry-after header; show countdown timer; auto-retry when cleared |
| HTTP 401 unauthorized | Response status 401 | Clear cached key; show "Configure API Key" prompt |
| Malformed JSON | JSON.parse failure | Retry with correction prompt (up to 2×); then manual edit fallback |
| Stream interrupted | onError / connection drop | Mark phase as `active` on next load; show "Generation was interrupted" banner |
| Response timeout (>90s) | AbortController | Cancel request; show "Request timed out" with Retry option |

### User Interruptions

| Scenario | Handling |
|---|---|
| Close panel while generating | Generation continues in extension host; panel shows final state when reopened |
| Delete session while generating | Cancel the LLM request, then delete; confirmation warns if generation is active |
| Switch workspace folder | Sessions are workspace-scoped; new workspace starts fresh |
| All tasks blocked in Implementation | Allow advance with a warning: "All tasks are blocked. Resolve blockers before Testing." |

---

## 10. Trade-offs & Design Decisions

### Extension host owns all state; WebView is a dumb terminal

**Chosen**: State lives entirely in the extension host process. WebView receives serialized snapshots.

**Alternative**: State lives in WebView with periodic syncs to extension.

**Rationale**: The WebView can be destroyed and recreated at any time (panel hidden, theme change, reload). Extension host has a stable lifecycle. Centralizing state prevents the entire class of desync bugs from dual ownership. The message round-trip overhead is ~1–5ms — imperceptible.

**Trade-off**: Every user action requires a message round-trip. More boilerplate. Accepted: correctness over convenience.

---

### Linear phase enforcement — no skipping

**Chosen**: Phases must be completed in order. Skipping not supported in v1.

**Alternative**: Allow any phase access order; soft suggestions instead of hard gates.

**Rationale**: The product's core value is enforcing engineering discipline. A system that can be freely bypassed teaches nothing. If users can skip Design, Task Breakdown has no grounding — LLM prompts are weaker, outputs are less useful.

**Trade-off**: Experienced developers may find this rigid. Mitigation: re-opening approved phases is allowed (with confirmation), so the flow is not irreversible.

---

### LLM output validated against strict Zod schemas

**Chosen**: All LLM responses are parsed against typed schemas. Invalid output triggers retry.

**Alternative**: Accept freeform text; let users structure it manually.

**Rationale**: Structured output makes downstream automation possible — the coverage matrix in Review, traceability from requirements to tasks to tests, and future Git/CI integrations. Free text reduces the extension to a pretty chat window.

**Trade-off**: Schema maintenance burden; prompt engineering complexity. Mitigated by retry logic and the manual edit fallback.

---

### No automatic code writing to disk in v1

**Chosen**: Implementation phase provides guidance and suggestions only.

**Alternative**: Auto-generate code from design + task context, write to files.

**Rationale**: Auto-generation from high-level design without deep, indexed workspace understanding produces code that breaks existing contracts and ignores project conventions. Risk-to-reward ratio is unfavorable for v1. This is a workflow engine, not a code generator.

**Trade-off**: Less "magical" than a code-generating tool. Code generation is a v2 feature with proper workspace indexing.

---

### File-based backup as a team artifact

**Chosen**: `.sdlc/sessions/{id}.json` written to workspace root (opt-out, not opt-in).

**Alternative**: VS Code workspaceState only (no files).

**Rationale**: SDLC artifacts — requirements, design, tasks — are team documents. They belong alongside the code they describe. File storage enables git-based sharing, CI pipeline access, and documentation generators.

**Trade-off**: Adds files to the repo. Addressed by generating a `.gitignore` entry prompt on first use.

---

### Mermaid diagrams in Design phase

**Chosen**: Sequence flows rendered as Mermaid (text → diagram via mermaid.js in WebView).

**Alternative**: ASCII diagrams or no rendering.

**Rationale**: Mermaid is text-based (versionable), widely understood, and renders natively in GitHub. Bundling mermaid.js is a one-time setup cost. ASCII diagrams degrade quickly for complex flows.

**Trade-off**: Mermaid.js adds ~500KB to the WebView bundle. Acceptable given the readability improvement.

---

## 11. Future Extensions

### Multi-Agent Collaboration

Assign specialized agents per phase (Requirements Agent, Architecture Agent, Security Agent). Phase completion could require sign-off from multiple agents. Phases could be assigned to different team members for async collaboration.

### Git Integration

- Auto-create feature branch on session start: `sdlc/{session-id}/{slug}`
- Inject task ID into commit messages via `.git/hooks/prepare-commit-msg`
- Auto-generate PR description from `ReviewReport`
- Block merge if Review phase is not approved (CI check reads `.sdlc/` files)

### CI/CD Integration

- Export `TestPlan` as test scaffolding (Jest `describe` blocks with `it.todo()`)
- CI step validates Review phase approval before allowing merge
- Dashboard: sessions without approved Review are flagged

### Auto Code Generation (v2)

With workspace indexing (LSP-based or embedding-based file search):
1. Locate relevant existing files per task
2. Generate file-targeted diffs
3. Stage changes for human review — never auto-apply
4. Run tests after staging to validate

### Team Workflows

- Sessions stored in a shared backend; accessible to all team members
- Phase approval gated by tech lead role
- Async comments on any section of any phase document
- Webhook notifications: "Session 'User Auth' ready for Design review"

### Plugin System

- Custom phase definitions via a plugin API
- Custom LLM providers (OpenAI, Gemini) via a provider interface
- Phase templates per project type: mobile, REST API, data pipeline, infrastructure
- Export adapters: Confluence, Notion, Jira ticket creation

### Analytics & Metrics

- Time spent per phase across sessions
- Most frequently revised phases (signals where prompts need tuning)
- Requirement churn rate (how often approved requirements are re-opened)
- Test coverage correlation across sessions

---

## Implementation Sequence

Given the existing scaffold, the recommended implementation order:

1. `StateStore` + `SDLCSession` type definitions — data model foundation
2. `SessionManager` + `PhaseTransitionGuard` — business logic, no UI
3. `WebViewPanelManager` + minimal React shell — message bridge
4. `RequirementPhase` UI + `LLMService` — first end-to-end flow
5. Phases 2–6 — iteratively
6. `FileAdapter` + `WorkspaceStateAdapter` — full persistence
7. `TechStackDetector` + advanced prompt context
8. Sidebar TreeView integration
9. Polish: keyboard shortcuts, status bar, export

Each layer is independently testable before the next is added.
