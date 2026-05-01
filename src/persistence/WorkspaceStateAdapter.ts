import * as vscode from 'vscode';
import { SDLCSession } from '../shared/types';

const KEY_INDEX = 'sdlc.sessions';
const sessionKey = (id: string) => `sdlc.session.${id}`;

export class WorkspaceStateAdapter {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private get state() {
    return this.context.workspaceState;
  }

  async loadAll(): Promise<SDLCSession[]> {
    const ids = this.state.get<string[]>(KEY_INDEX, []);
    const sessions: SDLCSession[] = [];
    for (const id of ids) {
      const s = this.state.get<SDLCSession>(sessionKey(id));
      if (s) { sessions.push(s); }
    }
    return sessions;
  }

  save(session: SDLCSession): void {
    const ids = this.state.get<string[]>(KEY_INDEX, []);
    if (!ids.includes(session.id)) {
      this.state.update(KEY_INDEX, [...ids, session.id]);
    }
    this.state.update(sessionKey(session.id), session);
  }

  delete(id: string): void {
    const ids = this.state.get<string[]>(KEY_INDEX, []).filter(i => i !== id);
    this.state.update(KEY_INDEX, ids);
    this.state.update(sessionKey(id), undefined);
  }

  isEmpty(): boolean {
    return this.state.get<string[]>(KEY_INDEX, []).length === 0;
  }
}
