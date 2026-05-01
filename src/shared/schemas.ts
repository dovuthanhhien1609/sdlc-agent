import { z } from 'zod';

const RequirementSchema = z.object({
  id: z.string(),
  description: z.string().min(1),
  priority: z.enum(['must', 'should', 'could']),
});

const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  status: z.enum(['open', 'resolved']),
  answer: z.string().optional(),
});

export const RequirementDocumentSchema = z.object({
  summary: z.string().min(1),
  functional: z.array(RequirementSchema).min(1),
  nonFunctional: z.array(z.object({
    id: z.string(),
    description: z.string().min(1),
    category: z.string(),
  })),
  outOfScope: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()).min(1),
  openQuestions: z.array(OpenQuestionSchema),
});

export const DesignDocumentSchema = z.object({
  architectureOverview: z.string().min(1),
  components: z.array(z.object({
    name: z.string(),
    responsibility: z.string(),
    interfaces: z.array(z.string()),
  })).min(1),
  dataModels: z.array(z.object({
    entity: z.string(),
    fields: z.array(z.object({
      name: z.string(),
      type: z.string(),
      constraints: z.string().optional(),
    })),
    relationships: z.array(z.string()),
  })),
  apiContracts: z.array(z.object({
    endpoint: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    request: z.record(z.string(), z.unknown()),
    response: z.record(z.string(), z.unknown()),
    auth: z.string(),
  })),
  sequenceFlows: z.array(z.object({
    title: z.string(),
    diagram: z.string(),
  })),
  decisionsLog: z.array(z.object({
    decision: z.string(),
    rationale: z.string(),
    alternativesConsidered: z.array(z.string()),
  })),
});

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string()),
  dependencies: z.array(z.string()),
  complexity: z.enum(['S', 'M', 'L']),
  category: z.enum(['frontend', 'backend', 'infra', 'test', 'config']),
  status: z.enum(['todo', 'in-progress', 'done', 'blocked']),
  requirementIds: z.array(z.string()),
  blockerReason: z.string().optional(),
});

export const TaskListSchema = z.object({
  tasks: z.array(TaskSchema).min(1),
});

export const TestCaseSchema = z.object({
  id: z.string(),
  type: z.enum(['unit', 'integration', 'e2e', 'manual']),
  title: z.string().min(1),
  scenario: z.string().min(1),
  expectedResult: z.string().min(1),
  requirementId: z.string().optional(),
  status: z.enum(['pending', 'written', 'passing', 'failing']),
});

export const TestPlanSchema = z.object({
  strategy: z.string().min(1),
  testCases: z.array(TestCaseSchema).min(1),
});

export const ReviewReportSchema = z.object({
  requirementCoverage: z.array(z.object({
    requirementId: z.string(),
    taskIds: z.array(z.string()),
    testCaseIds: z.array(z.string()),
    coverageStatus: z.enum(['complete', 'partial', 'missing']),
  })),
  designAdherence: z.array(z.object({
    component: z.string(),
    note: z.string(),
    status: z.enum(['followed', 'deviated', 'not-applicable']),
  })),
  gaps: z.array(z.object({
    description: z.string(),
    severity: z.enum(['critical', 'warning', 'info']),
    affectedRequirementIds: z.array(z.string()).optional(),
  })),
  recommendation: z.enum(['ship', 'revisit']),
  revisitPhase: z.enum(['requirement', 'design', 'task-breakdown', 'implementation', 'testing', 'review']).optional(),
  revisitReason: z.string().optional(),
});
