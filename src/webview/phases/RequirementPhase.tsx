import React, { useState } from 'react';
import { SDLCSession, RequirementDocument, Requirement } from '../../shared/types';
import { postCommand } from '../store/sessionStore';
import { StreamingText } from '../components/StreamingText';

interface Props {
  session: SDLCSession;
  streamBuffer: string;
  isGenerating: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onGenerate: () => void;
}

export function RequirementPhase({ session, streamBuffer, isGenerating, input, onInputChange, onGenerate }: Props) {
  const phase = session.phases.requirement;
  const doc = phase.document as RequirementDocument | undefined;
  const isReadOnly = phase.status === 'approved';
  // Show loading state as soon as the extension marks the phase in-progress,
  // even before the first LLM_CHUNK arrives (isGenerating lags by one chunk).
  const isLoading = isGenerating || phase.status === 'in-progress';

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && e.ctrlKey) { onGenerate(); }
  }

  return (
    <div>
      <div className="phase-header">
        <h2>Requirement {isReadOnly && <span className="read-only-badge">Approved</span>}</h2>
        <p>Transform a feature description into a structured requirements contract.</p>
      </div>

      {!doc && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
              Describe the feature you want to build
            </label>
            <textarea
              rows={8}
              value={input}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the feature in plain language. Include goals, user scenarios, and any constraints you already know..."
              disabled={isLoading}
            />
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Ctrl+Enter to generate</div>
          </div>
          {isLoading && <StreamingText content={streamBuffer} />}
        </>
      )}

      {doc && (
        <>
          <CollapsibleSection title="Summary">
            <EditableText
              value={doc.summary}
              readOnly={isReadOnly}
              onSave={v => postCommand({ type: 'UPDATE_DOCUMENT', phase: 'requirement', patch: { summary: v } })}
            />
          </CollapsibleSection>

          <CollapsibleSection title={`Functional Requirements (${doc.functional.length})`}>
            {doc.functional.map(req => (
              <ReqItem key={req.id} req={req} readOnly={isReadOnly} />
            ))}
            {!isReadOnly && (
              <button
                className="btn-secondary"
                style={{ marginTop: 6, fontSize: 12 }}
                onClick={() => {
                  const newReq: Requirement = { id: `FR-${doc.functional.length + 1}`, description: 'New requirement', priority: 'should' };
                  postCommand({ type: 'UPDATE_DOCUMENT', phase: 'requirement', patch: { functional: [...doc.functional, newReq] } });
                }}
              >
                + Add Requirement
              </button>
            )}
          </CollapsibleSection>

          <CollapsibleSection title={`Non-Functional Requirements (${doc.nonFunctional.length})`}>
            {doc.nonFunctional.map(req => (
              <div key={req.id} className="req-item">
                <span className="req-id">{req.id}</span>
                <span style={{ flex: 1, fontSize: 12 }}>[{req.category}] {req.description}</span>
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Acceptance Criteria">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {doc.acceptanceCriteria.map((c, i) => <li key={i} style={{ fontSize: 12, marginBottom: 3 }}>{c}</li>)}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Out of Scope">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {doc.outOfScope.map((s, i) => <li key={i} style={{ fontSize: 12, marginBottom: 3 }}>{s}</li>)}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title={`Open Questions (${doc.openQuestions.filter(q => q.status === 'open').length} open)`}>
            {doc.openQuestions.map(q => (
              <div key={q.id} className="req-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  <span className="req-id">{q.id}</span>
                  <span style={{ fontSize: 12, flex: 1 }}>{q.question}</span>
                  <span className={`badge badge-${q.status === 'open' ? 'blocked' : 'done'}`}>{q.status}</span>
                </div>
                {q.answer && <div style={{ fontSize: 11, opacity: 0.7, paddingLeft: 8 }}>A: {q.answer}</div>}
              </div>
            ))}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

function ReqItem({ req, readOnly }: { req: Requirement; readOnly: boolean }) {
  return (
    <div className={`req-item priority-${req.priority}`}>
      <span className="req-id">{req.id}</span>
      <span style={{ flex: 1, fontSize: 12 }}>{req.description}</span>
      <span className="badge" style={{ fontSize: 10, background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
        {req.priority}
      </span>
    </div>
  );
}

function EditableText({ value, readOnly, onSave }: { value: string; readOnly: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (readOnly || !editing) {
    return (
      <div
        style={{ fontSize: 13, cursor: readOnly ? 'default' : 'text', padding: '4px 0' }}
        onClick={() => !readOnly && setEditing(true)}
      >
        {value}
      </div>
    );
  }

  return (
    <textarea
      rows={3}
      value={draft}
      autoFocus
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { onSave(draft); setEditing(false); }}
    />
  );
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="section">
      <div className="section-header" onClick={() => setOpen(x => !x)}>
        <span>{title}</span>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}
