import * as vscode from 'vscode';
import { SessionManager } from '../session/SessionManager';
import { WebViewPanelManager } from '../panel/WebViewPanelManager';
import { StateStore } from '../session/StateStore';
import { LLMService } from '../llm/LLMService';
import { WebViewCommand } from '../shared/messages';
import { TransitionError } from '../shared/types';

export function registerCommands(
  context: vscode.ExtensionContext,
  manager: SessionManager,
  panel: WebViewPanelManager,
  store: StateStore,
  llm: LLMService,
): void {
  const reg = (id: string, fn: (...args: unknown[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('sdlc.session.new', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'Feature name',
      placeHolder: 'e.g. User Authentication',
      validateInput: v => (v?.trim() ? undefined : 'Name cannot be empty'),
    });
    if (!name) { return; }
    const session = manager.createSession(name.trim());
    panel.show(session.id);
  });

  reg('sdlc.session.open', async (sessionId?: unknown, phase?: unknown) => {
    let id = typeof sessionId === 'string' ? sessionId : undefined;
    if (!id) {
      const sessions = store.list();
      if (!sessions.length) {
        vscode.window.showInformationMessage('No sessions yet. Create one with "SDLC: New Session".');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        sessions.map(s => ({ label: s.name, description: s.id })),
        { placeHolder: 'Select a session to open' },
      );
      if (!picked) { return; }
      id = picked.description;
    }
    if (!id) { return; }
    panel.show(id);
    if (typeof phase === 'string') {
      try { manager.navigatePhase(id, phase as import('../shared/types').PhaseId); }
      catch { /* silently ignore locked phase navigation from sidebar */ }
    }
  });

  reg('sdlc.session.rename', async (item?: unknown) => {
    const id = resolveSessionId(item, store);
    if (!id) { return; }
    const session = store.get(id);
    const name = await vscode.window.showInputBox({
      prompt: 'New session name',
      value: session?.name,
      validateInput: v => (v?.trim() ? undefined : 'Name cannot be empty'),
    });
    if (!name) { return; }
    manager.renameSession(id, name.trim());
  });

  reg('sdlc.session.delete', async (item?: unknown) => {
    let id = resolveSessionId(item, store);
    if (!id) {
      const sessions = store.list();
      if (!sessions.length) {
        vscode.window.showInformationMessage('No sessions to delete.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        sessions.map(s => ({ label: s.name, description: s.id })),
        { placeHolder: 'Select a session to delete' },
      );
      if (!picked) { return; }
      id = picked.description;
    }
    if (!id) { return; }
    const session = store.get(id);
    const confirm = await vscode.window.showWarningMessage(
      `Delete session "${session?.name ?? id}"? This cannot be undone.`,
      { modal: true },
      'Delete',
    );
    if (confirm !== 'Delete') { return; }
    manager.deleteSession(id);
  });

  reg('sdlc.session.export', async (item?: unknown) => {
    const id = resolveSessionId(item, store);
    if (!id) { return; }
    const markdown = manager.exportSession(id);
    const session = store.get(id);
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${session?.name ?? id}.md`),
      filters: { Markdown: ['md'], JSON: ['json'] },
    });
    if (!uri) { return; }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(markdown, 'utf8'));
    vscode.window.showInformationMessage(`Session exported to ${uri.fsPath}`);
  });

  reg('sdlc.config.setApiKey', async () => {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter your Anthropic API key',
      password: true,
      placeHolder: 'sk-ant-...',
      validateInput: v => (v?.trim().startsWith('sk-') ? undefined : 'Key must start with sk-'),
    });
    if (!key) { return; }
    await context.secrets.store('sdlc.apiKey', key.trim());
    llm.invalidateClient();
    vscode.window.showInformationMessage('API key saved successfully.');
  });

  reg('sdlc.config.clearApiKey', async () => {
    await context.secrets.delete('sdlc.apiKey');
    llm.invalidateClient();
    vscode.window.showInformationMessage('API key cleared.');
  });

  // Wire the WebView command dispatcher
  panel.setCommandHandler(async (cmd: WebViewCommand, sessionId: string) => {
    try {
      await dispatchWebViewCommand(cmd, sessionId, manager, panel, store);
    } catch (err: unknown) {
      const te = err as TransitionError;
      if (te.type === 'TransitionError') {
        panel.postMessage({ type: 'TRANSITION_ERROR', message: te.message, requiredPhase: te.requiredPhase });
      } else {
        console.error('[SDLC] Command error:', err);
      }
    }
  });
}

async function dispatchWebViewCommand(
  cmd: WebViewCommand,
  sessionId: string,
  manager: SessionManager,
  panel: WebViewPanelManager,
  store: StateStore,
): Promise<void> {
  switch (cmd.type) {
    case 'WEBVIEW_READY': {
      const session = store.get(sessionId);
      if (session) {
        panel.postMessage({ type: 'SESSION_UPDATE', session });
      }
      break;
    }
    case 'GENERATE_PHASE':
      await manager.generatePhase(sessionId, cmd.phase, cmd.taskId);
      break;
    case 'APPROVE_PHASE':
      manager.approvePhase(sessionId, cmd.phase);
      break;
    case 'REVISE_PHASE':
      manager.requestRevision(sessionId, cmd.phase);
      break;
    case 'UPDATE_DOCUMENT':
      manager.updateDocument(sessionId, cmd.phase, cmd.patch);
      break;
    case 'UPDATE_TASK':
      manager.updateTask(sessionId, cmd.taskId, cmd.patch);
      break;
    case 'REORDER_TASKS':
      manager.reorderTasks(sessionId, cmd.orderedIds);
      break;
    case 'ADD_TASK':
      manager.addTask(sessionId, cmd.task);
      break;
    case 'DELETE_TASK':
      manager.deleteTask(sessionId, cmd.taskId);
      break;
    case 'NAVIGATE_PHASE':
      manager.navigatePhase(sessionId, cmd.phase);
      break;
    case 'SET_ACTIVE_TASK':
      manager.setActiveTask(sessionId, cmd.taskId);
      break;
    case 'COMPLETE_SESSION':
      manager.completeSession(sessionId);
      break;
    case 'RESTART_FROM_PHASE': {
      const confirm = await vscode.window.showWarningMessage(
        `Go back to "${cmd.phase}"? All subsequent phases will be reset.`,
        { modal: true },
        'Go Back',
      );
      if (confirm === 'Go Back') {
        manager.restartFromPhase(sessionId, cmd.phase);
      }
      break;
    }
  }
}

function resolveSessionId(item: unknown, store: StateStore): string | undefined {
  if (item && typeof item === 'object' && 'sessionId' in item) {
    return (item as { sessionId: string }).sessionId;
  }
  const sessions = store.list();
  if (sessions.length === 1) { return sessions[0].id; }
  return undefined;
}
