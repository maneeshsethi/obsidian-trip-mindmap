// Snapshot undo/redo stack. Snapshots are opaque strings (JSON of {rootId, nodes}).
export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  constructor(private cap = 200) {}
  push(snap: string): void {
    this.undoStack.push(snap);
    if (this.undoStack.length > this.cap) this.undoStack.shift();
    this.redoStack = [];
  }
  undo(current: string): string | null {
    const s = this.undoStack.pop();
    if (s == null) return null;
    this.redoStack.push(current);
    return s;
  }
  redo(current: string): string | null {
    const s = this.redoStack.pop();
    if (s == null) return null;
    this.undoStack.push(current);
    return s;
  }
  clear(): void { this.undoStack = []; this.redoStack = []; }
}
