import { expect, test } from 'vitest';
import { embedHeight } from '../src/embed-size';

test('a single number is the height', () => { expect(embedHeight('600')).toBe(600); });
test('WxH uses the height part', () => { expect(embedHeight('600x300')).toBe(300); });
test('missing or junk falls back to 400', () => { expect(embedHeight(null)).toBe(400); expect(embedHeight('abc')).toBe(400); expect(embedHeight('')).toBe(400); });
test('clamped to 150–1200', () => { expect(embedHeight('50')).toBe(150); expect(embedHeight('5000')).toBe(1200); });
