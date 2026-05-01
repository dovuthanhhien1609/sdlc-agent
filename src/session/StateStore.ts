import { EventEmitter } from 'events';
import { SDLCSession } from '../shared/types';

type ChangeListener = (session: SDLCSession) => void;
type DeleteListener = (id: string) => void;

export class StateStore extends EventEmitter {
  private sessions = new Map<string, SDLCSession>();

  get(id: string): SDLCSession | undefined {
    return this.sessions.get(id);
  }

  set(session: SDLCSession): void {
    this.sessions.set(session.id, session);
    this.emit('change', session);
  }

  delete(id: string): void {
    this.sessions.delete(id);
    this.emit('delete', id);
  }

  list(): SDLCSession[] {
    return Array.from(this.sessions.values());
  }

  loadAll(sessions: SDLCSession[]): void {
    for (const s of sessions) {
      this.sessions.set(s.id, s);
    }
  }

  onChange(listener: ChangeListener): () => void {
    this.on('change', listener);
    return () => this.off('change', listener);
  }

  onDelete(listener: DeleteListener): () => void {
    this.on('delete', listener);
    return () => this.off('delete', listener);
  }
}
