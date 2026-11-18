// Keeps the open map and the file on disk from overwriting each other.
// While a conflict is open, nothing of ours is written until the person picks Reload or Keep mine.
import { decideExternal, type ExternalDecision } from './external';

export class SyncState {
  private inSync = '';            // last text read from or written to disk
  private pending = false;        // edits since the last save
  private conflict: string | null = null; // disk text we haven't adopted yet

  loaded(text: string) { this.inSync = text; this.pending = false; this.conflict = null; }

  /** Call on every edit. Returns whether a save may be requested. */
  edited(): boolean { this.pending = true; return this.conflict == null; }

  onDisk(text: string, busy: boolean): ExternalDecision {
    if (this.conflict != null) {
      if (text === this.conflict) return 'ignore';
      this.conflict = text; return 'prompt';
    }
    const d = decideExternal({ pendingSave: this.pending, busy, diskText: text, lastWritten: this.inSync });
    if (d === 'prompt') this.conflict = text;
    return d;
  }

  /** Text to write when Obsidian saves. During a conflict, the disk text is written back unchanged. */
  viewData(serialize: () => string): string {
    if (this.conflict != null) return this.conflict;
    const text = serialize(); this.inSync = text; this.pending = false; return text;
  }

  keepMine() { this.conflict = null; this.pending = true; }
  get inConflict() { return this.conflict != null; }
}
