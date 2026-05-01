import { randomUUID } from 'crypto';
import {
  SDLCSession, PhaseId, PhaseStatus, PHASE_ORDER,
  Task, TaskList, ImplementationState,
  TransitionError, PhaseDocument,
} from '../shared/types';
import { StateStore } from './StateStore';
import {
  assertCanGenerate, assertCanApprove, assertCanRevise,
  assertCanReopen, assertCanNavigate, phasesAfter,
} from './PhaseTransitionGuard';
import { LLMService } from '../llm/LLMService';
import { PromptBuilder } from '../llm/PromptBuilder';
import { ResponseParser } from '../llm/ResponseParser';
import {
  RequirementDocumentSchema,
  DesignDocumentSchema,
  TaskListSchema,
  TestPlanSchema,
  ReviewReportSchema,
} from '../shared/schemas';
import { WorkspaceStateAdapter } from '../persistence/WorkspaceStateAdapter';
import { FileAdapter } from '../persistence/FileAdapter';
import { TechStackDetector } from '../workspace/TechStackDetector';
import { WebViewPanelManager } from '../panel/WebViewPanelManager';

const SCHEMA_VERSION = '1.0';

function makeEmptySession(name: string): SDLCSession {
  const now = new Date().toISOString();
  const locked = (): { status: PhaseStatus; llmMessages: []; userEdits: [] } =>
    ({ status: 'locked', llmMessages: [], userEdits: [] });
  return {
    schemaVersion: SCHEMA_VERSION,
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    currentPhase: 'requirement',
    phases: {
      requirement: { status: 'active', llmMessages: [], userEdits: [] },
      design: locked(),
      'task-breakdown': locked(),
      implementation: locked(),
      testing: locked(),
      review: locked(),
    },
  };
}

export class SessionManager {
  private activeGenerations = new Map<string, AbortController>();

  constructor(
    private readonly store: StateStore,
    private readonly llm: LLMService,
    private readonly promptBuilder: PromptBuilder,
    private readonly parser: ResponseParser,
    private readonly workspaceState: WorkspaceStateAdapter,
    private readonly fileAdapter: FileAdapter,
    private readonly techStack: TechStackDetector,
    private readonly panel: WebViewPanelManager,
  ) {}

  createSession(name: string): SDLCSession {
    const session = makeEmptySession(name);
    this.store.set(session);
    this.persist(session);
    return session;
  }

  deleteSession(id: string): void {
    this.cancelGeneration(id);
    this.store.delete(id);
    this.workspaceState.delete(id);
    this.fileAdapter.delete(id);
  }

  renameSession(id: string, name: string): void {
    const session = this.require(id);
    this.mutate(session, s => { s.name = name; });
  }

  openSession(id: string): void {
    this.panel.show(id);
  }

  navigatePhase(sessionId: string, phase: PhaseId): void {
    const session = this.require(sessionId);
    assertCanNavigate(session, phase);
    this.mutate(session, s => { s.currentPhase = phase; });
  }

  setActiveTask(sessionId: string, taskId: string): void {
    const session = this.require(sessionId);
    this.mutate(session, s => { s.activeTaskId = taskId; });
  }

