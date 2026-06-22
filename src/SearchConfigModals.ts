import { App, Modal, Notice, Setting } from 'obsidian';
import type ModelRunnerPlugin from './main';
import type { SearchConfig } from './SearchConfigManager';

export class AddSearchConfigModal extends Modal {
  plugin: ModelRunnerPlugin;
  formData: Partial<SearchConfig>;
  onSubmit: (config: SearchConfig) => void;

  constructor(app: App, plugin: ModelRunnerPlugin, onSubmit: (config: SearchConfig) => void) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.formData = {
      id: '',
      name: '',
      provider: 'tavily',
      baseUrl: 'https://api.tavily.com',
      apiKey: '',
      params: {},
    };
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: '➕ 添加搜索配置' });

    // 配置名称
    new Setting(contentEl)
      .setName('配置名称')
      .setDesc('为这个配置起一个名称（如：Tavily生产、Google测试）')
      .addText((text) =>
        text
          .setPlaceholder('例如: Tavily 生产')
          .setValue(this.formData.name || '')
          .onChange((value) => {
            this.formData.name = value;
            // 自动生成 ID
            if (!this.formData.id) {
              this.formData.id = value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            }
          })
      );

    // 配置 ID（可选，自动生成）
    new Setting(contentEl)
      .setName('配置 ID（可选）')
      .setDesc('自动生成，也可手动指定')
      .addText((text) =>
        text
          .setPlaceholder('例如: tavily-prod')
          .setValue(this.formData.id || '')
          .onChange((value) => {
            this.formData.id = value;
          })
      );

    // 提供商类型
    new Setting(contentEl)
      .setName('搜索提供商')
      .setDesc('选择搜索 API 提供商')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('tavily', 'Tavily AI Search')
          .addOption('google', 'Google Custom Search')
          .addOption('bing', 'Bing Search API')
          .addOption('serper', 'Serper.dev')
          .setValue(this.formData.provider || 'tavily')
          .onChange((value) => {
            this.formData.provider = value;
            this.updateDefaultUrl(value);
          });
      });

    // Base URL
    new Setting(contentEl)
      .setName('Base URL')
      .setDesc('API 端点地址')
      .addText((text) =>
        text
          .setPlaceholder('https://api.tavily.com')
          .setValue(this.formData.baseUrl || '')
          .onChange((value) => {
            this.formData.baseUrl = value;
          })
      );

    // API Key
    new Setting(contentEl)
      .setName('API Key')
      .setDesc('您的 API 密钥')
      .addText((text) => {
        text
          .setPlaceholder('输入 API Key')
          .setValue(this.formData.apiKey || '')
          .onChange((value) => {
            this.formData.apiKey = value;
          });
        text.inputEl.type = 'password';
      });

    // Google 特有参数
    if (this.formData.provider === 'google') {
      new Setting(contentEl)
        .setName('Search Engine ID (cx)')
        .setDesc('Google Custom Search Engine ID')
        .addText((text) =>
          text
            .setPlaceholder('例如: 017576662512468239146:omuauf_lfve')
            .setValue(this.formData.params?.cx || '')
            .onChange((value) => {
              if (!this.formData.params) {
                this.formData.params = {};
              }
              this.formData.params.cx = value;
            })
        );
    }

    // 按钮区域
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    // 取消
    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => this.close();

    // 添加
    const submitBtn = buttonContainer.createEl('button', {
      text: '添加',
      cls: 'mod-cta',
    });
    submitBtn.onclick = () => this.handleSubmit();
  }

  private updateDefaultUrl(provider: string): void {
    const defaultUrls: Record<string, string> = {
      tavily: 'https://api.tavily.com',
      google: 'https://www.googleapis.com/customsearch/v1',
      bing: 'https://api.bing.microsoft.com/v7.0/search',
      serper: 'https://google.serper.dev/search',
    };

    this.formData.baseUrl = defaultUrls[provider] || '';
    this.onOpen(); // 刷新显示
  }

  private handleSubmit(): void {
    const { id, name, provider, baseUrl, apiKey, params } = this.formData;

    // 验证必填字段
    if (!name || !provider || !baseUrl || !apiKey) {
      new Notice('❌ 请填写所有必填字段');
      return;
    }

    // 生成 ID
    const finalId = id || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const config: SearchConfig = {
      id: finalId,
      name,
      provider,
      baseUrl,
      apiKey,
      params,
    };

    this.onSubmit(config);
    this.close();
  }
}

export class EditSearchConfigModal extends Modal {
  plugin: ModelRunnerPlugin;
  config: SearchConfig;
  onSubmit: (config: SearchConfig) => void;

  constructor(
    app: App,
    plugin: ModelRunnerPlugin,
    config: SearchConfig,
    onSubmit: (config: SearchConfig) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.config = { ...config };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: '✏️ 编辑搜索配置' });

    // 配置名称
    new Setting(contentEl)
      .setName('配置名称')
      .addText((text) =>
        text.setValue(this.config.name).onChange((value) => {
          this.config.name = value;
        })
      );

    // 配置 ID（只读）
    new Setting(contentEl)
      .setName('配置 ID')
      .setDesc('不可修改')
      .addText((text) => {
        text.setValue(this.config.id);
        text.inputEl.disabled = true;
      });

    // 提供商（只读）
    new Setting(contentEl)
      .setName('搜索提供商')
      .setDesc('不可修改')
      .addText((text) => {
        text.setValue(this.config.provider);
        text.inputEl.disabled = true;
      });

    // Base URL
    new Setting(contentEl)
      .setName('Base URL')
      .addText((text) =>
        text.setValue(this.config.baseUrl).onChange((value) => {
          this.config.baseUrl = value;
        })
      );

    // API Key
    new Setting(contentEl)
      .setName('API Key')
      .addText((text) => {
        text.setValue(this.config.apiKey).onChange((value) => {
          this.config.apiKey = value;
        });
        text.inputEl.type = 'password';
      });

    // Google cx
    if (this.config.provider === 'google') {
      new Setting(contentEl)
        .setName('Search Engine ID (cx)')
        .addText((text) =>
          text.setValue(this.config.params?.cx || '').onChange((value) => {
            if (!this.config.params) {
              this.config.params = {};
            }
            this.config.params.cx = value;
          })
        );
    }

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
    submitBtn.onclick = () => {
      this.onSubmit(this.config);
      this.close();
    };
  }
}
