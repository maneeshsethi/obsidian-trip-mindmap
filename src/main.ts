import { Menu, Notice, Plugin, TFolder, requestUrl, type TAbstractFile } from 'obsidian';
import { MindmapView, VIEW_TYPE } from './view';
import { DEFAULT_SETTINGS, MindmapSettingTab, type MindmapSettings } from './settings';
import { newMap, convertKind, serializeMap, type Kind } from './model/schema';
import { toOutline } from './model/outline';
import { askOpenAI, type HttpFn } from './ai/openai';
import { uniquePath } from './paths';
import { registerEmbeds } from './embed';
import type { EditorAi } from './editor/editor';

export default class MindmapPlugin extends Plugin {
  settings: MindmapSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, leaf => new MindmapView(leaf, this));
    this.registerExtensions(['mindmap'], VIEW_TYPE);
    this.addSettingTab(new MindmapSettingTab(this.app, this));
    registerEmbeds(this);

    this.addRibbonIcon('git-fork', 'New mindmap', evt => {
      const menu = new Menu();
      menu.addItem(i => i.setTitle('New mindmap').setIcon('git-fork').onClick(() => this.createMap('general')));
      menu.addItem(i => i.setTitle('New trip mindmap').setIcon('plane').onClick(() => this.createMap('trip')));
      menu.showAtMouseEvent(evt);
    });
    this.addCommand({ id: 'new-mindmap', name: 'New mindmap', callback: () => this.createMap('general') });
    this.addCommand({ id: 'new-trip-mindmap', name: 'New trip mindmap', callback: () => this.createMap('trip') });
    this.addCommand({
      id: 'convert-kind', name: 'Convert between trip map and general map',
      checkCallback: checking => {
        const v = this.activeView(); const doc = v?.currentDoc(); if (!v || !doc) return false;
        if (!checking) { const to: Kind = doc.kind === 'trip' ? 'general' : 'trip'; v.replaceDoc(convertKind(doc, to)); new Notice(`Now a ${to === 'trip' ? 'trip map' : 'general mind map'}`); }
        return true;
      },
    });
    this.addCommand({
      id: 'copy-outline', name: 'Copy as outline',
      checkCallback: checking => {
        const doc = this.activeView()?.currentDoc(); if (!doc) return false;
        if (!checking) navigator.clipboard.writeText(toOutline(doc)).then(() => new Notice('Outline copied'), () => new Notice("Couldn't copy to the clipboard"));
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file: TAbstractFile) => {
      if (!(file instanceof TFolder)) return;
      menu.addItem(i => i.setTitle('New mindmap').setIcon('git-fork').onClick(() => this.createMap('general', file)));
      menu.addItem(i => i.setTitle('New trip mindmap').setIcon('plane').onClick(() => this.createMap('trip', file)));
    }));
  }

  activeView(): MindmapView | null { return this.app.workspace.getActiveViewOfType(MindmapView); }

  async createMap(kind: Kind, folder?: TFolder) {
    const target = folder ?? this.app.workspace.getActiveFile()?.parent ?? this.app.vault.getRoot();
    const base = kind === 'trip' ? 'Untitled trip' : 'Untitled mindmap';
    const path = uniquePath(p => !!this.app.vault.getAbstractFileByPath(p), target.path, base);
    const title = path.split('/').pop()!.replace(/\.mindmap$/, '');
    const file = await this.app.vault.create(path, serializeMap(newMap(kind, title)));
    await this.app.workspace.getLeaf('tab').openFile(file);
  }

  /** Reads the settings at call time, so a key added later works in already-open maps. */
  makeAi(): EditorAi | null {
    const request: HttpFn = async req => { const r = await requestUrl({ ...req, throw: false }); let json: any = null; try { json = r.json; } catch { json = null; } return { status: r.status, json }; };
    return { ask: (messages, o) => askOpenAI(this.settings, messages, { request, signal: o?.signal }) };
  }

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }
}

