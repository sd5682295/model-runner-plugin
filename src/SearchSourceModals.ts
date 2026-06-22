import { App, Modal, Notice, Setting } from 'obsidian';
import type ModelRunnerPlugin from './main';
import type { SearchSource } from './SearchSourceManager';

export class AddSearchSourceModal extends Modal {
  plugin: ModelRunnerPlugin;
  formData: Partial<SearchSource>;
  onSubmit: (data: SearchSource) => void;

  constructor(app: App, plugin: ModelRunnerPlugin, onSubmit: (data: SearchSource) => void) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.formData = {
      id: '',
      name: '',
      provider: 'google',
      baseUrl: '',
      apiKey: '',
      enabled: true,
      params: {},
    };
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: '➕ 添加搜索源' });

    // 源名称
    new Setting(contentEl)
      .setName('源名称')
      .setDesc('为这个搜索源起一个名称')
      .addText((text) =>
        text
          .setPlaceholder('例如: Google 搜索')
          .setValue(this.formData.name || '')
          .onChange((value) => {
            this.formData.name = value;
            // 自动生成 ID
            if (!this.formData.id) {
              this.formData.id = value.toLowerCase().replace(/\s+/g, '-');
            }
          })
      );

    // 源 ID
    new Setting(contentEl)
      .setName('源 ID')
      .setDesc('唯一标识符（小写字母、数字、连字符）')
      .addText((text) =>
        text
          .setPlaceholder('例如: google-search')
          .setValue(this.formData.id || '')
          .onChange((value) => {
            this.formData.id = value;
          })
      );

    // 提供商类型
    new Setting(contentEl)
      .setName('提供商类型')
      .setDesc('选择搜索 API 提供商')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('google', 'Google Custom Search')
          .addOption('bing', 'Bing Search API')
          .addOption('tavily', 'Tavily AI Search')
          .addOption('serper', 'Serper.dev')
          .addOption('custom', '自定义')
          .setValue(this.formData.provider || 'google')
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
          .setPlaceholder('https://www.googleapis.com/customsearch/v1')
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

    // Google 特有参数：cx (Custom Search Engine ID)
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

    // 启用状态
    new Setting(contentEl)
      .setName('启用此源')
      .setDesc('添加后立即启用')
      .addToggle((toggle) =>
        toggle.setValue(this.formData.enabled !== false).onChange((value) => {
          this.formData.enabled = value;
        })
      );

    // 按钮区域
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    // 测试连接按钮
    const testBtn = buttonContainer.createEl('button', {
      text: '🔍 测试连接',
      cls: 'mod-warning',
    });
    testBtn.onclick = () => this.testConnection();

    // 取消按钮
    const cancelBtn = buttonContainer.createEl('button', {
      text: '取消',
    });
    cancelBtn.onclick = () => this.close();

    // 添加按钮
    const submitBtn = buttonContainer.createEl('button', {
      text: '添加',
      cls: 'mod-cta',
    });
    submitBtn.onclick = () => this.handleSubmit();
  }

  private updateDefaultUrl(provider: string): void {
    const defaultUrls: Record<string, string> = {
      google: 'https://www.googleapis.com/customsearch/v1',
      bing: 'https://api.bing.microsoft.com/v7.0/search',
      tavily: 'https://api.tavily.com/search',
      serper: 'https://google.serper.dev/search',
      custom: '',
    };

    this.formData.baseUrl = defaultUrls[provider] || '';
    this.onOpen(); // 刷新显示
  }

  private async testConnection(): Promise<void> {
    const { id, name, provider, baseUrl, apiKey, params } = this.formData;

    if (!baseUrl || !apiKey) {
      new Notice('❌ 请填写 Base URL 和 API Key');
      return;
    }

    new Notice('🔍 正在测试连接...');

    try {
      const testSource: SearchSource = {
        id: id || 'test',
        name: name || 'Test',
        provider: provider || 'custom',
        baseUrl,
        apiKey,
        enabled: true,
        params,
      };

      const result = await this.plugin.searchSourceManager!.testConnection(testSource, 'hello world');

      if (result.success) {
        new Notice('✅ 连接成功！搜索 API 可用');
        console.log('[AddSearchSourceModal] 测试结果:', result.results);
      } else {
        new Notice(`❌ 连接失败: ${result.message}`);
      }
    } catch (error: any) {
      new Notice(`❌ 测试失败: ${error.message}`);
      console.error('[AddSearchSourceModal] 测试失败:', error);
    }
  }

  private handleSubmit(): void {
    const { id, name, provider, baseUrl, apiKey, enabled, params } = this.formData;

    // 验证必填字段
    if (!id || !name || !provider || !baseUrl || !apiKey) {
      new Notice('❌ 请填写所有必填字段');
      return;
    }

    // 验证 ID 格式
    if (!this.plugin.searchSourceManager!.validateId(id)) {
      new Notice('❌ 源 ID 只能包含小写字母、数字和连字符');
      return;
    }

    // 验证 URL
    if (!this.plugin.searchSourceManager!.validateUrl(baseUrl)) {
      new Notice('❌ 请输入有效的 URL');
      return;
    }

    // 构建完整的 SearchSource
    const source: SearchSource = {
      id,
      name,
      provider,
      baseUrl,
      apiKey,
      enabled: enabled !== false,
      params,
    };

    this.onSubmit(source);
  }
}

