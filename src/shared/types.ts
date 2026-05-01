export type PhaseId =
  | 'requirement'
  | 'design'
  | 'task-breakdown'
  | 'implementation'
  | 'testing'
  | 'review';

export type PhaseStatus =
  | 'locked'
  | 'active'
  | 'in-progress'
  | 'awaiting-approval'
  | 'approved';

export const PHASE_ORDER: PhaseId[] = [
  'requirement',
  'design',
  'task-breakdown',
  'implementation',
  'testing',
  'review',
];

export const PHASE_LABELS: Record<PhaseId, string> = {
  'requirement': 'Requirement',
  'design': 'Design',
  'task-breakdown': 'Task Breakdown',
  'implementation': 'Implementation',
  'testing': 'Testing',
  'review': 'Review',
};

// --- Document types ---

export interface Requirement {
  id: string;
  description: string;
  priority: 'must' | 'should' | 'could';
}

export interface OpenQuestion {
  id: string;
  question: string;
  status: 'open' | 'resolved';
  answer?: string;
}

export interface RequirementDocument {
  summary: string;
  functional: Requirement[];
  nonFunctional: { id: string; description: string; category: string }[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  openQuestions: OpenQuestion[];
}

export interface Component {
  name: string;
  responsibility: string;
  interfaces: string[];
}

export interface DataModel {
  entity: string;
  fields: { name: string; type: string; constraints?: string }[];
  relationships: string[];
}

export interface ApiContract {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  auth: string;
}

export interface SequenceDiagram {
  title: string;
  diagram: string;
}

export interface Decision {
  decision: string;
  rationale: string;
  alternativesConsidered: string[];
}

export interface DesignDocument {
  architectureOverview: string;
  components: Component[];
  dataModels: DataModel[];
  apiContracts: ApiContract[];
  sequenceFlows: SequenceDiagram[];
  decisionsLog: Decision[];
}

export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'blocked';
export type TaskComplexity = 'S' | 'M' | 'L';
export type TaskCategory = 'frontend' | 'backend' | 'infra' | 'test' | 'config';

export interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  complexity: TaskComplexity;
  category: TaskCategory;
  status: TaskStatus;
  requirementIds: string[];
  blockerReason?: string;
}

export interface TaskList {
  tasks: Task[];
}

export interface TaskLog {
  taskId: string;
  status: TaskStatus;
  notes: string;
  filesChanged: string[];
  blockers: string[];
  completedAt?: string;
}

export interface ImplementationState {
  taskLogs: TaskLog[];
}

export type TestCaseStatus = 'pending' | 'written' | 'passing' | 'failing';
export type TestCaseType = 'unit' | 'integration' | 'e2e' | 'manual';

export interface TestCase {
  id: string;
  type: TestCaseType;
  title: string;
  scenario: string;
  expectedResult: string;
  requirementId?: string;
  status: TestCaseStatus;
}

export interface TestPlan {
  strategy: string;
  testCases: TestCase[];
}

export type CoverageStatus = 'complete' | 'partial' | 'missing';
export type GapSeverity = 'critical' | 'warning' | 'info';

export interface CoverageItem {
  requirementId: string;
  taskIds: string[];
  testCaseIds: string[];
  coverageStatus: CoverageStatus;
}

export interface Gap {
  description: string;
  severity: GapSeverity;
  affectedRequirementIds?: string[];
}

export interface ReviewReport {
  requirementCoverage: CoverageItem[];
  designAdherence: { component: string; note: string; status: 'followed' | 'deviated' | 'not-applicable' }[];
  gaps: Gap[];
  recommendation: 'ship' | 'revisit';
  revisitPhase?: PhaseId;
  revisitReason?: string;
}

export type PhaseDocument =
  | RequirementDocument
  | DesignDocument
  | TaskList
  | ImplementationState
  | TestPlan
  | ReviewReport;

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface EditRecord {
  field: string;
  originalValue: unknown;
  newValue: unknown;
  editedAt: string;
}

export interface PhaseState<T extends PhaseDocument = PhaseDocument> {
  status: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  document?: T;
  llmMessages: LLMMessage[];
  userEdits: EditRecord[];
  summary?: string;
}

export interface SDLCSession {
  schemaVersion: string;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentPhase: PhaseId;
  activeTaskId?: string;
  phases: {
    requirement: PhaseState<RequirementDocument>;
    design: PhaseState<DesignDocument>;
    'task-breakdown': PhaseState<TaskList>;
    implementation: PhaseState<ImplementationState>;
    testing: PhaseState<TestPlan>;
    review: PhaseState<ReviewReport>;
  };
}

export interface TransitionError {
  type: 'TransitionError';
  message: string;
  requiredPhase?: PhaseId;
}

export interface ParseError {
  type: 'ParseError';
  message: string;
  missingFields?: string[];
  raw: string;
}

export interface LLMError {
  type: 'LLMError';
  code: 'network' | 'rate-limit' | 'unauthorized' | 'timeout' | 'parse-failed' | 'server-error';
  message: string;
  retryAfter?: number;
  raw?: string;
}
