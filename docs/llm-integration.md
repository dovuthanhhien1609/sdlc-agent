# LLM Integration

How SDLC Agent uses the Anthropic API: prompt strategy, streaming, token budget management, and error handling.

---

## Configuration

| Setting | Storage | Notes |
|---|---|---|
| API key | VS Code `SecretStorage` | Never written to files or settings.json |
| Model | VS Code settings (`sdlcAgent.model`) | Default: `claude-sonnet-4-6` |
| Max token budget | VS Code settings (`sdlcAgent.maxTokenBudget`) | Default: `100000` |

The API key is set via the command `SDLC: Set API Key`. It is stored using `vscode.ExtensionContext.secrets` and never appears in any workspace file or log.

---

## Where LLM Is Used

| Phase | Trigger | Output type |
|---|---|---|
| Requirement | User clicks "Generate Requirements" | Schema-validated JSON (`RequirementDocument`) |
| Design | User clicks "Generate Design" | Schema-validated JSON (`DesignDocument`) |
| Task Breakdown | User clicks "Generate Tasks" | Schema-validated JSON (`TaskList`) |
| Implementation | User clicks "Get Guidance" (per task) | Freeform rich text (not schema-validated) |
| Testing | User clicks "Generate Test Plan" | Schema-validated JSON (`TestPlan`) |
| Review | User clicks "Generate Review Report" | Schema-validated JSON (`ReviewReport`) |

---

## Prompt Structure

Every phase prompt follows the same envelope:

```
System:
  [Role persona]
  [Output contract — schema description in natural language]
  [Quality constraints — what makes a good response]

User:
  [Context block: prior phase documents, structured]
  [Task instruction]
  [Schema reminder: "Return only valid JSON conforming to this schema: ..."]
```

The role persona and constraints are phase-specific. The context block and schema reminder are generated dynamically by `PromptBuilder`.

---

## Per-Phase Prompt Strategy

### Requirement

```
System:
  You are a senior business analyst.
  Your task is to extract structured requirements from a feature description.
  Every functional requirement must have at least one acceptance criterion.
  Surface all ambiguities as open questions — do not resolve them yourself.
  Return only valid JSON conforming to RequirementDocument.

User:
  Feature description:
  """
  {userInput}
  """

  Return JSON only. No prose before or after.
```

### Design

```
System:
  You are a senior software architect.
  The team's stack is: {detectedStack}.
  Produce a technical design that respects this stack.
  Include mermaid sequenceDiagram blocks for all async or multi-step flows.
  Document the rationale for every major architectural decision.
  Return only valid JSON conforming to DesignDocument.

User:
  Requirements:
  {RequirementDocument as JSON}

  Return JSON only.
```

### Task Breakdown

```
System:
  You are a technical lead decomposing a design into implementation tasks.
  Each task must be: atomic (<4 hours), independently deliverable, and traceable
  to at least one requirement ID. Order tasks to respect dependencies.
  Return only valid JSON conforming to TaskList.

User:
  Requirements:
  {RequirementDocument as JSON}

  Design:
  {DesignDocument as JSON}

  Return JSON only.
```

### Implementation (per task)

```
System:
  You are a senior engineer helping implement a specific task.
  Provide guidance: suggest files to create or modify, relevant patterns,
  code structure, and pitfalls. Do NOT write complete implementations.
  Reference the design document's component boundaries.

User:
  Task:
  {Task as JSON}

  Design context:
  {DesignDocument as JSON}

  Workspace file tree (excerpt):
  {fileTree — capped at 2000 tokens}
```

Note: Implementation guidance is freeform and rendered as rich text. It is not schema-validated.

### Testing

```
System:
  You are a QA lead generating a test plan.
  Every functional requirement must have at least one test case.
  Cover all four types: unit, integration, e2e, and manual.
  Test cases must be concrete enough to implement directly.
  Return only valid JSON conforming to TestPlan.

User:
  Requirements:
  {RequirementDocument as JSON}

  Implementation notes:
  {ImplementationState as JSON}
```

### Review

