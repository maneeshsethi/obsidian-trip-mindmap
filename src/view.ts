// Obsidian file view for .mindmap files.
import { Notice, TextFileView, TFile, WorkspaceLeaf, type Modifier } from 'obsidian';
import { parseMap, serializeMap, type MapDoc } from './model/schema';
import { createEditor, type Editor, type EditorAi } from './editor/editor';
import { SyncState } from './sync';
import { shouldClaimHotkey } from './keys';

export const VIEW_TYPE = 'mindmap-view';

export interface ViewHost {
  makeAi(): EditorAi | null;
}

// Combos the editor uses that Obsidian also binds globally; claimed while the map (not a text field in it) has focus.
const CLAIMED: [Modifier[], string][] = [
  [['Mod'], 'E'], [['Mod'], 'K'], [['Mod'], 'D'], [['Mod'], 'Enter'],
  [['Mod'], 'Z'], [['Mod', 'Shift'], 'Z'], [['Mod'], 'Y'],
];

export class MindmapView extends TextFileView {
  private editor: Editor | null = null;
  private host: HTMLElement;
  private bar: HTMLElement;
  private broken: string | null = null;   // original text when the file failed to parse
  private sync = new SyncState();

  constructor(leaf: WorkspaceLeaf, private plugin: ViewHost) {
    super(leaf);
    this.bar = this.contentEl.createDiv({ cls: 'mm-conflict' });
    this.bar.hide();
    this.host = this.contentEl.createDiv({ cls: 'mm-host' });
    this.contentEl.style.padding = '0';
    this.contentEl.style.display = 'flex';
    this.contentEl.style.flexDirection = 'column';
    this.host.style.flex = '1';
    this.host.style.minHeight = '0';
    for (const [mods, key] of CLAIMED) {
      this.scope?.register(mods, key, () => (shouldClaimHotkey(document.activeElement, this.editor?.root ?? null) ? false : true));
    }
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? 'Mindmap'; }
  getIcon() { return 'git-fork'; }

  getViewData(): string {
    if (this.broken != null || !this.editor) return this.broken ?? this.data ?? '';
    const editor = this.editor;
    return this.sync.viewData(() => {
      const doc = editor.getDoc();
      if (this.file) doc.title = this.file.basename;
      return serializeMap(doc);
    });
  }

  setViewData(data: string, clear: boolean): void {
    if (!clear && this.editor && this.broken == null) {
      this.external(data);
      return;
    }
    this.loadText(data);
  }

  private loadText(data: string) {
    this.hideBar();
    const title = this.file?.basename ?? 'Mindmap';
    const r = parseMap(data, title);
    if (!r.ok) {
      this.destroyEditor();
      this.broken = data;
      this.host.empty();
      const box = this.host.createDiv({ cls: 'mm-error' });
      box.createEl('h3', { text: "This mind map file can't be read" });
      box.createEl('p', { text: 'It is left exactly as it is on disk. Fix the JSON (for example with a text editor or in git history) and reopen it.' });
      box.createEl('pre', { text: r.error });
      return;
    }
    this.broken = null;
    this.sync.loaded(data);
    if (this.editor) { this.editor.setDoc(r.doc, title); return; }
    this.host.empty();
    this.editor = createEditor(this.host, {
      doc: r.doc,
      title,
      ai: this.plugin.makeAi(),
      onChange: () => { if (this.sync.edited()) this.requestSave(); },
      onRename: t => this.renameTo(t),
    });
  }

  private external(data: string) {
    const d = this.sync.onDisk(data, !!this.editor?.isBusy());
    if (d === 'ignore') return;
    if (d === 'reload') { this.loadText(data); return; }
    this.showBar(data);
  }

  private showBar(data: string) {
    this.bar.empty();
    this.bar.createSpan({ text: 'This file changed on disk while you were editing.' });
    this.bar.createSpan({ cls: 'spacer' });
    const reload = this.bar.createEl('button', { text: 'Reload' });
    const keep = this.bar.createEl('button', { text: 'Keep mine', cls: 'mod-cta' });
    reload.onclick = () => this.loadText(data);
    keep.onclick = () => { this.hideBar(); this.sync.keepMine(); this.requestSave(); };
    this.bar.show();
  }

  private hideBar() { this.bar.hide(); this.bar.empty(); }

  private async renameTo(title: string) {
    const f = this.file; if (!f) return;
    const clean = title.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
    if (!clean || clean === f.basename) { this.editor?.setTitle(f.basename); return; }
    const dir = f.parent && f.parent.path !== '/' ? f.parent.path + '/' : '';
    const path = `${dir}${clean}.${f.extension}`;
    if (this.app.vault.getAbstractFileByPath(path)) { new Notice(`"${clean}" already exists`); this.editor?.setTitle(f.basename); return; }
    await this.app.fileManager.renameFile(f, path);
  }

  async onRename(file: TFile) {
    await super.onRename(file);
    this.editor?.setTitle(file.basename);
  }

  async onOpen() {
    this.registerEvent(this.app.vault.on('modify', async f => {
      if (!this.file || f.path !== this.file.path || this.broken != null || !this.editor) return;
      const text = await this.app.vault.read(this.file);
      this.external(text);
    }));
  }

  currentDoc(): MapDoc | null { return this.editor?.getDoc() ?? null; }

  replaceDoc(doc: MapDoc) {
    if (!this.editor || !this.file) return;
    this.editor.setDoc(doc, this.file.basename);
    if (this.sync.edited()) this.requestSave();
  }

  private destroyEditor() { this.editor?.destroy(); this.editor = null; }

  clear(): void {
    this.destroyEditor();
    this.host.empty();
    this.hideBar();
    this.broken = null;
    this.sync = new SyncState();
  }

  async onClose() { this.destroyEditor(); }
}
