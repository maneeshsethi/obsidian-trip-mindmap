// What to do when the .mindmap file changes on disk while it's open.
export type ExternalDecision = 'ignore' | 'reload' | 'prompt';
export function decideExternal(s: { pendingSave: boolean; busy: boolean; diskText: string; lastWritten: string }): ExternalDecision {
  if (s.diskText === s.lastWritten) return 'ignore';
  return s.pendingSave || s.busy ? 'prompt' : 'reload';
}
