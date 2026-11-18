import type { MapDoc } from '../model/schema';
import type { AiOp } from '../ai/apply';
import type { ChatMessage } from '../ai/prompt';

export interface EditorAi { ask(messages: ChatMessage[], opts: { signal?: AbortSignal }): Promise<{ reply: string; ops: AiOp[] }> }
export interface EditorOpts {
  doc: MapDoc;
  title: string;
  readOnly?: boolean;
  onChange?: (doc: MapDoc) => void;
  onRename?: (title: string) => void;
  onOpen?: () => void;
  ai?: EditorAi | null;
  measureText?: (text: string, font: string) => number;
}
export interface Editor {
  setDoc(doc: MapDoc, title: string): void;
  getDoc(): MapDoc;
  isBusy(): boolean;
  focus(): void;
  setTitle(title: string): void;
  destroy(): void;
  root: HTMLElement;
}
export function createEditor(host: HTMLElement, opts: EditorOpts): Editor;
