import {
  SDLCSession, Task, TaskList, ImplementationState,
  RequirementDocument, DesignDocument, TestPlan,
} from '../shared/types';

type Msg = { role: 'user' | 'assistant'; content: string };

const REQ_SCHEMA = `{
  "summary": "string",
  "functional": [{ "id": "FR-N", "description": "string", "priority": "must|should|could" }],
  "nonFunctional": [{ "id": "NFR-N", "description": "string", "category": "string" }],
  "outOfScope": ["string"],
  "acceptanceCriteria": ["string"],
  "openQuestions": [{ "id": "Q-N", "question": "string", "status": "open|resolved", "answer": "string?" }]
}`;

const DESIGN_SCHEMA = `{
  "architectureOverview": "string",
  "components": [{ "name": "string", "responsibility": "string", "interfaces": ["string"] }],
  "dataModels": [{ "entity": "string", "fields": [{ "name": "string", "type": "string", "constraints": "string?" }], "relationships": ["string"] }],
  "apiContracts": [{ "endpoint": "string", "method": "GET|POST|PUT|PATCH|DELETE", "request": {}, "response": {}, "auth": "string" }],
  "sequenceFlows": [{ "title": "string", "diagram": "mermaid sequenceDiagram syntax" }],
  "decisionsLog": [{ "decision": "string", "rationale": "string", "alternativesConsidered": ["string"] }]
}`;

const TASK_SCHEMA = `{
  "tasks": [{
    "id": "T-N",
    "title": "string",
    "description": "string",
    "acceptanceCriteria": ["string"],
    "dependencies": ["T-N"],
    "complexity": "S|M|L",
    "category": "frontend|backend|infra|test|config",
    "status": "todo",
    "requirementIds": ["FR-N"]
  }]
}`;

const TEST_SCHEMA = `{
  "strategy": "string",
  "testCases": [{
    "id": "TC-N",
    "type": "unit|integration|e2e|manual",
    "title": "string",
    "scenario": "string",
    "expectedResult": "string",
    "requirementId": "FR-N?",
    "status": "pending"
  }]
}`;

const REVIEW_SCHEMA = `{
  "requirementCoverage": [{ "requirementId": "FR-N", "taskIds": ["T-N"], "testCaseIds": ["TC-N"], "coverageStatus": "complete|partial|missing" }],
  "designAdherence": [{ "component": "string", "note": "string", "status": "followed|deviated|not-applicable" }],
  "gaps": [{ "description": "string", "severity": "critical|warning|info", "affectedRequirementIds": ["FR-N"] }],
  "recommendation": "ship|revisit",
  "revisitPhase": "requirement|design|task-breakdown|implementation|testing|review?",
  "revisitReason": "string?"
}`;

export class PromptBuilder {
  buildRequirementPrompt(userInput: string): Msg[] {
    return [
      {
        role: 'user',
        content: `You are a senior business analyst. Extract structured requirements from the feature description below.

Rules:
- Every functional requirement must have at least one corresponding acceptance criterion
- Surface ALL ambiguities as open questions — do not resolve them yourself
- Non-functional requirements must cover performance, security, and scalability at minimum
- Return ONLY valid JSON. No prose before or after.

Schema:
${REQ_SCHEMA}

Feature description:
"""
${userInput}
"""`,
      },
    ];
  }

  buildDesignPrompt(session: SDLCSession, stack: string): Msg[] {
    const req = JSON.stringify(session.phases.requirement.document, null, 2);
    return [
      {
        role: 'user',
        content: `You are a senior software architect. Produce a technical design based on the requirements below.

Tech stack: ${stack || 'Not detected — use generic best practices'}

Rules:
- Include mermaid sequenceDiagram blocks for all async or multi-step flows
- Document the rationale for every major architectural decision in decisionsLog
- Components must map directly to the requirements they satisfy
- Return ONLY valid JSON. No prose before or after.

Schema:
${DESIGN_SCHEMA}

Requirements:
${req}`,
      },
    ];
  }

  buildTaskBreakdownPrompt(session: SDLCSession): Msg[] {
    const req = JSON.stringify(session.phases.requirement.document, null, 2);
    const design = JSON.stringify(session.phases.design.document, null, 2);
    return [
      {
        role: 'user',
        content: `You are a technical lead decomposing a design into implementation tasks.

Rules:
- Each task must be atomic and completable in under 4 hours
- Each task must be traceable to at least one requirement ID (requirementIds)
- Order tasks so that dependencies are always earlier in the list
- Status must always be "todo" for new tasks
- Return ONLY valid JSON. No prose before or after.

Schema:
${TASK_SCHEMA}

Requirements:
${req}

Design:
${design}`,
      },
    ];
  }

  buildImplementationPrompt(task: Task, session: SDLCSession): Msg[] {
    const design = JSON.stringify(session.phases.design.document as DesignDocument, null, 2);
    return [
      {
        role: 'user',
        content: `You are a senior engineer providing implementation guidance for a specific task.

Rules:
- Suggest specific files to create or modify
- Describe patterns and code structure to follow
- Highlight potential pitfalls
- Reference the design document's component names
- Do NOT write complete file implementations — provide targeted guidance and key snippets only

Task:
${JSON.stringify(task, null, 2)}

Design context:
${design}`,
      },
    ];
  }

  buildTestingPrompt(session: SDLCSession): Msg[] {
    const req = session.phases.requirement.document as RequirementDocument;
    const impl = session.phases.implementation.document as ImplementationState | undefined;
    const criteria = req?.functional.map(f => `${f.id}: ${f.description}`).join('\n') ?? '';
    const notes = impl?.taskLogs.map(l => `Task ${l.taskId}: ${l.notes}`).join('\n\n') ?? '';
    return [
      {
        role: 'user',
        content: `You are a QA lead generating a comprehensive test plan.

Rules:
- At least one test case per functional requirement
- Cover all four types: unit, integration, e2e, manual
- Test cases must be concrete and implementable directly
- Set status to "pending" for all test cases
- Return ONLY valid JSON. No prose before or after.

Schema:
${TEST_SCHEMA}

Functional requirements:
${criteria}

Implementation notes:
${notes}`,
      },
    ];
  }

  buildReviewPrompt(session: SDLCSession): Msg[] {
    const allDocs = {
      requirement: session.phases.requirement.document,
      design: session.phases.design.document,
      taskBreakdown: session.phases['task-breakdown'].document,
      implementation: session.phases.implementation.document,
      testing: session.phases.testing.document,
    };
    return [
      {
        role: 'user',
        content: `You are a technical reviewer performing a pre-ship audit.

Rules:
- Rate each functional requirement as complete, partial, or missing coverage
- Identify design decisions that were NOT implemented (mark as deviated)
- Be specific about gaps — vague warnings are not useful
- Return ONLY valid JSON. No prose before or after.

Schema:
${REVIEW_SCHEMA}

All phase documents:
${JSON.stringify(allDocs, null, 2)}`,
      },
    ];
  }

  buildSummaryPrompt(phaseName: string, document: unknown): Msg[] {
    return [
      {
        role: 'user',
        content: `Summarize the following ${phaseName} document in under 500 tokens.
Preserve all IDs, key decisions, and requirement references.
Return plain text, not JSON.

${JSON.stringify(document, null, 2)}`,
      },
    ];
  }
}