```
System:
  You are a technical reviewer performing a pre-ship audit.
  Rate each requirement as complete, partial, or missing coverage.
  Identify design decisions that were not implemented.
  Be concrete about gaps — vague warnings are not useful.
  Return only valid JSON conforming to ReviewReport.

User:
  All phase documents:
  {RequirementDocument, DesignDocument, TaskList, ImplementationState, TestPlan — as JSON}
```

---

## Token Budget Management

The `PromptBuilder` enforces a configurable token cap (default 100K tokens). This matters most in the Review phase, which includes all prior documents.

**Budget allocation strategy**:

```
If total context ≤ budget:
  Include all prior phase documents in full.

If total context > budget:
  Replace each phase document with a cached LLM-generated summary.
  Summaries are generated on first use and stored in PhaseState.summary.

If even summaries > budget:
  Include only the immediately preceding phase's full document.
  Include summaries of all other phases.
```

Summaries are generated with a dedicated prompt:

```
Summarize the following {phaseName} document in under 500 tokens.
Preserve all IDs, key decisions, and requirement references.
{document as JSON}
```

---

## Streaming

All LLM calls use streaming (`stream: true`). Tokens are forwarded to the WebView as they arrive:

```
extension host: LLMService.streamCompletion(prompt)
  onChunk(token) → WebViewPanelManager → postMessage({ type: 'LLM_CHUNK', content: token })
  onComplete(fullText) → ResponseParser.parse(fullText)
```

The WebView renders streaming tokens progressively. Schema validation runs only on the complete response — never on individual chunks.

**Interrupted streams**: If the connection drops mid-stream, the partial response is discarded. The phase status reverts to `in-progress` on next load. The user sees a "Generation was interrupted" banner and can re-trigger.

---

## Output Validation and Retry Logic

All schema-validated phases use this flow:

```
ResponseParser.parse(text, zodSchema)

├─ JSON.parse fails
│    → Retry 1: append to conversation —
│      "Your previous response was not valid JSON.
│       Error: {parseError}. Return only JSON."
│
├─ JSON valid but Zod validation fails
│    → Retry 1: append to conversation —
│      "Your response was missing or had invalid fields: {zodError.issues}.
│       Correct these fields and return the full JSON."
│
├─ Still invalid after retry 1
│    → Retry 2: same as above (fresh attempt)
│
└─ Still invalid after retry 2
     → Surface raw response in the WebView as a code block.
       Show "Edit & Accept" button — user can paste corrected JSON.
       Log the failure for diagnostics.
```

Retries use the same conversation thread (messages array), not a new API call from scratch. This preserves context and avoids regenerating the entire response.

---

## Error Handling

| Error condition | Detection | Response |
|---|---|---|
| Network error | `fetch` throws | Retry 3× with exponential backoff (1s, 2s, 4s); then show error banner with Try Again |
| HTTP 429 rate limit | Status 429 | Parse `retry-after` header; show countdown; auto-retry |
| HTTP 401 unauthorized | Status 401 | Clear cached key via `SecretStorage`; show "Configure API Key" prompt |
| HTTP 500 server error | Status 5xx | Retry once immediately; then show error banner |
| Response timeout | AbortController (90s) | Cancel; show "Request timed out" with Retry option |
| Schema validation failure | Zod parse error | Retry up to 2× with correction prompt; then manual edit fallback |

---

## LLM Message History

Each `PhaseState` stores the full conversation history for that phase (`llmMessages: LLMMessage[]`). This enables:

- Accurate retry prompts (continuation of the same conversation)
- Audit trail of what the LLM produced and what the user changed
- Future debugging of prompt quality

Message history is persisted alongside the session. It is not used in subsequent phases — each phase starts a fresh conversation.

---

## Security Notes

- API key is never logged, never included in error messages, never written to disk
- Workspace file tree sent to the LLM in the Implementation phase is capped at 2000 tokens and excludes `.env`, `*.key`, `*.pem`, `secrets.*`, and `.git/` paths
- All LLM output is treated as untrusted text — it is parsed and schema-validated before any data is written to session state
