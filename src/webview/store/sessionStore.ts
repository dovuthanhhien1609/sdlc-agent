import { SDLCSession } from '../../shared/types';
import { WebViewCommand } from '../../shared/messages';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
};

// Called once at module load; VS Code injects this global into the webview.
export const vscode = acquireVsCodeApi();

export function postCommand(cmd: WebViewCommand): void {
  vscode.postMessage(cmd);
}

export type SessionListener = (session: SDLCSession) => void;
const listeners = new Set<SessionListener>();

export function subscribeToSession(fn: SessionListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyListeners(session: SDLCSession): void {
  listeners.forEach(fn => fn(session));
}
