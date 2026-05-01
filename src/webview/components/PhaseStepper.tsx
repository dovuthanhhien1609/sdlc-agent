import React from 'react';
import { SDLCSession, PhaseId, PHASE_ORDER, PHASE_LABELS } from '../../shared/types';
import { postCommand } from '../store/sessionStore';

interface Props {
  session: SDLCSession;
}

export function PhaseStepper({ session }: Props) {
  function handleClick(phase: PhaseId) {
    const status = session.phases[phase].status;
    if (status !== 'locked') {
      postCommand({ type: 'NAVIGATE_PHASE', phase });
    }
  }

  return (
    <div className="phase-stepper">
      {PHASE_ORDER.map((phase, i) => {
        const status = session.phases[phase].status;
        const isCurrent = session.currentPhase === phase;
        const isApproved = status === 'approved';
        const isLocked = status === 'locked';

        let cls = 'step';
        if (isCurrent) { cls += ' current'; }
        else if (isApproved) { cls += ' approved'; }
        else if (isLocked) { cls += ' locked'; }
        else { cls += ' clickable'; }

        return (
          <React.Fragment key={phase}>
            {i > 0 && <span className="step-divider">›</span>}
            <div
              className={cls}
              onClick={() => handleClick(phase)}
              title={isLocked ? 'Complete the previous phase first' : undefined}
            >
              {isApproved ? '✓ ' : `${i + 1}. `}{PHASE_LABELS[phase]}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
