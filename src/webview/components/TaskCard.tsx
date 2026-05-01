import React, { useState } from 'react';
import { Task } from '../../shared/types';
import { postCommand } from '../store/sessionStore';

interface Props {
  task: Task;
  readonly?: boolean;
  onDragStart?: (e: React.DragEvent, taskId: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, taskId: string) => void;
}

export function TaskCard({ task, readonly, onDragStart, onDragOver, onDrop }: Props) {
  const [expanded, setExpanded] = useState(false);

  function handleStatusChange(status: Task['status']) {
    postCommand({ type: 'UPDATE_TASK', taskId: task.id, patch: { status } });
  }

  return (
    <div
      className="task-card"
      draggable={!readonly}
      onDragStart={e => onDragStart?.(e, task.id)}
      onDragOver={e => { e.preventDefault(); onDragOver?.(e); }}
      onDrop={e => onDrop?.(e, task.id)}
    >
      <div className="task-card-header" onClick={() => setExpanded(x => !x)}>
        {!readonly && <span className="drag-handle">⠿</span>}
        <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{task.title}</span>
        <span className={`badge badge-${task.complexity.toLowerCase()}`}>{task.complexity}</span>
        <span className="badge" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
          {task.category}
        </span>
        <span className={`badge badge-${task.status}`}>{task.status}</span>
        <span style={{ marginLeft: 4, opacity: 0.5 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="task-card-body">
          <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.8 }}>{task.description}</p>

          {task.acceptanceCriteria.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', opacity: 0.7 }}>
                Acceptance Criteria
              </div>
              <ul style={{ margin: '0 0 8px', paddingLeft: 20, fontSize: 12 }}>
                {task.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </>
          )}

          {task.requirementIds.length > 0 && (
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              Requirements: {task.requirementIds.join(', ')}
            </div>
          )}

          {!readonly && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', opacity: 0.7 }}>
                Status
              </div>
              <div className="task-status-toggle">
                {(['todo', 'in-progress', 'done', 'blocked'] as Task['status'][]).map(s => (
                  <button
                    key={s}
                    className={task.status === s ? 'btn-primary' : 'btn-secondary'}
                    onClick={e => { e.stopPropagation(); handleStatusChange(s); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {task.status === 'blocked' && (
                <input
                  type="text"
                  style={{ marginTop: 6 }}
                  placeholder="Blocker reason..."
                  defaultValue={task.blockerReason ?? ''}
                  onBlur={e => postCommand({ type: 'UPDATE_TASK', taskId: task.id, patch: { blockerReason: e.target.value } })}
                />
              )}
              <button
                className="btn-danger"
                style={{ marginTop: 8, fontSize: 11 }}
                onClick={e => { e.stopPropagation(); postCommand({ type: 'DELETE_TASK', taskId: task.id }); }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
