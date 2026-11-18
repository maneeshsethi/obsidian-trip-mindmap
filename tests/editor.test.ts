import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { newMap, type MapDoc } from '../src/model/schema';
import { addChild } from '../src/model/ops';
import { createEditor, type Editor, type EditorOpts } from '../src/editor/editor';

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (SVGElement.prototype as any).getBBox ??= () => ({ x: 0, y: 0, width: 50, height: 14 });
  (Element.prototype as any).setPointerCapture ??= () => {};
  (SVGElement.prototype as any).getTotalLength ??= () => 100;
  (SVGElement.prototype as any).getPointAtLength ??= () => ({ x: 0, y: 0 });
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
});

let ed: Editor | null = null;
afterEach(() => { ed?.destroy(); ed = null; document.body.innerHTML = ''; vi.useRealTimers(); });

function mount(doc: MapDoc, extra: Partial<EditorOpts> = {}) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const onChange = vi.fn();
  ed = createEditor(host, { doc, title: 'Test', onChange, measureText: t => t.length * 7, ...extra });
  return { ed, onChange, root: ed.root };
}
function key(target: Element, k: string, o: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  target.dispatchEvent(e); return e;
}
const pane = (root: HTMLElement) => root.querySelector('#mapPane')!;
function selectNode(root: HTMLElement, id: string) {
  const g = root.querySelector(`g.node[data-id="${id}"]`)!;
  g.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
  root.querySelector('#mapSvg')!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5 }));
}
function finishEdit(root: HTMLElement, text: string) {
  const input = root.querySelector('#nodeEdit') as HTMLInputElement; input.value = text; key(input, 'Enter');
}

describe('keyboard', () => {
  test('Tab adds a child to the selected root and saves once', () => {
    const doc = newMap('general', 'Root'); const { ed, onChange, root } = mount(doc);
    selectNode(root, doc.rootId); onChange.mockClear();
    key(pane(root), 'Tab'); finishEdit(root, 'Child');
    const d = ed.getDoc(); expect(d.nodes[d.rootId].children.length).toBe(1);
    expect(d.nodes[d.nodes[d.rootId].children[0]].text).toBe('Child');
    expect(onChange).toHaveBeenCalled();
  });
  test('Ctrl+Z undoes the add', () => {
    const doc = newMap('general', 'Root'); const { ed, root } = mount(doc);
    selectNode(root, doc.rootId); key(pane(root), 'Tab'); finishEdit(root, 'Child');
    key(pane(root), 'z', { ctrlKey: true });
    const d = ed.getDoc(); expect(d.nodes[d.rootId].children.length).toBe(0);
  });
  test('Ctrl+E is claimed so Obsidian does not toggle edit mode', () => {
    const doc = newMap('general', 'Root'); const { root } = mount(doc);
    const e = key(pane(root), 'e', { ctrlKey: true }); expect(e.defaultPrevented).toBe(true);
  });
  test('handled keys do not bubble up to Obsidian; unhandled keys do', () => {
    const doc = newMap('general', 'Root'); const { root } = mount(doc);
    const seen: string[] = []; const spy = (e: KeyboardEvent) => seen.push(e.key);
    document.addEventListener('keydown', spy);
    key(pane(root), 'e', { ctrlKey: true }); key(pane(root), 'p', { ctrlKey: true });
    document.removeEventListener('keydown', spy);
    expect(seen).toEqual(['p']);
  });
  test('typing in the notes box does not trigger map commands', () => {
    const doc = newMap('trip', 'Root'); const a = addChild(doc, doc.rootId, 'A');
    const { ed, root } = mount(doc); selectNode(root, a);
    key(pane(root), 'e', { ctrlKey: true });
    const notes = root.querySelector('#nTxt') as HTMLTextAreaElement; expect(notes).not.toBeNull();
    const before = JSON.stringify(ed.getDoc().nodes);
    key(notes, 'm'); key(notes, '/'); key(notes, 'Delete', { shiftKey: true }); key(notes, 'Tab');
    expect(JSON.stringify(ed.getDoc().nodes)).toBe(before);
    expect((root.querySelector('#agent') as HTMLElement).hidden).toBe(true);
  });
});

describe('kinds', () => {
  test('general map: Ctrl+Enter and N do nothing; no date inputs', () => {
    const doc = newMap('general', 'Root'); const a = addChild(doc, doc.rootId, 'A'); addChild(doc, a, 'k');
    const { ed, root } = mount(doc); selectNode(root, a);
    const before = JSON.stringify(ed.getDoc().nodes);
    key(pane(root), 'Enter', { ctrlKey: true }); key(pane(root), 'n');
    expect(JSON.stringify(ed.getDoc().nodes)).toBe(before);
    expect(root.querySelector('#dS')).toBeNull();
    expect(root.classList.contains('mm-general')).toBe(true);
  });
  test('trip map: Ctrl+Enter adds a next stop', () => {
    const doc = newMap('trip', 'Root'); const a = addChild(doc, doc.rootId, 'A');
    const { ed, root } = mount(doc); selectNode(root, a);
    key(pane(root), 'Enter', { ctrlKey: true }); finishEdit(root, 'Next');
    const d = ed.getDoc(); const nx = d.nodes[a].children.map(c => d.nodes[c]).find(n => n.next);
    expect(nx?.text).toBe('Next'); expect(root.querySelector('#dS')).not.toBeNull();
  });
});

