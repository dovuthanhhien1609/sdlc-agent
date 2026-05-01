import React, { useState } from 'react';
import { SDLCSession, DesignDocument } from '../../shared/types';
import { StreamingText } from '../components/StreamingText';

interface Props {
  session: SDLCSession;
  streamBuffer: string;
  isGenerating: boolean;
}

type Tab = 'architecture' | 'data-models' | 'apis' | 'sequences';

export function DesignPhase({ session, streamBuffer, isGenerating }: Props) {
  const [tab, setTab] = useState<Tab>('architecture');
  const phase = session.phases.design;
  const doc = phase.document as DesignDocument | undefined;
  const isReadOnly = phase.status === 'approved';
  const isLoading = isGenerating || phase.status === 'in-progress';

  return (
    <div>
      <div className="phase-header">
        <h2>Design {isReadOnly && <span className="read-only-badge">Approved</span>}</h2>
        <p>Translate requirements into a technical architecture. Approve Requirements first.</p>
      </div>

      {!doc && isLoading && <StreamingText content={streamBuffer} />}
      {!doc && !isLoading && phase.status !== 'approved' && (
        <div className="empty-state">
          <h3>No design generated yet</h3>
          <p>Click "Generate" to create a technical design from your requirements.</p>
        </div>
      )}

      {doc && (
        <>
          <div className="tabs">
            {(['architecture', 'data-models', 'apis', 'sequences'] as Tab[]).map(t => (
              <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'architecture' ? 'Architecture' :
                 t === 'data-models' ? 'Data Models' :
                 t === 'apis' ? 'APIs' : 'Sequences'}
              </div>
            ))}
          </div>

          {tab === 'architecture' && (
            <div>
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{doc.architectureOverview}</p>
              <h4 style={{ marginBottom: 8 }}>Components</h4>
              {doc.components.map((c, i) => (
                <div key={i} className="section" style={{ marginBottom: 8 }}>
                  <div className="section-header" style={{ cursor: 'default' }}>
                    <span>{c.name}</span>
                  </div>
                  <div className="section-body" style={{ fontSize: 12 }}>
                    <p style={{ margin: '0 0 6px' }}>{c.responsibility}</p>
                    {c.interfaces.length > 0 && (
                      <div style={{ opacity: 0.7 }}>Interfaces: {c.interfaces.join(', ')}</div>
                    )}
                  </div>
                </div>
              ))}
              {doc.decisionsLog.length > 0 && (
                <>
                  <h4 style={{ marginBottom: 8 }}>Decision Log</h4>
                  {doc.decisionsLog.map((d, i) => (
                    <div key={i} style={{ marginBottom: 10, padding: 10, border: '1px solid var(--vscode-panel-border)', borderRadius: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{d.decision}</div>
                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{d.rationale}</div>
                      {d.alternativesConsidered.length > 0 && (
                        <div style={{ fontSize: 11, opacity: 0.6 }}>
                          Alternatives: {d.alternativesConsidered.join('; ')}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === 'data-models' && (
            <div>
              {doc.dataModels.length === 0 && <p style={{ opacity: 0.6 }}>No data models defined.</p>}
              {doc.dataModels.map((m, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px' }}>{m.entity}</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 6 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Field</th>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Constraints</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.fields.map((f, j) => (
                        <tr key={j}>
                          <td style={tdStyle}>{f.name}</td>
                          <td style={tdStyle}><code>{f.type}</code></td>
                          <td style={tdStyle}>{f.constraints ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {m.relationships.length > 0 && (
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      Relationships: {m.relationships.join('; ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'apis' && (
            <div>
              {doc.apiContracts.length === 0 && <p style={{ opacity: 0.6 }}>No API contracts defined.</p>}
              {doc.apiContracts.map((api, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 12, border: '1px solid var(--vscode-panel-border)', borderRadius: 4 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span className="badge badge-in-progress" style={{ fontFamily: 'monospace' }}>{api.method}</span>
                    <code style={{ fontSize: 13 }}>{api.endpoint}</code>
                    <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 'auto' }}>{api.auth}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>Request</div>
                      <pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(api.request, null, 2)}</pre>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>Response</div>
                      <pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(api.response, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'sequences' && (
            <div>
              {doc.sequenceFlows.length === 0 && <p style={{ opacity: 0.6 }}>No sequence diagrams defined.</p>}
              {doc.sequenceFlows.map((flow, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px' }}>{flow.title}</h4>
                  <pre className="mermaid-block">{flow.diagram}</pre>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '6px 10px',
  textAlign: 'left',
  background: 'var(--vscode-sideBar-background)',
  border: '1px solid var(--vscode-panel-border)',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '5px 10px',
  border: '1px solid var(--vscode-panel-border)',
  fontSize: 12,
};
