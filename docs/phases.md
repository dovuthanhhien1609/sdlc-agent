# Phase Reference

Detailed input/output schemas and behavior for each SDLC phase.

---

## Phase 1 — Requirement

### Purpose
Transform a free-text feature description into a structured requirements contract.

### Input
- Free-text description written by the user in the Requirement textarea

### LLM Prompt Contract
- **Persona**: Senior business analyst
- **Constraint**: At least one acceptance criterion per functional requirement. Open questions must be exhaustive — surface anything ambiguous.
- **Output format**: JSON conforming to `RequirementDocument`

### Output Schema

```typescript
interface RequirementDocument {
  summary: string;
  functional: {
    id: string;           // e.g. "FR-1"
    description: string;
    priority: 'must' | 'should' | 'could';
  }[];
  nonFunctional: {
    id: string;           // e.g. "NFR-1"
    description: string;
    category: 'performance' | 'security' | 'scalability' | 'accessibility' | 'other';
  }[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  openQuestions: {
    id: string;
    question: string;
    status: 'open' | 'resolved';
    answer?: string;
  }[];
}
```

### Completion Gate
User explicitly clicks "Approve & Continue". All sections must be non-empty.

---

## Phase 2 — Design

### Purpose
Translate requirements into a technical architecture.

### Input
- Approved `RequirementDocument`
- Auto-detected tech stack from workspace root (package.json, go.mod, pom.xml, Cargo.toml, etc.)

### LLM Prompt Contract
- **Persona**: Senior software architect familiar with the detected tech stack
- **Constraint**: Include mermaid sequence diagrams for all async or multi-step flows. Document the rationale for every major decision.
- **Output format**: JSON conforming to `DesignDocument`

### Output Schema

```typescript
interface DesignDocument {
  architectureOverview: string;
  components: {
    name: string;
    responsibility: string;
    interfaces: string[];          // methods or endpoints this component exposes
  }[];
  dataModels: {
    entity: string;
    fields: { name: string; type: string; constraints?: string }[];
    relationships: string[];
  }[];
  apiContracts: {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    request: object;
    response: object;
    auth: string;
  }[];
  sequenceFlows: {
    title: string;
    diagram: string;               // mermaid sequenceDiagram syntax
  }[];
  decisionsLog: {
    decision: string;
    rationale: string;
    alternativesConsidered: string[];
  }[];
}
```

### Completion Gate
User approves after reviewing all tabs (Architecture, Data Models, APIs, Sequences).

---

## Phase 3 — Task Breakdown

### Purpose
Decompose the design into atomic, implementable tasks that fit a single developer session.

### Input
- Approved `RequirementDocument`
- Approved `DesignDocument`

### LLM Prompt Contract
- **Persona**: Technical lead
- **Constraint**: Each task must be atomic (completable in <4 hours), independently deliverable, and traceable to at least one requirement. Tasks must be ordered to respect dependencies.
- **Output format**: JSON array of `Task`

### Output Schema

```typescript
interface Task {
  id: string;                      // e.g. "T-1"
  title: string;
  description: string;
  acceptanceCriteria: string[];
  dependencies: string[];          // task ids that must complete first
  complexity: 'S' | 'M' | 'L';   // S: <1h, M: 1-2h, L: 2-4h
  category: 'frontend' | 'backend' | 'infra' | 'test' | 'config';
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
  requirementIds: string[];        // links to RequirementDocument.functional[].id
  blockerReason?: string;          // populated when status === 'blocked'
}

interface TaskList {
  tasks: Task[];
}
```

### Completion Gate
User reviews, reorders (drag-and-drop), optionally adds/removes tasks, then approves.

---

## Phase 4 — Implementation

### Purpose
Guide the developer through executing each task with AI assistance scoped to their workspace.

### Input (per task)
- Single `Task` from the approved `TaskList`
- Approved `DesignDocument`
- Workspace file tree (capped at 2000 tokens, rooted at workspace folder)

### LLM Prompt Contract
- **Persona**: Senior engineer
- **Constraint**: Suggest specific files to create/modify, patterns to follow, and potential pitfalls. Do NOT generate complete code blocks — provide guidance and snippets only. Reference the design's component boundaries.
- **Output format**: Freeform guidance text (not schema-validated; displayed as rich text)

### Output Schema

```typescript
interface TaskLog {
  taskId: string;
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
  notes: string;                   // developer's own notes
  filesChanged: string[];          // manually recorded by developer
  blockers: string[];
  completedAt?: string;
}

interface ImplementationState {
  taskLogs: TaskLog[];
}
```

### Completion Gate
All tasks reach status `done`. Tasks in `blocked` status prevent completion; developer must resolve or explicitly skip with a documented reason.

---

## Phase 5 — Testing

### Purpose
Generate a comprehensive test plan ensuring every requirement has verifiable test coverage.

### Input
- Approved `RequirementDocument` (acceptance criteria)
- `ImplementationState` (task logs, files changed, notes)

### LLM Prompt Contract
- **Persona**: QA lead
- **Constraint**: At least one test case per functional requirement. Cover all four test types. Test cases must be concrete enough to implement directly.
- **Output format**: JSON conforming to `TestPlan`

### Output Schema

```typescript
interface TestCase {
  id: string;                      // e.g. "TC-1"
  type: 'unit' | 'integration' | 'e2e' | 'manual';
  title: string;
  scenario: string;                // given/when/then or plain description
  expectedResult: string;
  requirementId?: string;          // links to RequirementDocument.functional[].id
  status: 'pending' | 'written' | 'passing' | 'failing';
}

interface TestPlan {
  strategy: string;                // overview of testing approach
  testCases: TestCase[];
}
```

### Completion Gate
User marks test cases as `written` and `passing`. Cases in `failing` status prevent approval.

---

## Phase 6 — Review

### Purpose
Final pre-ship audit: verify requirements were met, design was followed, and tests exist.

### Input
All prior phase documents:
- `RequirementDocument`
- `DesignDocument`
- `TaskList`
- `ImplementationState`
- `TestPlan`

### LLM Prompt Contract
- **Persona**: Technical reviewer
- **Constraint**: Rate each requirement as `complete`, `partial`, or `missing` coverage. Identify any design decisions that were not implemented. Produce a concrete recommendation.
- **Output format**: JSON conforming to `ReviewReport`

### Output Schema

```typescript
interface CoverageItem {
  requirementId: string;
  taskIds: string[];
  testCaseIds: string[];
  coverageStatus: 'complete' | 'partial' | 'missing';
}

interface Gap {
  description: string;
  severity: 'critical' | 'warning' | 'info';
  affectedRequirementIds?: string[];
}

interface ReviewReport {
  requirementCoverage: CoverageItem[];
  designAdherence: {
    component: string;
    note: string;
    status: 'followed' | 'deviated' | 'not-applicable';
  }[];
  gaps: Gap[];
  recommendation: 'ship' | 'revisit';
  revisitPhase?: PhaseId;          // populated when recommendation === 'revisit'
  revisitReason?: string;
}
```

### Completion Gate

- **Ship**: User clicks "Complete Feature" — session is sealed, all phases locked
- **Revisit**: User selects a phase to go back to from the dropdown; session resets that phase and all subsequent phases

---

## Phase Transition Summary

| From status | Event | To status |
|---|---|---|
| `locked` | Previous phase approved | `active` |
| `active` | User begins filling input | `in-progress` |
| `in-progress` | LLM output received and valid | `awaiting-approval` |
| `awaiting-approval` | User approves | `approved` |
| `awaiting-approval` | User requests revision | `in-progress` |
| `approved` | User re-opens (with confirmation) | `active` (resets downstream) |