describe('read-only', () => {
  test('keys are ignored and not claimed', () => {
    const doc = newMap('general', 'Root'); const { ed, root } = mount(doc, { readOnly: true });
    const e = key(pane(root), 'Tab');
    expect(e.defaultPrevented).toBe(false); expect(ed.getDoc().nodes[doc.rootId].children.length).toBe(0);
    expect(root.classList.contains('mm-ro')).toBe(true);
  });
});

describe('colours', () => {
  test('C then 5 colours the branch teal; 0 clears; undo restores', () => {
    const doc = newMap('general', 'Root'); const a = addChild(doc, doc.rootId, 'A'); const k = addChild(doc, a, 'k');
    const { ed, root } = mount(doc); selectNode(root, a);
    key(pane(root), 'c'); key(pane(root), '5');
    expect(ed.getDoc().nodes[a].color).toBe('teal');
    expect(root.querySelector(`g.node[data-id="${k}"]`)!.outerHTML).toContain('--c-teal');
    key(pane(root), 'c'); key(pane(root), '0'); expect('color' in ed.getDoc().nodes[a]).toBe(false);
    key(pane(root), 'z', { ctrlKey: true }); expect(ed.getDoc().nodes[a].color).toBe('teal');
  });
});

describe('Ask AI preview', () => {
  async function send(root: HTMLElement) {
    key(pane(root), '/');
    const box = root.querySelector('#agIn') as HTMLTextAreaElement; box.value = 'add X';
    key(box, 'Enter');
    await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  }
  const ai = (doc: MapDoc) => ({ ask: vi.fn(async () => ({ reply: 'ok', ops: [{ op: 'add', parent: doc.rootId, text: 'X' }] as any })) });
  test('changes are held until Keep, then saved once', async () => {
    const doc = newMap('general', 'Root'); const { ed, onChange, root } = mount(doc, { ai: ai(doc) });
    await send(root);
    expect(ed.isBusy()).toBe(true); expect(onChange).not.toHaveBeenCalled();
    (root.querySelector('#agKeep') as HTMLElement).click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(Object.values(ed.getDoc().nodes).some(n => n.text === 'X')).toBe(true);
  });
  test('while a preview is open, getDoc returns the map without the unkept changes', async () => {
    const doc = newMap('general', 'Root'); const { ed, root } = mount(doc, { ai: ai(doc) });
    await send(root);
    expect(Object.values(ed.getDoc().nodes).some(n => n.text === 'X')).toBe(false);
  });
  test('setDoc during a preview discards the preview', async () => {
    const doc = newMap('general', 'Root'); const { ed, root } = mount(doc, { ai: ai(doc) });
    await send(root);
    ed.setDoc(newMap('general', 'Other'), 'Other');
    (document.activeElement as HTMLElement)?.blur();
    expect(ed.isBusy()).toBe(false); expect((root.querySelector('#agProposal') as HTMLElement).hidden).toBe(true);
  });
  test('Revert removes the changes without saving', async () => {
    const doc = newMap('general', 'Root'); const { ed, onChange, root } = mount(doc, { ai: ai(doc) });
    await send(root);
    (root.querySelector('#agRevert') as HTMLElement).click();
    expect(onChange).not.toHaveBeenCalled();
    expect(Object.values(ed.getDoc().nodes).some(n => n.text === 'X')).toBe(false);
  });
  test('without an API key the panel explains how to add one', async () => {
    const doc = newMap('general', 'Root'); const { root } = mount(doc, { ai: null });
    await send(root);
    expect(root.querySelector('#agLog')!.textContent).toContain('OpenAI API key');
  });
});

describe('touch', () => {
  test('long-press on a node opens the context menu', () => {
    vi.useFakeTimers();
    const doc = newMap('general', 'Root'); const a = addChild(doc, doc.rootId, 'A');
    const { root } = mount(doc);
    const g = root.querySelector(`g.node[data-id="${a}"]`)!;
    g.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 20, clientY: 20 }));
    vi.advanceTimersByTime(500);
    expect((root.querySelector('#ctx') as HTMLElement).hidden).toBe(false);
  });
});

test('destroy removes the editor and its listeners', () => {
  const doc = newMap('general', 'Root'); const { ed: e, root } = mount(doc);
  e.destroy(); ed = null; expect(root.isConnected).toBe(false);
});

test('route map draws legs from bundled map data (trip maps only)', async () => {
  const doc = newMap('trip', 'Trip');
  const a = addChild(doc, doc.rootId, 'Bangkok'); doc.nodes[a].start = '2030-11-01'; doc.nodes[a].end = '2030-11-27';
  const b = addChild(doc, doc.rootId, 'Hanoi'); doc.nodes[b].start = '2030-11-27'; doc.nodes[b].end = '2030-12-15';
  const cw = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!, ch = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')!;
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 600 });
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 400 });
  try {
  const { root } = mount(doc);
  key(pane(root), 'r');
  await new Promise(r => setTimeout(r, 400));
  expect((root.querySelector('#route') as HTMLElement).hidden).toBe(false);
  expect(root.querySelector('#routeLegs')!.textContent).toContain('Hanoi');
  expect(root.querySelector('#routeSvg')!.innerHTML).toContain('r-land');
  } finally { Object.defineProperty(Element.prototype, 'clientWidth', cw); Object.defineProperty(Element.prototype, 'clientHeight', ch); }
});
