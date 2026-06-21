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
    description.setText('选择 ClaudeCode 使用的 model-runner 源');

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
      .setDesc('ClaudeCode 将使用这个源发送请求')
      .addDropdown((dropdown) => {
        // 添加"自动选择"选项
        dropdown.addOption('', '自动选择（使用当前源）');

        // 添加所有源
        config.sources.forEach((source) => {
          dropdown.addOption(source.id, source.name);
        });

        dropdown.setValue(this.selectedSourceId).onChange((value) => {
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
        sourceName.createSpan({ text: ' (当前源)', cls: 'source-current-badge' });
      }

      const sourceUrl = sourceItem.createDiv({ cls: 'source-preview-url' });
      sourceUrl.setText(source.baseUrl);
    });

    // 说明文字
    const helpText = contentEl.createDiv({ cls: 'setting-item-description' });
    helpText.style.marginTop = '16px';
    helpText.innerHTML = `
      <strong>💡 提示：</strong><br>
      • 选择"自动选择"时，ClaudeCode 将使用 model-runner 的当前源<br>
      • 选择特定源时，ClaudeCode 将固定使用该源（不受当前源切换影响）<br>
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
