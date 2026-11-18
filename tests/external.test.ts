import { expect, test } from 'vitest';
import { decideExternal } from '../src/external';

const base = { pendingSave: false, busy: false, diskText: 'B', lastWritten: 'A' };
test('our own write echoing back is ignored', () => { expect(decideExternal({ ...base, diskText: 'A' })).toBe('ignore'); });
test('idle editor reloads silently', () => { expect(decideExternal(base)).toBe('reload'); });
test('unsaved edits prompt instead of reloading', () => { expect(decideExternal({ ...base, pendingSave: true })).toBe('prompt'); });
test('busy editor (renaming, AI preview, typing) prompts', () => { expect(decideExternal({ ...base, busy: true })).toBe('prompt'); });
test('identical content is ignored even with unsaved edits', () => { expect(decideExternal({ ...base, pendingSave: true, diskText: 'A' })).toBe('ignore'); });
