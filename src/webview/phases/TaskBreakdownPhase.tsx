import React, { useState } from 'react';
import { SDLCSession, TaskList, Task, TaskCategory, TaskComplexity } from '../../shared/types';
import { postCommand } from '../store/sessionStore';
import { TaskCard } from '../components/TaskCard';
import { StreamingText } from '../components/StreamingText';

interface Props {
  session: SDLCSession;
  streamBuffer: string;
  isGenerating: boolean;
}

export function TaskBreakdownPhase({ session, streamBuffer, isGenerating }: Props) {
  const phase = session.phases['task-breakdown'];
  const doc = phase.document as TaskList | undefined;
  const isReadOnly = phase.status === 'approved';
  const isLoading = isGenerating || phase.status === 'in-progress';
  const [dragId, setDragId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<TaskCategory | 'all'>('all');
  const [filterComplexity, setFilterComplexity] = useState<TaskComplexity | 'all'>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  const tasks = doc?.tasks ?? [];
  const filtered = tasks.filter(t =>
    (filterCategory === 'all' || t.category === filterCategory) &&
    (filterComplexity === 'all' || t.complexity === filterComplexity),
  );

  function handleDragStart(_: React.DragEvent, taskId: string) {
    setDragId(taskId);
  }

  function handleDrop(_: React.DragEvent, targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = tasks.map(t => t.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, dragId);
    postCommand({ type: 'REORDER_TASKS', orderedIds: reordered });
    setDragId(null);
  }

  return (
    <div>
      <div className="phase-header">
        <h2>Task Breakdown {isReadOnly && <span className="read-only-badge">Approved</span>}</h2>
        <p>Decompose the design into atomic, implementable tasks. Drag to reorder.</p>
      </div>

      {!doc && isLoading && <StreamingText content={streamBuffer} />}
      {!doc && !isLoading && (
        <div className="empty-state">
          <h3>No tasks generated yet</h3>
          <p>Click "Generate" to break down the design into implementation tasks.</p>
        </div>
      )}

      {doc && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{tasks.length} tasks</span>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as TaskCategory | 'all')}>
              <option value="all">All categories</option>
              {(['frontend', 'backend', 'infra', 'test', 'config'] as TaskCategory[]).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={filterComplexity} onChange={e => setFilterComplexity(e.target.value as TaskComplexity | 'all')}>
              <option value="all">All sizes</option>
              <option value="S">S (small)</option>
              <option value="M">M (medium)</option>
              <option value="L">L (large)</option>
            </select>
            {!isReadOnly && (
              <button className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => setShowAddForm(x => !x)}>
                + Add Task
              </button>
            )}
          </div>

          {showAddForm && !isReadOnly && (
            <AddTaskForm onAdd={(task) => { postCommand({ type: 'ADD_TASK', task }); setShowAddForm(false); }} />
          )}

          {filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              readonly={isReadOnly}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          ))}
        </>
      )}
    </div>
  );
}

function AddTaskForm({ onAdd }: { onAdd: (task: Omit<Task, 'id'>) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [complexity, setComplexity] = useState<TaskComplexity>('M');
  const [category, setCategory] = useState<TaskCategory>('backend');

  return (
    <div style={{ padding: 12, border: '1px solid var(--vscode-focusBorder)', borderRadius: 4, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>New Task</div>
      <input
        type="text"
        placeholder="Task title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <textarea
        rows={2}
        placeholder="Description"
        value={description}
        onChange={e => setDescription(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={complexity} onChange={e => setComplexity(e.target.value as TaskComplexity)}>
          <option value="S">S</option><option value="M">M</option><option value="L">L</option>
        </select>
        <select value={category} onChange={e => setCategory(e.target.value as TaskCategory)}>
          {(['frontend', 'backend', 'infra', 'test', 'config'] as TaskCategory[]).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn-primary"
          style={{ fontSize: 12 }}
          disabled={!title.trim()}
          onClick={() => onAdd({ title, description, complexity, category, status: 'todo', acceptanceCriteria: [], dependencies: [], requirementIds: [] })}
        >
          Add
        </button>
      </div>
    </div>
  );
}
