import React, { useState } from 'react';
import { SDLCSession, TestPlan, TestCase, TestCaseType, TestCaseStatus } from '../../shared/types';
import { postCommand } from '../store/sessionStore';
import { StreamingText } from '../components/StreamingText';

interface Props {
  session: SDLCSession;
  streamBuffer: string;
  isGenerating: boolean;
}

export function TestingPhase({ session, streamBuffer, isGenerating }: Props) {
  const phase = session.phases.testing;
  const doc = phase.document as TestPlan | undefined;
  const isReadOnly = phase.status === 'approved';
  const isLoading = isGenerating || phase.status === 'in-progress';
  const [tab, setTab] = useState<TestCaseType>('unit');

  const cases = doc?.testCases ?? [];
  const byType = (type: TestCaseType) => cases.filter(c => c.type === type);
  const passing = cases.filter(c => c.status === 'passing').length;

  function updateStatus(tc: TestCase, status: TestCaseStatus) {
    const updated = cases.map(c => c.id === tc.id ? { ...c, status } : c);
    postCommand({ type: 'UPDATE_DOCUMENT', phase: 'testing', patch: { testCases: updated } });
  }

  return (
    <div>
      <div className="phase-header">
        <h2>Testing {isReadOnly && <span className="read-only-badge">Approved</span>}</h2>
        <p>Generate a comprehensive test plan ensuring every requirement is verifiable.</p>
      </div>

      {!doc && isLoading && <StreamingText content={streamBuffer} />}
      {!doc && !isLoading && (
        <div className="empty-state">
          <h3>No test plan generated yet</h3>
          <p>Click "Generate" to create a test plan from your requirements.</p>
        </div>
      )}

      {doc && (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', marginBottom: 4 }}>
              Strategy
            </div>
            <p style={{ margin: 0, fontSize: 13 }}>{doc.strategy}</p>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12 }}>
            <span>Total: <strong>{cases.length}</strong></span>
            <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>Passing: <strong>{passing}</strong></span>
            <span style={{ color: '#f14c4c' }}>Failing: <strong>{cases.filter(c => c.status === 'failing').length}</strong></span>
            <span>Pending: <strong>{cases.filter(c => c.status === 'pending').length}</strong></span>
          </div>

          <div className="tabs">
            {(['unit', 'integration', 'e2e', 'manual'] as TestCaseType[]).map(t => (
              <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t} ({byType(t).length})
              </div>
            ))}
          </div>

          {byType(tab).length === 0 && (
            <p style={{ opacity: 0.6, fontSize: 13 }}>No {tab} test cases defined.</p>
          )}

          {byType(tab).map(tc => (
            <TestCaseCard key={tc.id} tc={tc} readOnly={isReadOnly} onStatusChange={updateStatus} />
          ))}
        </>
      )}
    </div>
  );
}

function TestCaseCard({
  tc,
  readOnly,
  onStatusChange,
}: {
  tc: TestCase;
  readOnly: boolean;
  onStatusChange: (tc: TestCase, status: TestCaseStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColor: Record<TestCaseStatus, string> = {
    pending: 'var(--vscode-badge-background)',
    written: '#0d6efd',
    passing: 'var(--vscode-testing-iconPassed, #73c991)',
    failing: '#dc3545',
  };

  return (
    <div className="section" style={{ marginBottom: 8 }}>
      <div className="section-header" style={{ cursor: 'pointer' }} onClick={() => setExpanded(x => !x)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span className={`badge badge-${tc.type}`}>{tc.type}</span>
          <span style={{ fontSize: 12 }}>{tc.id}: {tc.title}</span>
          {tc.requirementId && (
            <span className="req-id" style={{ fontSize: 10 }}>{tc.requirementId}</span>
          )}
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          padding: '1px 6px',
          borderRadius: 3,
          background: statusColor[tc.status],
          color: '#fff',
        }}>
          {tc.status}
        </span>
      </div>

      {expanded && (
        <div className="section-body">
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Scenario</div>
            <p style={{ margin: 0, fontSize: 12 }}>{tc.scenario}</p>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Expected Result</div>
            <p style={{ margin: 0, fontSize: 12 }}>{tc.expectedResult}</p>
          </div>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 4 }}>
              {(['pending', 'written', 'passing', 'failing'] as TestCaseStatus[]).map(s => (
                <button
                  key={s}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 3, border: 'none', cursor: 'pointer', background: tc.status === s ? statusColor[s] : 'var(--vscode-button-secondaryBackground)', color: tc.status === s ? '#fff' : 'var(--vscode-button-secondaryForeground)' }}
                  onClick={() => onStatusChange(tc, s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