export class EditSearchSourceModal extends Modal {
  plugin: ModelRunnerPlugin;
  sourceId: string;
  formData: SearchSource;
  onSubmit: (data: SearchSource) => void;

  constructor(
    app: App,
    plugin: ModelRunnerPlugin,
    sourceId: string,
    source: SearchSource,
    onSubmit: (data: SearchSource) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.sourceId = sourceId;
    this.formData = { ...source };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: '✏️ 编辑搜索源' });

    // 源名称（可编辑）
    new Setting(contentEl)
      .setName('源名称')
      .setDesc('修改搜索源名称')
      .addText((text) =>
        text
          .setValue(this.formData.name)
          .onChange((value) => {
            this.formData.name = value;
          })
      );

    // 源 ID（只读）
    new Setting(contentEl)
      .setName('源 ID')
      .setDesc('不可修改')
      .addText((text) => {
        text.setValue(this.formData.id);
        text.inputEl.disabled = true;
      });

    // 提供商类型（只读）
    new Setting(contentEl)
      .setName('提供商类型')
      .setDesc('不可修改')
      .addText((text) => {
        text.setValue(this.formData.provider);
        text.inputEl.disabled = true;
      });

    // Base URL（可编辑）
    new Setting(contentEl)
      .setName('Base URL')
      .setDesc('修改 API 端点地址')
      .addText((text) =>
        text
          .setValue(this.formData.baseUrl)
          .onChange((value) => {
            this.formData.baseUrl = value;
          })
      );

    // API Key（可编辑）
    new Setting(contentEl)
      .setName('API Key')
      .setDesc('修改 API 密钥')
      .addText((text) => {
        text
          .setValue(this.formData.apiKey)
          .onChange((value) => {
            this.formData.apiKey = value;
          });
        text.inputEl.type = 'password';
      });

    // Google cx 参数
    if (this.formData.provider === 'google') {
      new Setting(contentEl)
        .setName('Search Engine ID (cx)')
        .setDesc('Google Custom Search Engine ID')
        .addText((text) =>
          text
            .setValue(this.formData.params?.cx || '')
            .onChange((value) => {
              if (!this.formData.params) {
                this.formData.params = {};
              }
              this.formData.params.cx = value;
            })
        );
    }

    // 启用状态
    new Setting(contentEl)
      .setName('启用此源')
      .addToggle((toggle) =>
        toggle.setValue(this.formData.enabled).onChange((value) => {
          this.formData.enabled = value;
        })
      );

    // 按钮区域
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    // 测试连接
    const testBtn = buttonContainer.createEl('button', {
      text: '🔍 测试连接',
      cls: 'mod-warning',
    });
    testBtn.onclick = () => this.testConnection();

    // 取消
    const cancelBtn = buttonContainer.createEl('button', {
      text: '取消',
    });
    cancelBtn.onclick = () => this.close();

    // 保存
    const submitBtn = buttonContainer.createEl('button', {
      text: '保存',
      cls: 'mod-cta',
    });
    submitBtn.onclick = () => this.handleSubmit();
  }

  private async testConnection(): Promise<void> {
    new Notice('🔍 正在测试连接...');

    try {
      const result = await this.plugin.searchSourceManager!.testConnection(this.formData, 'hello world');

      if (result.success) {
        new Notice('✅ 连接成功！');
      } else {
        new Notice(`❌ 连接失败: ${result.message}`);
      }
    } catch (error: any) {
      new Notice(`❌ 测试失败: ${error.message}`);
    }
  }

  private handleSubmit(): void {
    const { name, baseUrl, apiKey } = this.formData;

    if (!name || !baseUrl || !apiKey) {
      new Notice('❌ 请填写所有必填字段');
      return;
    }

    if (!this.plugin.searchSourceManager!.validateUrl(baseUrl)) {
      new Notice('❌ 请输入有效的 URL');
      return;
    }

    this.onSubmit(this.formData);
  }
}
