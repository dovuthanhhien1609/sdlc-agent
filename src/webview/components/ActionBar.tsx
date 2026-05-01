import React from 'react';
import { PhaseId, PhaseStatus, PHASE_LABELS } from '../../shared/types';
import { postCommand } from '../store/sessionStore';

interface Props {
  phase: PhaseId;
  status: PhaseStatus;
  isGenerating: boolean;
  onGenerate?: () => void;
  latestActivePhase?: PhaseId;
}

export function ActionBar({ phase, status, isGenerating, onGenerate, latestActivePhase }: Props) {
  if (status === 'locked') {
    return (
      <div className="action-bar">
        <span style={{ opacity: 0.5, fontSize: 12 }}>
          Complete the previous phase to unlock this one.
        </span>
      </div>
    );
  }

  if (phase === 'review' && status === 'approved') {
    return (
      <div className="action-bar">
        <span style={{ color: 'var(--vscode-testing-iconPassed)', fontSize: 12 }}>
          ✓ Session complete
        </span>
      </div>
    );
  }

  // 'in-progress' means the extension kicked off a generation; isGenerating becomes
  // true only after the first LLM_CHUNK arrives. Treat both as "busy" so the user
  // sees immediate feedback and can't accidentally fire a second concurrent request.
  const isBusy = isGenerating || status === 'in-progress';

  return (
    <div className="action-bar">
      {(status === 'active' || status === 'in-progress') && (
        <>
          {isBusy ? (
            <button className="btn-secondary" disabled>
              Generating…
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={onGenerate}
            >
              Generate
            </button>
          )}
        </>
      )}

      {status === 'awaiting-approval' && (
        <>
          <button
            className="btn-secondary"
            onClick={() => postCommand({ type: 'REVISE_PHASE', phase })}
          >
            Request Revision
          </button>
          {phase === 'review' ? (
            <button
              className="btn-primary"
              onClick={() => postCommand({ type: 'COMPLETE_SESSION' })}
            >
              Complete Feature ✓
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => postCommand({ type: 'APPROVE_PHASE', phase })}
            >
              Approve &amp; Continue →
            </button>
          )}
        </>
      )}

      {status === 'approved' && phase !== 'review' && (
        <>
          {latestActivePhase && latestActivePhase !== phase && (
            <button
              className="btn-primary"
              onClick={() => postCommand({ type: 'NAVIGATE_PHASE', phase: latestActivePhase })}
            >
              Back to {PHASE_LABELS[latestActivePhase]} →
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={() => postCommand({ type: 'RESTART_FROM_PHASE', phase })}
          >
            Re-open Phase
          </button>
        </>
      )}
    </div>
  );
}
