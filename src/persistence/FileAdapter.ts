import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SDLCSession } from '../shared/types';

export class FileAdapter {
  private get enabled(): boolean {
    return vscode.workspace.getConfiguration('sdlcAgent').get<boolean>('fileBackup.enabled', true);
  }

  private get sessionDir(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { return undefined; }
    return path.join(folders[0].uri.fsPath, '.sdlc', 'sessions');
  }

  async loadAll(): Promise<SDLCSession[]> {
    const dir = this.sessionDir;
    if (!dir || !fs.existsSync(dir)) { return []; }
    const sessions: SDLCSession[] = [];
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        sessions.push(JSON.parse(raw) as SDLCSession);
      } catch { /* skip corrupt files */ }
    }
    return sessions;
  }

  save(session: SDLCSession): void {
    if (!this.enabled) { return; }
    const dir = this.sessionDir;
    if (!dir) { return; }
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${session.id}.json`),
        JSON.stringify(session, null, 2),
        'utf8',
      );
    } catch { /* silently fail — workspaceState is primary */ }
  }

  delete(id: string): void {
    const dir = this.sessionDir;
    if (!dir) { return; }
    const file = path.join(dir, `${id}.json`);
    try {
      if (fs.existsSync(file)) { fs.unlinkSync(file); }
    } catch { /* ignore */ }
  }

  hasBackupFiles(): boolean {
    const dir = this.sessionDir;
    return !!dir && fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('.json'));
  }
}
