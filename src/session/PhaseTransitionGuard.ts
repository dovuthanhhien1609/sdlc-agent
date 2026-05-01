import { SDLCSession, PhaseId, PHASE_ORDER, TransitionError } from '../shared/types';

function err(message: string, requiredPhase?: PhaseId): never {
  const e: TransitionError = { type: 'TransitionError', message, requiredPhase };
  throw e;
}

export function assertCanGenerate(session: SDLCSession, phase: PhaseId): void {
  const state = session.phases[phase];
  if (state.status === 'locked') {
    const idx = PHASE_ORDER.indexOf(phase);
    const prev = PHASE_ORDER[idx - 1];
    err(`Complete "${prev}" before generating "${phase}".`, prev);
  }
  if (state.status === 'approved') {
    err(`Phase "${phase}" is already approved. Request revision first.`);
  }
}

export function assertCanApprove(session: SDLCSession, phase: PhaseId): void {
  const state = session.phases[phase];
  if (state.status !== 'awaiting-approval') {
    err(`Phase "${phase}" must be in "awaiting-approval" state to approve. Current: ${state.status}`);
  }
  if (!state.document) {
    err(`Phase "${phase}" has no document to approve.`);
  }
}

export function assertCanRevise(session: SDLCSession, phase: PhaseId): void {
  const state = session.phases[phase];
  if (state.status !== 'awaiting-approval' && state.status !== 'approved') {
    err(`Phase "${phase}" must be awaiting-approval or approved to request revision.`);
  }
}

export function assertCanReopen(session: SDLCSession, phase: PhaseId): void {
  const state = session.phases[phase];
  if (state.status !== 'approved') {
    err(`Only approved phases can be reopened. "${phase}" is currently: ${state.status}`);
  }
}

export function assertCanNavigate(session: SDLCSession, phase: PhaseId): void {
  const state = session.phases[phase];
  if (state.status === 'locked') {
    const idx = PHASE_ORDER.indexOf(phase);
    const prev = PHASE_ORDER[idx - 1];
    err(`Phase "${phase}" is locked. Complete "${prev}" first.`, prev);
  }
}

export function phasesAfter(phase: PhaseId): PhaseId[] {
  const idx = PHASE_ORDER.indexOf(phase);
  return PHASE_ORDER.slice(idx + 1);
}
