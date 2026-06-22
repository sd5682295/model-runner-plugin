import { App, Modal, Notice, Setting } from 'obsidian';
import type ModelRunnerPlugin from './main';

export class ClaudeCodeSourceModal extends Modal {
  plugin: ModelRunnerPlugin;
  selectedSourceId: string;
  onSubmit: (sourceId: string) => void;

  constructor(
    app: App,
    plugin: ModelRunnerPlugin,
    currentSourceId: string | null,
    onSubmit: (sourceId: string) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.selectedSourceId = currentSourceId || '';
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: '🔧 配置 ClaudeCode 源' });

    const description = contentEl.createDiv({ cls: 'setting-item-description' });
    description.setText('选择 ClaudeCode 使用的 API 源（将直接修改 baseUrl 和 apiKey）');

    // 获取源列表
    const config = this.plugin.configManager?.getConfig();
    if (!config || !config.sources || config.sources.length === 0) {
      const notice = contentEl.createDiv({ cls: 'mod-warning' });
      notice.setText('⚠️ 没有可用的源，请先在"源管理"中添加源');
      return;
    }

    // 源选择
    new Setting(contentEl)
      .setName('选择源')
      .setDesc('ClaudeCode 将使用这个源的 baseUrl 和 API Key')
      .addDropdown((dropdown) => {
        // 添加所有源
        config.sources.forEach((source) => {
          dropdown.addOption(source.id, source.name);
        });

        dropdown.setValue(this.selectedSourceId || config.sources[0].id).onChange((value) => {
          this.selectedSourceId = value;
        });
      });

    // 源列表展示
    const sourcesContainer = contentEl.createDiv({ cls: 'sources-preview' });
    sourcesContainer.createEl('h4', { text: '📋 可用的源' });

    config.sources.forEach((source) => {
      const sourceItem = sourcesContainer.createDiv({ cls: 'source-preview-item' });

      const sourceName = sourceItem.createDiv({ cls: 'source-preview-name' });
      sourceName.setText(source.name);

      if (source.id === config.activeSourceId) {
        sourceName.createSpan({ text: ' (当前 model-runner 使用)', cls: 'source-current-badge' });
      }

      const sourceUrl = sourceItem.createDiv({ cls: 'source-preview-url' });
      sourceUrl.setText(source.baseUrl);

      const sourceKeys = sourceItem.createDiv({ cls: 'source-preview-keys' });
      sourceKeys.setText(`API Keys: ${source.apiKeys?.length || 0} 个`);
      sourceKeys.style.fontSize = '0.85em';
      sourceKeys.style.color = 'var(--text-muted)';
    });

    // 说明文字
    const helpText = contentEl.createDiv({ cls: 'setting-item-description' });
    helpText.style.marginTop = '16px';
    helpText.innerHTML = `
      <strong>💡 说明：</strong><br>
      • ClaudeCode 将使用选定源的 <code>baseUrl</code> 和 <code>apiKey</code><br>
      • baseUrl 会去掉 <code>/v1</code> 后缀（ClaudeCode 会自动添加）<br>
      • 使用源的第一个 API Key<br>
      • 配置后需要重启 Claude Code 才能生效
    `;

    // 按钮区域
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    // 取消按钮
    const cancelBtn = buttonContainer.createEl('button', {
      text: '取消',
    });
    cancelBtn.onclick = () => this.close();

    // 确认按钮
    const confirmBtn = buttonContainer.createEl('button', {
      text: '确认配置',
      cls: 'mod-cta',
    });
    confirmBtn.onclick = () => {
      this.onSubmit(this.selectedSourceId);
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
