import * as vscode from 'vscode';
import { SDLCSession, PHASE_LABELS } from '../shared/types';
import { StateStore } from '../session/StateStore';

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private cleanup: (() => void)[] = [];

  constructor(store: StateStore) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'sdlc.session.open';
    this.item.tooltip = 'Click to open SDLC session';

    const offChange = store.onChange(session => this.update(session));
    const offDelete = store.onDelete(() => this.item.hide());
    this.cleanup.push(offChange, offDelete);
  }

  private update(session: SDLCSession): void {
    const phase = session.currentPhase;
    const status = session.phases[phase].status;
    const phaseLabel = PHASE_LABELS[phase];
    this.item.text = `$(workflow) ${session.name} — ${phaseLabel} (${status})`;
    this.item.show();
  }

  dispose(): void {
    this.cleanup.forEach(fn => fn());
    this.item.dispose();
  }
}
