import { App, Modal, Notice, Setting } from 'obsidian';
import type ModelRunnerPlugin from './main';

interface SearchRelayConfig {
  SEARCH_PROVIDER: string;
  TAVILY_API_KEY?: string;
  TAVILY_BASE_URL?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_CX?: string;
  BING_API_KEY?: string;
  SERPER_API_KEY?: string;
  RELAY_HOST?: string;
  RELAY_PORT?: string;
  UPSTREAM_TIMEOUT_MS?: string;
}

export class SearchRelayConfigModal extends Modal {
  plugin: ModelRunnerPlugin;
  config: SearchRelayConfig;
  onSubmit: (config: SearchRelayConfig) => void;

  constructor(
    app: App,
    plugin: ModelRunnerPlugin,
    currentConfig: SearchRelayConfig,
    onSubmit: (config: SearchRelayConfig) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.config = { ...currentConfig };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: '🔍 搜索服务配置' });

    const desc = contentEl.createDiv({ cls: 'setting-item-description' });
    desc.setText('配置本地搜索中转服务（search-relay）使用的搜索 API');

    // 搜索提供商选择
    new Setting(contentEl)
      .setName('搜索提供商')
      .setDesc('选择使用的搜索 API 提供商')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('tavily', 'Tavily AI Search')
          .addOption('google', 'Google Custom Search')
          .addOption('bing', 'Bing Search API')
          .addOption('serper', 'Serper.dev')
          .setValue(this.config.SEARCH_PROVIDER || 'tavily')
          .onChange((value) => {
            this.config.SEARCH_PROVIDER = value;
            this.onOpen(); // 刷新显示不同提供商的配置
          });
      });

    // 根据提供商显示不同的配置
    switch (this.config.SEARCH_PROVIDER) {
      case 'tavily':
        this.renderTavilyConfig(contentEl);
        break;
      case 'google':
        this.renderGoogleConfig(contentEl);
        break;
      case 'bing':
        this.renderBingConfig(contentEl);
        break;
      case 'serper':
        this.renderSerperConfig(contentEl);
        break;
    }

    // 服务端口配置
    new Setting(contentEl)
      .setName('服务端口')
      .setDesc('search-relay 监听的端口')
      .addText((text) =>
        text
          .setValue(this.config.RELAY_PORT || '18795')
          .onChange((value) => {
            this.config.RELAY_PORT = value;
          })
      );

    // 超时设置
    new Setting(contentEl)
      .setName('请求超时 (毫秒)')
      .setDesc('搜索请求的超时时间')
      .addText((text) =>
        text
          .setValue(this.config.UPSTREAM_TIMEOUT_MS || '20000')
          .onChange((value) => {
            this.config.UPSTREAM_TIMEOUT_MS = value;
          })
      );

    // 按钮区域
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    // 取消
    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => this.close();

    // 保存
    const submitBtn = buttonContainer.createEl('button', {
      text: '保存',
      cls: 'mod-cta',
    });
    submitBtn.onclick = () => this.handleSubmit();
  }

  private renderTavilyConfig(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Tavily API Key')
      .setDesc('从 tavily.com 获取的 API Key')
      .addText((text) => {
        text
          .setPlaceholder('tvly-...')
          .setValue(this.config.TAVILY_API_KEY || '')
          .onChange((value) => {
            this.config.TAVILY_API_KEY = value;
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Tavily Base URL')
      .setDesc('Tavily API 端点（通常不需要修改）')
      .addText((text) =>
        text
          .setPlaceholder('https://api.tavily.com')
          .setValue(this.config.TAVILY_BASE_URL || 'https://api.tavily.com')
          .onChange((value) => {
            this.config.TAVILY_BASE_URL = value;
          })
      );
  }

  private renderGoogleConfig(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Google API Key')
      .setDesc('从 Google Cloud Console 获取')
      .addText((text) => {
        text
          .setPlaceholder('AIza...')
          .setValue(this.config.GOOGLE_API_KEY || '')
          .onChange((value) => {
            this.config.GOOGLE_API_KEY = value;
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Search Engine ID (cx)')
      .setDesc('从 Programmable Search Engine 获取')
      .addText((text) =>
        text
          .setPlaceholder('017576662512468239146:omuauf_lfve')
          .setValue(this.config.GOOGLE_CX || '')
          .onChange((value) => {
            this.config.GOOGLE_CX = value;
          })
      );
  }

  private renderBingConfig(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Bing API Key')
      .setDesc('从 Azure Portal 获取订阅密钥')
      .addText((text) => {
        text
          .setPlaceholder('订阅密钥')
          .setValue(this.config.BING_API_KEY || '')
          .onChange((value) => {
            this.config.BING_API_KEY = value;
          });
        text.inputEl.type = 'password';
      });
  }

  private renderSerperConfig(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Serper API Key')
      .setDesc('从 serper.dev 获取')
      .addText((text) => {
        text
          .setPlaceholder('API Key')
          .setValue(this.config.SERPER_API_KEY || '')
          .onChange((value) => {
            this.config.SERPER_API_KEY = value;
          });
        text.inputEl.type = 'password';
      });
  }

  private handleSubmit(): void {
    // 验证必填字段
    const provider = this.config.SEARCH_PROVIDER;

    if (provider === 'tavily' && !this.config.TAVILY_API_KEY) {
      new Notice('❌ 请填写 Tavily API Key');
      return;
    }

    if (provider === 'google' && (!this.config.GOOGLE_API_KEY || !this.config.GOOGLE_CX)) {
      new Notice('❌ 请填写 Google API Key 和 Search Engine ID');
      return;
    }

    if (provider === 'bing' && !this.config.BING_API_KEY) {
      new Notice('❌ 请填写 Bing API Key');
      return;
    }

    if (provider === 'serper' && !this.config.SERPER_API_KEY) {
      new Notice('❌ 请填写 Serper API Key');
      return;
    }

    this.onSubmit(this.config);
    this.close();
  }
}
