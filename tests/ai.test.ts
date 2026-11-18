import { describe, expect, test } from 'vitest';
import { newMap, parseMap, serializeMap } from '../src/model/schema';
import { addChild } from '../src/model/ops';
import { applyOps } from '../src/ai/apply';
import { rules, outline, buildMessages } from '../src/ai/prompt';
import { askOpenAI, DEFAULT_AI_SETTINGS } from '../src/ai/openai';

const valid = (d: any) => parseMap(serializeMap(d), 'x').ok;
const S = { ...DEFAULT_AI_SETTINGS, apiKey: 'sk-test' };
const okReq = (content: string, seen: any[] = []) => async (req: any) => { seen.push(req); return { status: 200, json: { choices: [{ message: { content } }] } }; };

describe('applyOps', () => {
  test('delete root is skipped', () => {
    const d = newMap('trip', 'R'); const r = applyOps(d, [{ op: 'delete', id: d.rootId }]);
    expect(r.skipped).toBe(1); expect(d.nodes[d.rootId]).toBeDefined();
  });
  test('move under own descendant is skipped and tree stays valid', () => {
    const d = newMap('trip', 'R'); const a = addChild(d, d.rootId, 'A'); const k = addChild(d, a, 'k');
    const r = applyOps(d, [{ op: 'move', id: a, parent: k }]); expect(r.skipped).toBe(1); expect(valid(d)).toBe(true);
  });
  test('refs chain adds within one batch', () => {
    const d = newMap('trip', 'R');
    const r = applyOps(d, [{ op: 'add', ref: 'x', parent: d.rootId, text: 'Lisbon' }, { op: 'add', parent: 'x', text: 'Alfama' }]);
    const lis = Object.values(d.nodes).find(n => n.text === 'Lisbon')!; const alf = Object.values(d.nodes).find(n => n.text === 'Alfama')!;
    expect(alf.parent).toBe(lis.id); expect(r.touched).toContain(alf.id); expect(r.lines.length).toBe(2);
  });
  test('non-array ops are ignored without throwing', () => {
    const d = newMap('trip', 'R'); const before = serializeMap(d);
    const r = applyOps(d, 'garbage' as any); expect(r.skipped).toBe(0); expect(serializeMap(d)).toBe(before);
  });
  test('unknown ids and unknown ops are skipped', () => {
    const d = newMap('trip', 'R');
    expect(applyOps(d, [{ op: 'update', id: 'nope', text: 'x' }, { op: 'explode' }, null as any]).skipped).toBe(3);
  });
  test('update sets colour and ignores invalid colour', () => {
    const d = newMap('general', 'R'); const a = addChild(d, d.rootId, 'A');
    applyOps(d, [{ op: 'update', id: a, color: 'teal' }]); expect(d.nodes[a].color).toBe('teal');
    applyOps(d, [{ op: 'update', id: a, color: 'mauve' }]); expect(d.nodes[a].color).toBeUndefined();
  });
  test('general maps ignore trip fields from the AI', () => {
    const d = newMap('general', 'R');
    applyOps(d, [{ op: 'add', parent: d.rootId, text: 'Idea', start: '2030-12-01', end: '2030-12-05', maybe: true, fixed: true }]);
    const n = Object.values(d.nodes).find(n => n.text === 'Idea')!;
    expect([n.start, n.end, n.maybe, n.fixed]).toEqual([null, null, false, false]);
  });
  test('trip add with dates and next', () => {
    const d = newMap('trip', 'R'); const a = addChild(d, d.rootId, 'A');
    applyOps(d, [{ op: 'add', parent: a, text: 'Next', next: true, start: '2030-12-10', end: '2030-12-01' }]);
    const n = Object.values(d.nodes).find(n => n.text === 'Next')!;
    expect(n.next).toBe(true); expect([n.start, n.end]).toEqual(['2030-12-01', '2030-12-10']);
  });
});

describe('prompt', () => {
  test('rules are trip-specific only for trip maps', () => {
    expect(rules(newMap('general', 'G'), '2030-11-17')).not.toMatch(/travel/i);
    expect(rules(newMap('trip', 'T'), '2030-11-17')).toMatch(/travel/i);
  });
  test('outline lists ids and colours', () => {
    const d = newMap('general', 'G'); const a = addChild(d, d.rootId, 'A'); d.nodes[a].color = 'pink';
    expect(outline(d)).toContain(`[${a}] A (colour pink)`);
  });
  test('buildMessages keeps only the last 12 turns after the system message', () => {
    const turns = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: 't' + i }));
    const m = buildMessages(newMap('general', 'G'), turns, '2030-11-17');
    expect(m[0].role).toBe('system'); expect(m.length).toBe(13); expect(m[12].content).toBe('t19');
  });
});

describe('askOpenAI', () => {
  test('parses a JSON reply and sends the right request', async () => {
    const seen: any[] = [];
    const r = await askOpenAI(S, [{ role: 'user', content: 'hi' }], { request: okReq('{"reply":"ok","ops":[]}', seen) });
    expect(r).toEqual({ reply: 'ok', ops: [] });
    expect(seen[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(seen[0].headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(seen[0].body); expect(body.response_format.type).toBe('json_object'); expect(body.model).toBe(S.model);
  });
  test('non-JSON content becomes the reply with no ops', async () => {
    expect(await askOpenAI(S, [], { request: okReq('not json') })).toEqual({ reply: 'not json', ops: [] });
  });
  test('API error message is surfaced', async () => {
    await expect(askOpenAI(S, [], { request: async () => ({ status: 401, json: { error: { message: 'bad key' } } }) })).rejects.toThrow(/bad key/);
  });
  test('missing key is refused before any request', async () => {
    let called = false;
    await expect(askOpenAI({ ...S, apiKey: ' ' }, [], { request: async () => { called = true; return { status: 200, json: {} }; } })).rejects.toThrow(/API key/);
    expect(called).toBe(false);
  });
  test('aborted signal rejects with Stopped', async () => {
    const ac = new AbortController(); ac.abort();
    await expect(askOpenAI(S, [], { request: okReq('{}'), signal: ac.signal })).rejects.toThrow('Stopped');
  });
  test('trailing slash on base URL is tolerated', async () => {
    const seen: any[] = [];
    await askOpenAI({ ...S, baseUrl: 'https://x.test/v1/' }, [], { request: okReq('{"reply":"","ops":[]}', seen) });
    expect(seen[0].url).toBe('https://x.test/v1/chat/completions');
  });
});
