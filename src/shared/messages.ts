import type {
  PhaseId,
  SDLCSession,
  Task,
  LLMError,
} from './types';

export type WebViewCommand =
  | { type: 'WEBVIEW_READY' }
  | { type: 'GENERATE_PHASE'; phase: PhaseId; taskId?: string }
  | { type: 'APPROVE_PHASE'; phase: PhaseId }
  | { type: 'REVISE_PHASE'; phase: PhaseId }
  | { type: 'UPDATE_DOCUMENT'; phase: PhaseId; patch: Record<string, unknown> }
  | { type: 'UPDATE_TASK'; taskId: string; patch: Partial<Task> }
  | { type: 'REORDER_TASKS'; orderedIds: string[] }
  | { type: 'ADD_TASK'; task: Omit<Task, 'id'> }
  | { type: 'DELETE_TASK'; taskId: string }
  | { type: 'NAVIGATE_PHASE'; phase: PhaseId }
  | { type: 'SET_ACTIVE_TASK'; taskId: string }
  | { type: 'COMPLETE_SESSION' }
  | { type: 'RESTART_FROM_PHASE'; phase: PhaseId };

export type ExtensionMessage =
  | { type: 'SESSION_UPDATE'; session: SDLCSession }
  | { type: 'SESSION_DELETED' }
  | { type: 'LLM_CHUNK'; content: string; phase: PhaseId }
  | { type: 'LLM_COMPLETE'; phase: PhaseId }
  | { type: 'LLM_ERROR'; phase: PhaseId; error: LLMError }
  | { type: 'TRANSITION_ERROR'; message: string; requiredPhase?: PhaseId }
  | { type: 'VALIDATION_ERROR'; phase: PhaseId; fields: string[] };