  async generatePhase(sessionId: string, phase: PhaseId, taskId?: string, input?: string): Promise<void> {
    const session = this.require(sessionId);
    assertCanGenerate(session, phase);

    const controller = new AbortController();
    this.activeGenerations.set(sessionId, controller);

    this.mutate(session, s => {
      s.phases[phase].status = 'in-progress';
    });

    try {
      const stack = await this.techStack.detect();
      const messages = this.buildMessages(session, phase, stack, taskId, input);

      let fullText = '';
      await this.llm.stream(
        messages,
        (chunk) => {
          fullText += chunk;
          this.panel.postMessage({ type: 'LLM_CHUNK', content: chunk, phase });
        },
        controller.signal,
      );

      this.panel.postMessage({ type: 'LLM_COMPLETE', phase });

      if (phase === 'implementation') {
        // Implementation guidance is freeform — store as a note on the active task log
        const fresh = this.require(sessionId);
        this.mutate(fresh, s => {
          const impl = s.phases.implementation;
          const implDoc = (impl.document as ImplementationState | undefined) ?? { taskLogs: [] };
          const targetTaskId = taskId ?? s.activeTaskId;
          if (targetTaskId) {
            const log = implDoc.taskLogs.find(l => l.taskId === targetTaskId);
            if (log) { log.notes = fullText; }
            else { implDoc.taskLogs.push({ taskId: targetTaskId, status: 'in-progress', notes: fullText, filesChanged: [], blockers: [] }); }
          }
          impl.document = implDoc;
          impl.status = 'awaiting-approval';
        });
        return;
      }

      const schema = this.schemaFor(phase);
      if (!schema) { return; }

      const parsed = await this.parser.parseWithRetry(
        fullText,
        schema,
        async (correctionPrompt) => {
          const correctionMessages = [
            ...messages,
            { role: 'assistant' as const, content: fullText },
            { role: 'user' as const, content: correctionPrompt },
          ];
          let corrected = '';
          await this.llm.stream(
            correctionMessages,
            (chunk) => { corrected += chunk; },
            controller.signal,
          );
          return corrected;
        },
      );

      const fresh = this.require(sessionId);
      this.mutate(fresh, s => {
        if (!parsed.ok) {
          this.panel.postMessage({
            type: 'LLM_ERROR',
            phase,
            error: { type: 'LLMError', code: 'parse-failed', message: parsed.error, raw: parsed.raw },
          });
          s.phases[phase].status = 'active';
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s.phases[phase] as any).document = parsed.data;
          s.phases[phase].status = 'awaiting-approval';
        }
      });
    } catch (err: unknown) {
      this.activeGenerations.delete(sessionId);
      const fresh = this.require(sessionId);
      this.mutate(fresh, s => { s.phases[phase].status = 'active'; });
      if ((err as { name?: string }).name !== 'AbortError') {
        const llmErr = err as { code?: string; message?: string };
        this.panel.postMessage({
          type: 'LLM_ERROR',
          phase,
          error: {
            type: 'LLMError',
            code: (llmErr.code as 'network') ?? 'network',
            message: llmErr.message ?? 'Unknown error',
          },
        });
      }
    } finally {
      this.activeGenerations.delete(sessionId);
    }
  }

  approvePhase(sessionId: string, phase: PhaseId): void {
    const session = this.require(sessionId);
    assertCanApprove(session, phase);
    const now = new Date().toISOString();
    this.mutate(session, s => {
      s.phases[phase].status = 'approved';
      s.phases[phase].completedAt = now;
      const nextIdx = PHASE_ORDER.indexOf(phase) + 1;
      if (nextIdx < PHASE_ORDER.length) {
        const next = PHASE_ORDER[nextIdx];
        s.phases[next].status = 'active';
        s.currentPhase = next;
      }
      // Populate implementation task logs from approved task list
      if (phase === 'task-breakdown') {
        const taskDoc = s.phases['task-breakdown'].document as TaskList | undefined;
        if (taskDoc) {
          const impl = s.phases.implementation;
          const existing = (impl.document as ImplementationState | undefined) ?? { taskLogs: [] };
          const existingIds = new Set(existing.taskLogs.map(l => l.taskId));
          for (const t of taskDoc.tasks) {
            if (!existingIds.has(t.id)) {
              existing.taskLogs.push({ taskId: t.id, status: 'todo', notes: '', filesChanged: [], blockers: [] });
            }
          }
          impl.document = existing;
        }
      }
    });
  }

  requestRevision(sessionId: string, phase: PhaseId): void {
    const session = this.require(sessionId);
    assertCanRevise(session, phase);
    this.mutate(session, s => { s.phases[phase].status = 'in-progress'; });
  }

  reopenPhase(sessionId: string, phase: PhaseId): void {
    const session = this.require(sessionId);
    assertCanReopen(session, phase);
    this.cancelGeneration(sessionId);
    this.mutate(session, s => {
      s.phases[phase].status = 'active';
      s.currentPhase = phase;
      for (const downstream of phasesAfter(phase)) {
        s.phases[downstream].status = 'locked';
        s.phases[downstream].document = undefined;
        s.phases[downstream].completedAt = undefined;
      }
    });
  }

  updateDocument(sessionId: string, phase: PhaseId, patch: Record<string, unknown>): void {
    const session = this.require(sessionId);
    this.mutate(session, s => {
      s.phases[phase].document = { ...(s.phases[phase].document ?? {}), ...patch } as PhaseDocument;
    });
  }

  updateTask(sessionId: string, taskId: string, patch: Partial<Task>): void {
    const session = this.require(sessionId);
    this.mutate(session, s => {
      const taskDoc = s.phases['task-breakdown'].document as TaskList | undefined;
      if (taskDoc) {
        const task = taskDoc.tasks.find(t => t.id === taskId);
        if (task) { Object.assign(task, patch); }
      }
      const impl = s.phases.implementation.document as ImplementationState | undefined;
      if (impl && patch.status) {
        const log = impl.taskLogs.find(l => l.taskId === taskId);
        if (log) { log.status = patch.status as typeof log.status; }
      }
    });
  }

  reorderTasks(sessionId: string, orderedIds: string[]): void {
    const session = this.require(sessionId);
    this.mutate(session, s => {
      const taskDoc = s.phases['task-breakdown'].document as TaskList | undefined;
      if (!taskDoc) { return; }
      const map = new Map(taskDoc.tasks.map(t => [t.id, t]));
      taskDoc.tasks = orderedIds.map(id => map.get(id)).filter(Boolean) as Task[];
    });
  }

  addTask(sessionId: string, task: Omit<Task, 'id'>): void {
    const session = this.require(sessionId);
    const id = `T-${randomUUID().slice(0, 8)}`;
    this.mutate(session, s => {
      const taskDoc = s.phases['task-breakdown'].document as TaskList | undefined;
      if (taskDoc) { taskDoc.tasks.push({ ...task, id }); }
    });
  }

  deleteTask(sessionId: string, taskId: string): void {
    const session = this.require(sessionId);
    this.mutate(session, s => {
      const taskDoc = s.phases['task-breakdown'].document as TaskList | undefined;
      if (taskDoc) { taskDoc.tasks = taskDoc.tasks.filter(t => t.id !== taskId); }
    });
  }

  completeSession(sessionId: string): void {
    const session = this.require(sessionId);
    assertCanApprove(session, 'review');
    this.approvePhase(sessionId, 'review');
  }

  restartFromPhase(sessionId: string, phase: PhaseId): void {
    this.reopenPhase(sessionId, phase);
  }

  exportSession(sessionId: string): string {
    const session = this.require(sessionId);
    return this.buildMarkdownExport(session);
  }

  // --- private helpers ---

  private require(id: string): SDLCSession {
    const s = this.store.get(id);
    if (!s) { throw new Error(`Session not found: ${id}`); }
    return s;
  }

  private mutate(session: SDLCSession, fn: (s: SDLCSession) => void): void {
    fn(session);
    session.updatedAt = new Date().toISOString();
    this.store.set(session);
    this.persist(session);
  }

  private persist(session: SDLCSession): void {
    this.workspaceState.save(session);
    this.fileAdapter.save(session);
  }

  private cancelGeneration(sessionId: string): void {
    const ctrl = this.activeGenerations.get(sessionId);
    if (ctrl) { ctrl.abort(); this.activeGenerations.delete(sessionId); }
  }

  private buildMessages(
    session: SDLCSession,
    phase: PhaseId,
    stack: string,
    taskId?: string,
    input?: string,
  ): { role: 'user' | 'assistant'; content: string }[] {
    switch (phase) {
      case 'requirement': {
        const reqDoc = session.phases.requirement.document as (Record<string, unknown> | undefined);
        const userInput = input ?? (reqDoc?._input as string | undefined) ?? '';
        return this.promptBuilder.buildRequirementPrompt(userInput);
      }
      case 'design': return this.promptBuilder.buildDesignPrompt(session, stack);
      case 'task-breakdown': return this.promptBuilder.buildTaskBreakdownPrompt(session);
      case 'implementation': {
        const task = (session.phases['task-breakdown'].document as TaskList | undefined)
          ?.tasks.find(t => t.id === (taskId ?? session.activeTaskId));
        if (!task) { throw new Error('No active task selected'); }
        return this.promptBuilder.buildImplementationPrompt(task, session);
      }
      case 'testing': return this.promptBuilder.buildTestingPrompt(session);
      case 'review': return this.promptBuilder.buildReviewPrompt(session);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private schemaFor(phase: PhaseId): any {
    switch (phase) {
      case 'requirement': return RequirementDocumentSchema;
      case 'design': return DesignDocumentSchema;
      case 'task-breakdown': return TaskListSchema;
      case 'testing': return TestPlanSchema;
      case 'review': return ReviewReportSchema;
      default: return null;
    }
  }

  private buildMarkdownExport(session: SDLCSession): string {
    const created = new Date(session.createdAt).toLocaleString();
    const lines: string[] = [
      `# ${session.name}`,
      `> Created: ${created}`,
      '',
    ];

    // Requirement
    const req = session.phases.requirement;
    lines.push('## Requirements');
    if (req.document) {
      const d = req.document as import('../shared/types').RequirementDocument;
      lines.push('', d.summary, '');
      lines.push('### Functional Requirements');
      for (const r of d.functional) {
        lines.push(`- **[${r.id}]** *(${r.priority})* ${r.description}`);
      }
      if (d.nonFunctional.length) {
        lines.push('', '### Non-Functional Requirements');
        for (const r of d.nonFunctional) {
          lines.push(`- **[${r.id}]** *(${r.category})* ${r.description}`);
        }
      }
      if (d.acceptanceCriteria.length) {
        lines.push('', '### Acceptance Criteria');
        for (const c of d.acceptanceCriteria) { lines.push(`- ${c}`); }
      }
      if (d.outOfScope.length) {
        lines.push('', '### Out of Scope');
        for (const s of d.outOfScope) { lines.push(`- ${s}`); }
      }
      const open = d.openQuestions.filter(q => q.status === 'open');
      if (open.length) {
        lines.push('', '### Open Questions');
        for (const q of open) { lines.push(`- **[${q.id}]** ${q.question}`); }
      }
    } else {
      lines.push('', '_Not completed._');
    }

    // Design
    const design = session.phases.design;
    lines.push('', '---', '', '## Design');
    if (design.document) {
      const d = design.document as import('../shared/types').DesignDocument;
      lines.push('', d.architectureOverview);
      if (d.components.length) {
        lines.push('', '### Components');
        for (const c of d.components) {
          lines.push(``, `#### ${c.name}`, c.responsibility);
          if (c.interfaces.length) {
            lines.push('Interfaces: ' + c.interfaces.join(', '));
          }
        }
      }
      if (d.apiContracts.length) {
        lines.push('', '### API Contracts');
        for (const a of d.apiContracts) {
          lines.push(`- \`${a.method} ${a.endpoint}\` — Auth: ${a.auth}`);
        }
      }
      if (d.sequenceFlows.length) {
        lines.push('', '### Sequence Flows');
        for (const f of d.sequenceFlows) {
          lines.push('', `#### ${f.title}`, '```mermaid', f.diagram, '```');
        }
      }
      if (d.decisionsLog.length) {
        lines.push('', '### Decision Log');
        for (const dec of d.decisionsLog) {
          lines.push(``, `**${dec.decision}**`, dec.rationale);
        }
      }
    } else {
      lines.push('', '_Not completed._');
    }

    // Task Breakdown
    const tb = session.phases['task-breakdown'];
    lines.push('', '---', '', '## Tasks');
    if (tb.document) {
      const d = tb.document as import('../shared/types').TaskList;
      const byStatus = (s: string) => d.tasks.filter(t => t.status === s);
      const renderTasks = (tasks: import('../shared/types').Task[]) => {
        for (const t of tasks) {
          const check = t.status === 'done' ? '[x]' : '[ ]';
          lines.push(`- ${check} **[${t.id}]** ${t.title} *(${t.complexity} · ${t.category})*`);
        }
      };
      renderTasks(d.tasks);
    } else {
      lines.push('', '_Not completed._');
    }

    // Testing
    const testing = session.phases.testing;
    lines.push('', '---', '', '## Test Plan');
    if (testing.document) {
      const d = testing.document as import('../shared/types').TestPlan;
      lines.push('', d.strategy, '');
      lines.push('| ID | Type | Title | Expected Result | Status |');
      lines.push('|---|---|---|---|---|');
      for (const tc of d.testCases) {
        lines.push(`| ${tc.id} | ${tc.type} | ${tc.title} | ${tc.expectedResult} | ${tc.status} |`);
      }
    } else {
      lines.push('', '_Not completed._');
    }

    // Review
    const review = session.phases.review;
    lines.push('', '---', '', '## Review');
    if (review.document) {
      const d = review.document as import('../shared/types').ReviewReport;
      const badge = d.recommendation === 'ship' ? '✅ Ready to ship' : '⚠️ Needs revision';
      lines.push('', badge);
      if (d.revisitReason) { lines.push('', d.revisitReason); }
      if (d.gaps.length) {
        lines.push('', '### Gaps');
        for (const g of d.gaps) {
          lines.push(`- **[${g.severity}]** ${g.description}`);
        }
      }
      lines.push('', '### Requirement Coverage');
      lines.push('| Requirement | Coverage |');
      lines.push('|---|---|');
      for (const item of d.requirementCoverage) {
        lines.push(`| ${item.requirementId} | ${item.coverageStatus} |`);
      }
    } else {
      lines.push('', '_Not completed._');
    }

    lines.push('');
    return lines.join('\n');
  }
}
