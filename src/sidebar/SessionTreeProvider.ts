import * as vscode from 'vscode';
import { SDLCSession, PhaseId, PHASE_ORDER, PHASE_LABELS, PhaseStatus } from '../shared/types';
import { StateStore } from '../session/StateStore';

const STATUS_ICON: Record<PhaseStatus, string> = {
  locked: '$(lock)',
  active: '$(circle-outline)',
  'in-progress': '$(sync~spin)',
  'awaiting-approval': '$(clock)',
  approved: '$(check)',
};

export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly sessionId?: string,
    public readonly phase?: PhaseId,
  ) {
    super(label, collapsibleState);
    if (sessionId && !phase) {
      this.contextValue = 'session';
      this.command = {
        command: 'sdlc.session.open',
        title: 'Open Session',
        arguments: [sessionId],
      };
    }
    if (phase) {
      this.contextValue = 'phase';
    }
  }
}

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: StateStore) {
    store.onChange(() => this.refresh());
    store.onDelete(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SessionTreeItem): SessionTreeItem[] {
    if (!element) {
      return this.store.list().map(s => {
        const approved = PHASE_ORDER.filter(p => s.phases[p].status === 'approved').length;
        const item = new SessionTreeItem(
          `${s.name} (${approved}/6)`,
          vscode.TreeItemCollapsibleState.Collapsed,
          s.id,
        );
        item.description = s.phases[s.currentPhase].status;
        return item;
      });
    }

    if (element.sessionId && !element.phase) {
      const session = this.store.get(element.sessionId);
      if (!session) { return []; }
      return PHASE_ORDER.map(phase => {
        const state = session.phases[phase];
        const icon = STATUS_ICON[state.status];
        const item = new SessionTreeItem(
          `${icon}  ${PHASE_LABELS[phase]}`,
          vscode.TreeItemCollapsibleState.None,
          element.sessionId,
          phase,
        );
        item.description = state.status;
        if (state.status !== 'locked') {
          item.command = {
            command: 'sdlc.session.open',
            title: 'Open Phase',
            arguments: [element.sessionId, phase],
          };
        }
        return item;
      });
    }

    return [];
  }
}
