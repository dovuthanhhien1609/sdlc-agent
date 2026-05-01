import React, { useState } from 'react';
import { SDLCSession, TaskList, ImplementationState, TaskLog, Task } from '../../shared/types';
import { postCommand } from '../store/sessionStore';
import { StreamingText } from '../components/StreamingText';

interface Props {
  session: SDLCSession;
  streamBuffer: string;
  isGenerating: boolean;
}

export function ImplementationPhase({ session, streamBuffer, isGenerating }: Props) {
  const taskDoc = session.phases['task-breakdown'].document as TaskList | undefined;
  const implDoc = session.phases.implementation.document as ImplementationState | undefined;
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(
    session.activeTaskId ?? taskDoc?.tasks[0]?.id,
  );

  const tasks = taskDoc?.tasks ?? [];
  const logs = implDoc?.taskLogs ?? [];
  const done = logs.filter(l => l.status === 'done').length;

  const activeTask = tasks.find(t => t.id === activeTaskId);
  const activeLog = logs.find(l => l.taskId === activeTaskId);

  function selectTask(taskId: string) {
    setActiveTaskId(taskId);
    postCommand({ type: 'SET_ACTIVE_TASK', taskId });
  }

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <h3>No tasks found</h3>
        <p>Go back to Task Breakdown and approve the task list first.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="phase-header">
        <h2>Implementation</h2>
        <p>Work through each task with AI guidance.</p>
      </div>

      <div className="progress-bar-outer">
        <div className="progress-bar-inner" style={{ width: `${(done / tasks.length) * 100}%` }} />
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>{done} / {tasks.length} tasks complete</div>

      <div className="impl-layout">
        <div className="task-list-panel">
          {tasks.map(task => {
            const log = logs.find(l => l.taskId === task.id);
            const status = log?.status ?? 'todo';
            const isActive = task.id === activeTaskId;
            return (
              <div
                key={task.id}
                onClick={() => selectTask(task.id)}
                style={{
                  padding: '8px 10px',
                  marginBottom: 4,
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                  color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
                  border: '1px solid transparent',
                  borderColor: isActive ? 'var(--vscode-focusBorder)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`badge badge-${status}`} style={{ fontSize: 10 }}>{status}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{task.title}</span>
                  <span className={`badge badge-${task.complexity.toLowerCase()}`} style={{ fontSize: 10 }}>{task.complexity}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="task-detail-panel">
          {activeTask ? (
            <TaskDetail
              task={activeTask}
              log={activeLog}
              streamBuffer={streamBuffer}
              isGenerating={isGenerating}
            />
          ) : (
            <div className="empty-state"><h3>Select a task</h3></div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskDetail({
  task,
  log,
  streamBuffer,
  isGenerating,
}: {
  task: Task;
  log?: TaskLog;
  streamBuffer: string;
  isGenerating: boolean;
}) {
  const [notes, setNotes] = useState(log?.notes ?? '');
  const [fileInput, setFileInput] = useState('');

  const status = log?.status ?? 'todo';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{task.title}</h3>
        <span className={`badge badge-${task.complexity.toLowerCase()}`}>{task.complexity}</span>
        <span className="badge" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
          {task.category}
        </span>
      </div>

      <p style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>{task.description}</p>

      {task.acceptanceCriteria.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', marginBottom: 4 }}>
            Acceptance Criteria
          </div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {task.acceptanceCriteria.map((c, i) => <li key={i} style={{ fontSize: 12 }}>{c}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['todo', 'in-progress', 'done', 'blocked'] as Task['status'][]).map(s => (
          <button
            key={s}
            className={status === s ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => postCommand({ type: 'UPDATE_TASK', taskId: task.id, patch: { status: s } })}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', marginBottom: 4 }}>
          AI Guidance
        </div>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, marginBottom: 8 }}
          disabled={isGenerating}
          onClick={() => postCommand({ type: 'GENERATE_PHASE', phase: 'implementation', taskId: task.id })}
        >
          {isGenerating ? 'Generating...' : 'Get Implementation Guidance'}
        </button>
        {isGenerating && <StreamingText content={streamBuffer} />}
        {!isGenerating && log?.notes && (
          <div className="streaming-output">{log.notes}</div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', marginBottom: 4 }}>
          Notes
        </div>
        <textarea
          rows={4}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => postCommand({ type: 'UPDATE_TASK', taskId: task.id, patch: { status } })}
          placeholder="Your implementation notes..."
        />
      </div>

      <div>
        <div style={{ fontWeight: 600, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', marginBottom: 4 }}>
          Files Changed
        </div>
        {(log?.filesChanged ?? []).map((f, i) => (
          <div key={i} style={{ fontSize: 12, fontFamily: 'var(--vscode-editor-font-family)', marginBottom: 2 }}>
            {f}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            type="text"
            value={fileInput}
            onChange={e => setFileInput(e.target.value)}
            placeholder="src/path/to/file.ts"
            style={{ flex: 1 }}
            onKeyDown={e => {
              if (e.key === 'Enter' && fileInput.trim()) {
                const files = [...(log?.filesChanged ?? []), fileInput.trim()];
                postCommand({ type: 'UPDATE_TASK', taskId: task.id, patch: { status, filesChanged: files } as Partial<Task> });
                setFileInput('');
              }
            }}
          />
          <button
            className="btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => {
              if (!fileInput.trim()) { return; }
              const files = [...(log?.filesChanged ?? []), fileInput.trim()];
              postCommand({ type: 'UPDATE_TASK', taskId: task.id, patch: { status, filesChanged: files } as Partial<Task> });
              setFileInput('');
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
