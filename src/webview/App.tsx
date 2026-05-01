import React, { useState, useEffect, useCallback } from 'react';
import { SDLCSession, PhaseId } from '../shared/types';
import { ExtensionMessage } from '../shared/messages';
import { postCommand, subscribeToSession } from './store/sessionStore';
import { PhaseStepper } from './components/PhaseStepper';
import { ActionBar } from './components/ActionBar';
import { RequirementPhase } from './phases/RequirementPhase';
import { DesignPhase } from './phases/DesignPhase';
import { TaskBreakdownPhase } from './phases/TaskBreakdownPhase';
import { ImplementationPhase } from './phases/ImplementationPhase';
import { TestingPhase } from './phases/TestingPhase';
import { ReviewPhase } from './phases/ReviewPhase';

export function App() {
  const [session, setSession] = useState<SDLCSession | null>(null);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [streamingPhase, setStreamingPhase] = useState<PhaseId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requirementInput, setRequirementInput] = useState('');

  useEffect(() => {
    postCommand({ type: 'WEBVIEW_READY' });
  }, []);

  // Reset per-session UI state when switching sessions
  useEffect(() => {
    setRequirementInput('');
    setStreamBuffer('');
    setError(null);
  }, [session?.id]);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'SESSION_UPDATE':
          setSession(msg.session);
          setError(null);
          break;
        case 'SESSION_DELETED':
          setSession(null);
          setError(null);
          setStreamBuffer('');
          setStreamingPhase(null);
          break;
        case 'LLM_CHUNK':
          setStreamingPhase(msg.phase);
          setStreamBuffer(prev => prev + msg.content);
          break;
        case 'LLM_COMPLETE':
          setStreamingPhase(null);
          setStreamBuffer('');
          break;
        case 'LLM_ERROR':
          setStreamingPhase(null);
          setStreamBuffer('');
          setError(`Generation failed: ${msg.error.message}. Try again.`);
          break;
        case 'TRANSITION_ERROR':
          setError(msg.message);
          break;
        case 'VALIDATION_ERROR':
          setError(`Validation failed for ${msg.phase}: ${msg.fields.join(', ')}`);
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const isGenerating = streamingPhase !== null;

  const handleGenerate = useCallback((phase: PhaseId) => {
    setStreamBuffer('');
    setError(null);
    if (phase === 'requirement') {
      postCommand({ type: 'UPDATE_DOCUMENT', phase: 'requirement', patch: { _input: requirementInput } });
    }
    postCommand({ type: 'GENERATE_PHASE', phase });
  }, [requirementInput]);

  if (!session) {
    return (
      <div className="empty-state" style={{ height: '100vh' }}>
        <h3>SDLC Agent</h3>
        <p>Create or open a session from the sidebar to get started.</p>
      </div>
    );
  }

  const phase = session.currentPhase;
  const phaseStatus = session.phases[phase].status;
  const currentIsGenerating = isGenerating && streamingPhase === phase;

  return (
    <div className="app">
      <PhaseStepper session={session} />

      {error && (
        <div className="error-banner" style={{ margin: '8px 24px 0' }}>
          ⚠ {error}
          <button
            style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px' }}
            className="btn-secondary"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="phase-content">
        {phase === 'requirement' && (
          <RequirementPhase
            session={session}
            streamBuffer={currentIsGenerating ? streamBuffer : ''}
            isGenerating={currentIsGenerating}
            input={requirementInput}
            onInputChange={setRequirementInput}
            onGenerate={() => handleGenerate('requirement')}
          />
        )}
        {phase === 'design' && (
          <DesignPhase
            session={session}
            streamBuffer={currentIsGenerating ? streamBuffer : ''}
            isGenerating={currentIsGenerating}
          />
        )}
        {phase === 'task-breakdown' && (
          <TaskBreakdownPhase
            session={session}
            streamBuffer={currentIsGenerating ? streamBuffer : ''}
            isGenerating={currentIsGenerating}
          />
        )}
        {phase === 'implementation' && (
          <ImplementationPhase
            session={session}
            streamBuffer={currentIsGenerating ? streamBuffer : ''}
            isGenerating={currentIsGenerating}
          />
        )}
        {phase === 'testing' && (
          <TestingPhase
            session={session}
            streamBuffer={currentIsGenerating ? streamBuffer : ''}
            isGenerating={currentIsGenerating}
          />
        )}
        {phase === 'review' && (
          <ReviewPhase
            session={session}
            streamBuffer={currentIsGenerating ? streamBuffer : ''}
            isGenerating={currentIsGenerating}
          />
        )}
      </div>

      <ActionBar
        phase={phase}
        status={phaseStatus}
        isGenerating={currentIsGenerating}
        onGenerate={() => handleGenerate(phase)}
      />
    </div>
  );
}
