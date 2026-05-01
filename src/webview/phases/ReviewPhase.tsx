import React, { useState } from 'react';
import { SDLCSession, ReviewReport, PhaseId, PHASE_ORDER, PHASE_LABELS } from '../../shared/types';
import { postCommand } from '../store/sessionStore';
import { StreamingText } from '../components/StreamingText';

interface Props {
  session: SDLCSession;
  streamBuffer: string;
  isGenerating: boolean;
}

export function ReviewPhase({ session, streamBuffer, isGenerating }: Props) {
  const phase = session.phases.review;
  const doc = phase.document as ReviewReport | undefined;
  const isReadOnly = phase.status === 'approved';
  const isLoading = isGenerating || phase.status === 'in-progress';
  const [revisitPhase, setRevisitPhase] = useState<PhaseId>('requirement');

  return (
    <div>
      <div className="phase-header">
        <h2>Review {isReadOnly && <span className="read-only-badge">Complete</span>}</h2>
        <p>Final pre-ship audit: verify requirements were met, design was followed, tests exist.</p>
      </div>

      {!doc && isLoading && <StreamingText content={streamBuffer} />}
      {!doc && !isLoading && (
        <div className="empty-state">
          <h3>No review report generated yet</h3>
          <p>Click "Generate" to run the final audit across all phase documents.</p>
        </div>
      )}

      {doc && (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 6,
            marginBottom: 16,
            background: doc.recommendation === 'ship'
              ? 'rgba(115, 201, 145, 0.15)'
              : 'rgba(204, 167, 0, 0.15)',
            border: `1px solid ${doc.recommendation === 'ship' ? 'var(--vscode-testing-iconPassed, #73c991)' : '#cca700'}`,
          }}>
            <span style={{ fontSize: 24 }}>{doc.recommendation === 'ship' ? '✅' : '⚠️'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {doc.recommendation === 'ship' ? 'Ready to ship' : 'Review needed before shipping'}
              </div>
              {doc.revisitReason && (
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{doc.revisitReason}</div>
              )}
            </div>
          </div>

          {doc.gaps.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px' }}>Gaps ({doc.gaps.length})</h4>
              {doc.gaps.map((gap, i) => (
                <div key={i} className={`gap-item severity-${gap.severity}`}>
                  <div>
                    <span className="badge" style={{
                      fontSize: 10,
                      background: gap.severity === 'critical' ? '#dc3545' : gap.severity === 'warning' ? '#cca700' : '#3794ff',
                      color: '#fff',
                    }}>
                      {gap.severity}
                    </span>
                  </div>
                  <div style={{ flex: 1, fontSize: 12 }}>
                    {gap.description}
                    {gap.affectedRequirementIds?.length ? (
                      <span style={{ opacity: 0.6, marginLeft: 6 }}>({gap.affectedRequirementIds.join(', ')})</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px' }}>Requirement Coverage</h4>
            <table className="coverage-table">
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Tasks</th>
                  <th>Tests</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {doc.requirementCoverage.map(item => (
                  <tr key={item.requirementId}>
                    <td>{item.requirementId}</td>
                    <td>{item.taskIds.join(', ') || '—'}</td>
                    <td>{item.testCaseIds.join(', ') || '—'}</td>
                    <td className={`coverage-${item.coverageStatus}`}>
                      {item.coverageStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {doc.designAdherence.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px' }}>Design Adherence</h4>
              {doc.designAdherence.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, padding: '6px 10px', border: '1px solid var(--vscode-panel-border)', borderRadius: 4 }}>
                  <span style={{ fontWeight: 600, width: 140, flexShrink: 0 }}>{item.component}</span>
                  <span style={{ flex: 1, opacity: 0.8 }}>{item.note}</span>
                  <span className={`badge ${item.status === 'followed' ? 'badge-done' : item.status === 'deviated' ? 'badge-blocked' : 'badge-todo'}`} style={{ fontSize: 10 }}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!isReadOnly && (
            <div style={{ padding: '12px 16px', border: '1px solid var(--vscode-panel-border)', borderRadius: 4 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12 }}>Go back to a phase</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={revisitPhase} onChange={e => setRevisitPhase(e.target.value as PhaseId)}>
                  {PHASE_ORDER.filter(p => p !== 'review').map(p => (
                    <option key={p} value={p}>{PHASE_LABELS[p]}</option>
                  ))}
                </select>
                <button
                  className="btn-danger"
                  style={{ fontSize: 12 }}
                  onClick={() => postCommand({ type: 'RESTART_FROM_PHASE', phase: revisitPhase })}
                >
                  Go Back
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
