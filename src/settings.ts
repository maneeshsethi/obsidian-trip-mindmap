import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_AI_SETTINGS, type AiSettings } from './ai/openai';

export type MindmapSettings = AiSettings;
export const DEFAULT_SETTINGS: MindmapSettings = { ...DEFAULT_AI_SETTINGS };

export interface SettingsHost { settings: MindmapSettings; saveSettings(): Promise<void>; }

export class MindmapSettingTab extends PluginSettingTab {
  constructor(app: App, private host: Plugin & SettingsHost) { super(app, host); }
  display(): void {
    const { containerEl } = this; containerEl.empty();
    containerEl.createEl('h3', { text: 'Ask AI (OpenAI)' });
    new Setting(containerEl)
      .setName('OpenAI API key')
      .setDesc("Stored in this vault's .obsidian/plugins/mindmap/data.json — keep it out of git.")
      .addText(t => { t.inputEl.type = 'password'; t.setPlaceholder('sk-…').setValue(this.host.settings.apiKey).onChange(async v => { this.host.settings.apiKey = v.trim(); await this.host.saveSettings(); }); });
    new Setting(containerEl)
      .setName('Model')
      .setDesc('Any chat model your key can use.')
      .addText(t => t.setPlaceholder(DEFAULT_AI_SETTINGS.model).setValue(this.host.settings.model).onChange(async v => { this.host.settings.model = v.trim() || DEFAULT_AI_SETTINGS.model; await this.host.saveSettings(); }));
    new Setting(containerEl)
      .setName('API base URL')
      .setDesc('Leave as is unless you use an OpenAI-compatible proxy.')
      .addText(t => t.setPlaceholder(DEFAULT_AI_SETTINGS.baseUrl).setValue(this.host.settings.baseUrl).onChange(async v => { this.host.settings.baseUrl = v.trim() || DEFAULT_AI_SETTINGS.baseUrl; await this.host.saveSettings(); }));
  }
}
