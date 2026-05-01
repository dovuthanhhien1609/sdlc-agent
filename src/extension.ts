import * as vscode from 'vscode';
import { StateStore } from './session/StateStore';
import { SessionManager } from './session/SessionManager';
import { LLMService } from './llm/LLMService';
import { PromptBuilder } from './llm/PromptBuilder';
import { ResponseParser } from './llm/ResponseParser';
import { WorkspaceStateAdapter } from './persistence/WorkspaceStateAdapter';
import { FileAdapter } from './persistence/FileAdapter';
import { TechStackDetector } from './workspace/TechStackDetector';
import { WebViewPanelManager } from './panel/WebViewPanelManager';
import { SessionTreeProvider } from './sidebar/SessionTreeProvider';
import { StatusBarManager } from './statusBar/StatusBarManager';
import { registerCommands } from './commands/CommandRegistry';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new StateStore();
  const workspaceState = new WorkspaceStateAdapter(context);
  const fileAdapter = new FileAdapter();
  const llm = new LLMService(context);
  const promptBuilder = new PromptBuilder();
  const parser = new ResponseParser();
  const techStack = new TechStackDetector();
  const panel = new WebViewPanelManager(context, store);

  const manager = new SessionManager(
    store,
    llm,
    promptBuilder,
    parser,
    workspaceState,
    fileAdapter,
    techStack,
    panel,
  );

  // Load persisted sessions
  const persisted = await workspaceState.loadAll();
  if (persisted.length > 0) {
    store.loadAll(persisted);
  } else if (fileAdapter.hasBackupFiles()) {
    const restore = await vscode.window.showInformationMessage(
      'SDLC Agent found session backup files in .sdlc/. Restore them?',
      'Restore',
      'Ignore',
    );
    if (restore === 'Restore') {
      const fromFiles = await fileAdapter.loadAll();
      store.loadAll(fromFiles);
      for (const s of fromFiles) { workspaceState.save(s); }
    }
  }

  // Sidebar
  const treeProvider = new SessionTreeProvider(store);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('sdlc.sessions', treeProvider),
  );

  // Status bar
  const statusBar = new StatusBarManager(store);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  // Commands
  registerCommands(context, manager, panel, store, llm);

  // Cleanup
  context.subscriptions.push({ dispose: () => panel.dispose() });

  console.log('[SDLC Agent] activated');
}

export function deactivate(): void {}
