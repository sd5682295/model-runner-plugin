import { App, Modal, Notice, Setting } from 'obsidian';
import type ModelRunnerPlugin from './main';

interface ServiceConfig {
  port?: number;
  timeout?: number;
  retries?: number;
  logLevel?: 'INFO' | 'WARN' | 'ERROR';
  searchEngine?: string;
  apiKey?: string;
  [key: string]: any;
}

export class ServiceConfigModal extends Modal {
  plugin: ModelRunnerPlugin;
  service: any;
  config: ServiceConfig;
  onSave: (config: ServiceConfig) => void;

  constructor(
    app: App,
    plugin: ModelRunnerPlugin,
    service: any,
    onSave: (config: ServiceConfig) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.service = service;
    this.onSave = onSave;

    // 从插件设置中读取已有配置
    const settings = this.plugin.settings;
    this.config = settings.serviceConfigs?.[service.name] || this.getDefaultConfig(service.name);
  }

  private getDefaultConfig(serviceName: string): ServiceConfig {
    switch (serviceName) {
      case 'model-runner':
        return {
          port: 4000,
          timeout: 30000,
          retries: 3,
          logLevel: 'INFO',
        };
      case 'search-relay':
        return {
          port: 3010,
          searchEngine: 'duckduckgo',
          apiKey: '',
        };
      default:
        return {};
    }
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: `⚙️ ${this.service.displayName} 配置` });

    const description = contentEl.createDiv({ cls: 'setting-item-description' });
    description.setText(this.service.description || '配置服务参数');

    // 根据不同服务渲染不同的配置项
    if (this.service.name === 'model-runner') {
      this.renderModelRunnerConfig(contentEl);
    } else if (this.service.name === 'search-relay') {
      this.renderSearchRelayConfig(contentEl);
    } else {
      this.renderGenericConfig(contentEl);
    }

    // 按钮区域
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    // 取消按钮
    const cancelBtn = buttonContainer.createEl('button', {
      text: '取消',
    });
    cancelBtn.onclick = () => this.close();

    // 保存按钮
    const saveBtn = buttonContainer.createEl('button', {
      text: '保存',
      cls: 'mod-cta',
    });
    saveBtn.onclick = () => this.handleSave();
  }

  private renderModelRunnerConfig(containerEl: HTMLElement): void {
    // 端口配置
    new Setting(containerEl)
      .setName('服务端口')
      .setDesc('Model Runner 服务监听的端口号')
      .addText((text) => {
        text
          .setPlaceholder('4000')
          .setValue(String(this.config.port || 4000))
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0 && num < 65536) {
              this.config.port = num;
            }
          });
        text.inputEl.type = 'number';
      });

    // 超时时间
    new Setting(containerEl)
      .setName('请求超时')
      .setDesc('API 请求超时时间（毫秒）')
      .addText((text) => {
        text
          .setPlaceholder('30000')
          .setValue(String(this.config.timeout || 30000))
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.config.timeout = num;
            }
          });
        text.inputEl.type = 'number';
      });

    // 重试次数
    new Setting(containerEl)
      .setName('重试次数')
      .setDesc('API 请求失败时的重试次数')
      .addText((text) => {
        text
          .setPlaceholder('3')
          .setValue(String(this.config.retries || 3))
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0) {
              this.config.retries = num;
            }
          });
        text.inputEl.type = 'number';
      });

    // 日志级别
    new Setting(containerEl)
      .setName('日志级别')
      .setDesc('控制日志输出的详细程度')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('INFO', 'INFO - 所有信息')
          .addOption('WARN', 'WARN - 警告和错误')
          .addOption('ERROR', 'ERROR - 仅错误')
          .setValue(this.config.logLevel || 'INFO')
          .onChange((value) => {
            this.config.logLevel = value as any;
          });
      });
  }

  private renderSearchRelayConfig(containerEl: HTMLElement): void {
    // 端口配置
    new Setting(containerEl)
      .setName('服务端口')
      .setDesc('Search Relay 服务监听的端口号')
      .addText((text) => {
        text
          .setPlaceholder('3010')
          .setValue(String(this.config.port || 3010))
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0 && num < 65536) {
              this.config.port = num;
            }
          });
        text.inputEl.type = 'number';
      });

    // 搜索引擎选择
    new Setting(containerEl)
      .setName('搜索引擎')
      .setDesc('选择使用的搜索引擎')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('duckduckgo', 'DuckDuckGo')
          .addOption('google', 'Google')
          .addOption('bing', 'Bing')
          .setValue(this.config.searchEngine || 'duckduckgo')
          .onChange((value) => {
            this.config.searchEngine = value;
          });
      });

    // API Key（如果需要）
    if (this.config.searchEngine === 'google' || this.config.searchEngine === 'bing') {
      new Setting(containerEl)
        .setName('API Key')
        .setDesc('搜索引擎的 API 密钥（如果需要）')
        .addText((text) => {
          text
            .setPlaceholder('输入 API Key...')
            .setValue(this.config.apiKey || '')
            .onChange((value) => {
              this.config.apiKey = value;
            });
          text.inputEl.type = 'password';
        });
    }
  }

  private renderGenericConfig(containerEl: HTMLElement): void {
    const notice = containerEl.createDiv({ cls: 'setting-item-description' });
    notice.setText('此服务暂无可配置项');
  }

  private async handleSave(): Promise<void> {
    try {
      // 验证配置
      if (this.config.port && (this.config.port < 1 || this.config.port > 65535)) {
        new Notice('❌ 端口号必须在 1-65535 之间');
        return;
      }

      if (this.config.timeout && this.config.timeout < 1000) {
        new Notice('❌ 超时时间至少为 1000 毫秒');
        return;
      }

      // 保存到插件设置
      await this.saveConfig();

      new Notice(`✅ 已保存 ${this.service.displayName} 配置`);
      this.onSave(this.config);
      this.close();
    } catch (error) {
      new Notice(`❌ 保存失败: ${error.message}`);
      console.error('[ServiceConfigModal] 保存失败:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    const settings = this.plugin.settings;

    // 初始化 serviceConfigs
    if (!settings.serviceConfigs) {
      settings.serviceConfigs = {};
    }

    // 保存配置
    settings.serviceConfigs[this.service.name] = this.config;

    // 保存插件设置
    await this.plugin.saveSettings();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
