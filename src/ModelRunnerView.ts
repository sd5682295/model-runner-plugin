import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type ModelRunnerPlugin from './main';
import { LOG_COLORS } from './constants';

export const VIEW_TYPE = 'model-runner-view';

export class ModelRunnerView extends ItemView {
  private logContainer!: HTMLElement;
  private configContainer!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private plugin: ModelRunnerPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Model Runner';
  }

  getIcon(): string {
    return 'cpu';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    if (!container) return;

    container.empty();
    container.addClass('model-runner-container');

    this.renderHeader(container as HTMLElement);
    this.renderControls(container as HTMLElement);
    this.renderConfig(container as HTMLElement);
    this.renderLogs(container as HTMLElement);
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'model-runner-header' });
    header.createEl('h4', { text: '🤖 Model Runner 控制台' });
  }

  private renderControls(container: HTMLElement): void {
    const btnRow = container.createDiv({ cls: 'model-runner-btn-row' });

    const startBtn = btnRow.createEl('button', {
      text: '▶️ 启动',
      cls: 'mod-cta',
    });
    startBtn.onclick = () => this.plugin.startServer();

    const stopBtn = btnRow.createEl('button', { text: '⏹️ 停止' });
    stopBtn.onclick = () => this.plugin.stopServer();

    const openBtn = btnRow.createEl('button', { text: '🌐 打开界面' });
    openBtn.onclick = () => window.open(`http://localhost:${this.plugin.settings.port}`);

    const reloadBtn = btnRow.createEl('button', { text: '🔄 重启' });
    reloadBtn.onclick = async () => {
      await this.plugin.stopServer();
      setTimeout(() => this.plugin.startServer(), 1000);
    };

    const apiBtn = btnRow.createEl('button', { text: '📡 API' });
    apiBtn.onclick = () => this.showApiModal();
  }

  private renderConfig(container: HTMLElement): void {
    this.configContainer = container.createDiv({ cls: 'model-runner-config' });
    this.refreshConfig();
  }

  private renderLogs(container: HTMLElement): void {
    const logSection = container.createDiv({ cls: 'model-runner-log-section' });
    logSection.createEl('h5', { text: '📋 运行日志' });

    const logControls = logSection.createDiv({ cls: 'log-controls' });
    const clearBtn = logControls.createEl('button', {
      text: '🗑️ 清空',
      cls: 'mod-muted',
    });
    clearBtn.onclick = () => this.clearLogs();

    this.logContainer = logSection.createDiv({ cls: 'model-runner-log' });
    this.appendLog('Model Runner 控制台已就绪', 'INFO');
  }

  refreshConfig(): void {
    this.configContainer.empty();
    this.configContainer.createEl('h5', { text: '⚙️ 快速配置' });

    // 自动启动开关
    this.createToggleSetting(
      '自动启动',
      '打开 Obsidian 时自动启动服务器',
      this.plugin.settings.autoStart,
      async (value) => {
        this.plugin.settings.autoStart = value;
        await this.plugin.saveSettings();
      }
    );

    // 端口配置
    this.createNumberSetting(
      '端口号',
      '服务器监听端口（1024-65535）',
      this.plugin.settings.port,
      async (value) => {
        if (value < 1024 || value > 65535) {
          new Notice('❌ 端口必须在 1024-65535 之间');
          return;
        }
        this.plugin.settings.port = value;
        await this.plugin.saveSettings();
        new Notice('✅ 端口已更新，重启服务器后生效');
      }
    );

    // 自动重启开关
    this.createToggleSetting(
      '自动重启',
      '服务器崩溃时自动重启',
      this.plugin.settings.autoRestart,
      async (value) => {
        this.plugin.settings.autoRestart = value;
        await this.plugin.saveSettings();
      }
    );

    // 通知开关
    this.createToggleSetting(
      '显示通知',
      '显示启动/停止/错误通知',
      this.plugin.settings.showNotifications,
      async (value) => {
        this.plugin.settings.showNotifications = value;
        await this.plugin.saveSettings();
      }
    );

    // 分隔线
    this.configContainer.createEl('hr', { cls: 'config-divider' });

    // 当前源信息（只读）
    const config = this.plugin.configManager?.getConfig();
    if (config) {
      const currentSourceName = this.plugin.configManager!.getCurrentSourceName();
      const sourceDiv = this.configContainer.createDiv({ cls: 'config-item' });
      sourceDiv.createEl('span', { text: '当前源: ', cls: 'config-label' });
      sourceDiv.createEl('strong', { text: currentSourceName, cls: 'config-value' });
    } else {
      this.configContainer.createDiv({
        text: '💡 启动服务器后将显示更多信息',
        cls: 'setting-item-description'
      });
    }

    // 跳转到设置页面的按钮
    const settingsBtn = this.configContainer.createEl('button', {
      text: '⚙️ 更多设置',
      cls: 'mod-cta',
    });
    settingsBtn.style.marginTop = '12px';
    settingsBtn.style.width = '100%';
    settingsBtn.onclick = () => {
      // 打开插件设置页面
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById('model-runner');
    };
  }

  private createToggleSetting(
    name: string,
    desc: string,
    value: boolean,
    onChange: (value: boolean) => Promise<void>
  ): void {
    const settingItem = this.configContainer.createDiv({ cls: 'setting-item' });

    const settingInfo = settingItem.createDiv({ cls: 'setting-item-info' });
    settingInfo.createDiv({ text: name, cls: 'setting-item-name' });
    settingInfo.createDiv({ text: desc, cls: 'setting-item-description' });

    const settingControl = settingItem.createDiv({ cls: 'setting-item-control' });

    // 使用正确的 Obsidian Toggle 组件结构
    const toggleEl = settingControl.createDiv({ cls: 'checkbox-container' });
    toggleEl.addEventListener('click', async () => {
      const newValue = !value;
      value = newValue;
      toggleEl.toggleClass('is-enabled', newValue);
      await onChange(newValue);
    });

    if (value) {
      toggleEl.addClass('is-enabled');
    }
  }

  private createNumberSetting(
    name: string,
    desc: string,
    value: number,
    onChange: (value: number) => Promise<void>
  ): void {
    const settingItem = this.configContainer.createDiv({ cls: 'setting-item' });

    const settingInfo = settingItem.createDiv({ cls: 'setting-item-info' });
    settingInfo.createDiv({ text: name, cls: 'setting-item-name' });
    settingInfo.createDiv({ text: desc, cls: 'setting-item-description' });

    const settingControl = settingItem.createDiv({ cls: 'setting-item-control' });

    const input = settingControl.createEl('input', {
      type: 'number',
      cls: 'mod-number',
    });
    input.value = String(value);
    input.style.width = '100px';
    input.onchange = async () => {
      const num = parseInt(input.value);
      if (!isNaN(num)) {
        await onChange(num);
      }
    };
  }

  appendLog(msg: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
    if (!this.logContainer) return;

    const line = this.logContainer.createDiv({ cls: 'log-line' });
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    line.setText(`[${time}] [${level}] ${msg.trim()}`);
    line.style.color = LOG_COLORS[level];

    // 自动滚动
    this.logContainer.scrollTop = this.logContainer.scrollHeight;

    // 限制 200 行
    const lines = this.logContainer.querySelectorAll('.log-line');
    if (lines.length > 200) {
      lines[0]?.remove();
    }
  }

  clearLogs(): void {
    this.logContainer.empty();
    this.appendLog('日志已清空', 'INFO');
  }

  private showApiModal(): void {
    const { ApiDocModal } = require('./ApiDocModal');
    new ApiDocModal(this.app, this.plugin).open();
  }

  async onClose(): Promise<void> {
    // 清理
  }
}
