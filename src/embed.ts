// Read-only rendering of ![[x.mindmap]] embeds, in reading view and live preview.
import { Component, MarkdownPostProcessorContext, Plugin, TFile } from 'obsidian';
import { parseMap } from './model/schema';
import { createEditor, type Editor } from './editor/editor';
import { embedHeight } from './embed-size';

class MindmapEmbed extends Component {
  private editor: Editor | null = null;
  private box: HTMLElement | null = null;
  constructor(private plugin: Plugin, private containerEl: HTMLElement, private file: TFile, private sourcePath: string) { super(); }

  // Called by Obsidian's embed registry, and by our post-processor fallback.
  async loadFile() {
    const el = this.containerEl;
    el.empty();
    el.addClass('mm-embed-host');
    const box = (this.box = el.createDiv({ cls: 'mm-embed' }));
    box.style.height = embedHeight(el.getAttribute('alt') ?? el.getAttribute('height')) + 'px';
    const open = box.createEl('button', { cls: 'mm-embed-open', text: 'Open' });
    open.onclick = e => { e.preventDefault(); e.stopPropagation(); this.openFile(); };
    await this.render();
    this.registerEvent(this.plugin.app.vault.on('modify', f => { if (f.path === this.file.path) this.render(); }));
  }

  private openFile() { this.plugin.app.workspace.openLinkText(this.file.path, this.sourcePath, 'tab'); }

  private async render() {
    if (!this.box) return;
    const text = await this.plugin.app.vault.cachedRead(this.file);
    const r = parseMap(text, this.file.basename);
    if (!r.ok) {
      this.editor?.destroy(); this.editor = null;
      this.box.querySelector('.mm-error')?.remove();
      this.box.createDiv({ cls: 'mm-error', text: `Can't read ${this.file.name}: ${r.error}` });
      return;
    }
    this.box.querySelector('.mm-error')?.remove();
    if (this.editor) { this.editor.setDoc(r.doc, this.file.basename); return; }
    this.editor = createEditor(this.box, { doc: r.doc, title: this.file.basename, readOnly: true, onOpen: () => this.openFile() });
  }

  onunload() { this.editor?.destroy(); this.editor = null; }
}

export function registerEmbeds(plugin: Plugin) {
  const reg = (plugin.app as any).embedRegistry;
  if (reg?.registerExtension) {
    reg.registerExtension('mindmap', (ctx: { containerEl: HTMLElement; sourcePath: string }, file: TFile) => new MindmapEmbed(plugin, ctx.containerEl, file, ctx.sourcePath));
    plugin.register(() => reg.unregisterExtension?.('mindmap'));
    return;
  }
  // Fallback (no embed registry): reading view only.
  plugin.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    el.querySelectorAll<HTMLElement>('.internal-embed').forEach(span => {
      const src = span.getAttribute('src'); if (!src) return;
      const file = plugin.app.metadataCache.getFirstLinkpathDest(src.split('#')[0], ctx.sourcePath);
      if (!file || file.extension !== 'mindmap') return;
      const child = new MindmapEmbed(plugin, span, file, ctx.sourcePath);
      ctx.addChild(child as any);
      child.loadFile();
    });
  });
}
