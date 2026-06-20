import { App, Modal, Notice, Setting } from 'obsidian';
import type ModelRunnerPlugin from './main';

interface SourceFormData {
  name: string;
  provider: string;
  baseURL: string;
  apiKey: string;
  models: string;
  enabled: boolean;
}

export class AddSourceModal extends Modal {
  plugin: ModelRunnerPlugin;
  formData: SourceFormData;
  onSubmit: (data: SourceFormData) => void;

  constructor(app: App, plugin: ModelRunnerPlugin, onSubmit: (data: SourceFormData) => void) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.formData = {
      name: '',
      provider: 'OpenAI',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      models: 'gpt-4,gpt-3.5-turbo',
      enabled: true,
    };
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: '➕ 添加新源' });

    // 源名称
    new Setting(contentEl)
      .setName('源名称')
      .setDesc('为这个源起一个唯一的名称')
      .addText((text) =>
        text
          .setPlaceholder('例如: MyOpenAI')
          .setValue(this.formData.name)
          .onChange((value) => {
            this.formData.name = value;
          })
      );

    // 提供商类型
    new Setting(contentEl)
      .setName('提供商类型')
      .setDesc('选择 API 提供商')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('OpenAI', 'OpenAI')
          .addOption('Anthropic', 'Anthropic (Claude)')
          .addOption('Azure', 'Azure OpenAI')
          .addOption('Ollama', 'Ollama (本地)')
          .addOption('Custom', '自定义')
          .setValue(this.formData.provider)
          .onChange((value) => {
            this.formData.provider = value;
            // 根据提供商设置默认 URL
            this.updateDefaultURL(value);
          });
      });

    // Base URL
    new Setting(contentEl)
      .setName('Base URL')
      .setDesc('API 端点地址（例如: https://api.openai.com/v1）')
      .addText((text) =>
        text
          .setPlaceholder('https://api.openai.com/v1')
          .setValue(this.formData.baseURL)
          .onChange((value) => {
            this.formData.baseURL = value;
          })
      );

    // API Key
    new Setting(contentEl)
      .setName('API Key')
      .setDesc('您的 API 密钥')
      .addText((text) => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.formData.apiKey)
          .onChange((value) => {
            this.formData.apiKey = value;
          });
        // 设置为密码输入
        text.inputEl.type = 'password';
      });

    // 模型列表
    new Setting(contentEl)
      .setName('支持的模型')
      .setDesc('逗号分隔的模型列表（例如: gpt-4,gpt-3.5-turbo）')
      .addTextArea((text) => {
        text
          .setPlaceholder('gpt-4,gpt-3.5-turbo,claude-3-opus')
          .setValue(this.formData.models)
          .onChange((value) => {
            this.formData.models = value;
          });
        text.inputEl.rows = 3;
      });

    // 启用状态
    new Setting(contentEl)
      .setName('启用此源')
      .setDesc('添加后立即启用')
      .addToggle((toggle) =>
        toggle.setValue(this.formData.enabled).onChange((value) => {
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

  private updateDefaultURL(provider: string): void {
    const defaultURLs: Record<string, string> = {
      OpenAI: 'https://api.openai.com/v1',
      Anthropic: 'https://api.anthropic.com/v1',
      Azure: 'https://YOUR_RESOURCE.openai.azure.com',
      Ollama: 'http://localhost:11434/v1',
      Custom: '',
    };

    this.formData.baseURL = defaultURLs[provider] || '';
    // 刷新显示
    this.onOpen();
  }

  private async testConnection(): Promise<void> {
    const { baseURL, apiKey } = this.formData;

    if (!baseURL || !apiKey) {
      const errorMsg = '❌ 请填写 Base URL 和 API Key';
      console.error('[AddSourceModal] testConnection failed:', errorMsg);
      new Notice(errorMsg);
      return;
    }

    console.log('[AddSourceModal] 开始测试连接:', { baseURL });
    new Notice('🔍 正在获取模型列表...');

    try {
      // 步骤 1: 获取模型列表
      console.log('[AddSourceModal] 步骤 1: 获取模型列表...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[AddSourceModal] 模型列表响应:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      if (!response.ok) {
        const errorMsg = `❌ 获取模型列表失败: ${response.status} ${response.statusText}`;
        console.error('[AddSourceModal]', errorMsg);
        new Notice(errorMsg);
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError: any) {
        const errorMsg = `❌ 服务器返回了非 JSON 格式的数据（可能返回了 HTML）。请检查 Base URL 是否正确。`;
        console.error('[AddSourceModal] JSON 解析失败:', parseError);
        console.error('[AddSourceModal] 提示: API 可能返回了 HTML 页面，请检查 URL 是否需要添加 /v1 等路径');
        new Notice(errorMsg);
        return;
      }

      const models = data.data || [];
      console.log('[AddSourceModal] 找到模型数量:', models.length);

      if (models.length === 0) {
        const errorMsg = '❌ 未找到可用模型';
        console.error('[AddSourceModal]', errorMsg);
        new Notice(errorMsg);
        return;
      }

      // 自动填充模型列表
      const modelNames = models.map((m: any) => m.id).join(',');
      this.formData.models = modelNames;
      console.log('[AddSourceModal] 自动填充模型:', modelNames.substring(0, 50) + '...');

      new Notice(`✅ 找到 ${models.length} 个模型！正在测试连接...`);

      // 步骤 2: 使用第一个模型进行实际测试
      console.log('[AddSourceModal] 步骤 2: 测试第一个模型...');
      const testModel = models[0]?.id;
      if (!testModel) {
        const errorMsg = '❌ 模型数据格式错误';
        console.error('[AddSourceModal]', errorMsg, { firstModel: models[0] });
        new Notice(errorMsg);
        return;
      }
      console.log('[AddSourceModal] 使用模型进行测试:', testModel);
      // TypeScript 类型保护后，testModel 确定是 string
      await this.testModelConnection(baseURL, apiKey, testModel as string);

    } catch (error: any) {
      console.error('[AddSourceModal] 测试连接异常:', error);
      if (error.name === 'AbortError') {
        new Notice('❌ 连接超时（10秒）');
      } else {
        new Notice(`❌ 连接失败: ${error.message}`);
      }
    }
  }

  private async testModelConnection(baseURL: string, apiKey: string, model: string): Promise<void> {
    try {
      console.log('[AddSourceModal] 发送测试请求:', { baseURL, model });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      // 发送真实的测试请求
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[AddSourceModal] 测试请求响应:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      if (response.ok) {
        const result = await response.json();
        const reply = result.choices?.[0]?.message?.content || '';
        console.log('[AddSourceModal] 测试成功，模型响应:', reply);
        new Notice(`✅ 连接测试成功！模型 ${model} 响应: "${reply.substring(0, 20)}..."`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = `❌ 测试请求失败: ${response.status} - ${errorData.error?.message || response.statusText}`;
        console.error('[AddSourceModal]', errorMsg, { errorData });
        new Notice(errorMsg);
      }
    } catch (error: any) {
      console.error('[AddSourceModal] 测试请求异常:', error);
      if (error.name === 'AbortError') {
        new Notice('❌ 测试请求超时（15秒）');
      } else {
        new Notice(`❌ 测试请求失败: ${error.message}`);
      }
    }
  }

  private validateForm(): string | null {
    const { name, provider, baseURL, apiKey, models } = this.formData;

    if (!name.trim()) {
      return '源名称不能为空';
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return '源名称只能包含字母、数字、下划线和连字符';
    }

    if (!provider.trim()) {
      return '请选择提供商类型';
    }

    if (!baseURL.trim()) {
      return 'Base URL 不能为空';
    }

    try {
      new URL(baseURL);
    } catch {
      return 'Base URL 格式无效，必须是完整的 URL';
    }

    if (!apiKey.trim()) {
      return 'API Key 不能为空';
    }

    if (!models.trim()) {
      return '模型列表不能为空';
    }

    return null;
  }

  private async handleSubmit(): Promise<void> {
    // 验证表单
    const error = this.validateForm();
    if (error) {
      new Notice(`❌ ${error}`);
      return;
    }

    // 检查名称是否已存在
    const config = this.plugin.configManager?.getConfig();
    if (config && config.sources.find(s => s.id === this.formData.name.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      new Notice(`❌ 源 "${this.formData.name}" 已存在`);
      return;
    }

    // 调用回调
    this.onSubmit(this.formData);
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class EditSourceModal extends Modal {
  plugin: ModelRunnerPlugin;
  sourceId: string;
  sourceName: string;
  formData: SourceFormData;
  onSubmit: (data: SourceFormData) => void;

  constructor(
    app: App,
    plugin: ModelRunnerPlugin,
    sourceName: string,
    sourceData: any,
    onSubmit: (data: SourceFormData) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.sourceId = sourceData.id || sourceName;
    this.sourceName = sourceName;
    this.onSubmit = onSubmit;
    this.formData = {
      name: sourceName,
      provider: sourceData.provider || 'Custom',
      baseURL: sourceData.baseUrl || '',
      apiKey: '', // 不显示现有 API Key
      models: sourceData.apiKeys?.join(',') || '', // 用于显示 API Key 数量
      enabled: true,
    };
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: `✏️ 编辑源: ${this.sourceName}` });

    // 提示：名称不可修改
    const nameNote = contentEl.createDiv({ cls: 'setting-item-description mod-warning' });
    nameNote.setText('⚠️ 源名称不可修改。如需更改名称，请删除后重新添加。');

    // Base URL
    new Setting(contentEl)
      .setName('Base URL')
      .setDesc('API 端点地址')
      .addText((text) =>
        text
          .setPlaceholder('https://api.openai.com/v1')
          .setValue(this.formData.baseURL)
          .onChange((value) => {
            this.formData.baseURL = value;
          })
      );

    // API Keys 数量（只读，显示信息）
    const keysInfo = contentEl.createDiv({ cls: 'setting-item' });
    const keysInfoDiv = keysInfo.createDiv({ cls: 'setting-item-info' });
    keysInfoDiv.createDiv({ text: 'API Keys', cls: 'setting-item-name' });
    keysInfoDiv.createDiv({
      text: `当前有 ${this.formData.models.split(',').filter(k => k.trim()).length} 个 Key`,
      cls: 'setting-item-description'
    });
    const keysControl = keysInfo.createDiv({ cls: 'setting-item-control' });
    const manageBtn = keysControl.createEl('button', {
      text: '管理 Keys',
      cls: 'mod-cta',
    });
    manageBtn.onclick = () => {
      new Notice('请关闭此窗口，在源列表点击"管理 Keys"按钮');
    };

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

    // 保存按钮
    const submitBtn = buttonContainer.createEl('button', {
      text: '保存',
      cls: 'mod-cta',
    });
    submitBtn.onclick = () => this.handleSubmit();
  }

  private async testConnection(): Promise<void> {
    const { baseURL } = this.formData;

    if (!baseURL) {
      const errorMsg = '❌ 请填写 Base URL';
      console.error('[EditSourceModal] testConnection failed:', errorMsg);
      new Notice(errorMsg);
      return;
    }

    // 使用现有的第一个 API Key 进行测试
    const config = this.plugin.configManager?.getConfig();
    const source = config?.sources.find(s => s.id === this.sourceId);

    if (!source || !source.apiKeys || source.apiKeys.length === 0) {
      const errorMsg = '❌ 此源没有 API Key，请先添加 Key';
      console.error('[EditSourceModal]', errorMsg, { sourceId: this.sourceId });
      new Notice(errorMsg);
      return;
    }

    const apiKey = source.apiKeys[0];
    console.log('[EditSourceModal] 开始测试连接:', { baseURL, sourceId: this.sourceId });

    new Notice('🔍 正在获取模型列表...');

    try {
      // 步骤 1: 获取模型列表
      console.log('[EditSourceModal] 步骤 1: 获取模型列表...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[EditSourceModal] 模型列表响应:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      if (!response.ok) {
        const errorMsg = `❌ 获取模型列表失败: ${response.status} ${response.statusText}`;
        console.error('[EditSourceModal]', errorMsg);
        new Notice(errorMsg);
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError: any) {
        const errorMsg = `❌ 服务器返回了非 JSON 格式的数据（可能返回了 HTML）。请检查 Base URL 是否正确。`;
        console.error('[EditSourceModal] JSON 解析失败:', parseError);
        console.error('[EditSourceModal] 提示: API 可能返回了 HTML 页面，请检查 URL 是否需要添加 /v1 等路径');
        new Notice(errorMsg);
        return;
      }

      const models = data.data || [];
      console.log('[EditSourceModal] 找到模型数量:', models.length);

      if (models.length === 0) {
        const errorMsg = '❌ 未找到可用模型';
        console.error('[EditSourceModal]', errorMsg);
        new Notice(errorMsg);
        return;
      }

      new Notice(`✅ 找到 ${models.length} 个模型！正在测试连接...`);

      // 步骤 2: 使用第一个模型进行实际测试
      console.log('[EditSourceModal] 步骤 2: 测试第一个模型...');
      const testModel = models[0]?.id;
      if (!testModel) {
        const errorMsg = '❌ 模型数据格式错误';
        console.error('[EditSourceModal]', errorMsg, { firstModel: models[0] });
        new Notice(errorMsg);
        return;
      }
      console.log('[EditSourceModal] 使用模型进行测试:', testModel);
      // TypeScript 类型保护后，testModel 确定是 string
      await this.testModelConnection(baseURL, apiKey, testModel as string);

    } catch (error: any) {
      console.error('[EditSourceModal] 测试连接异常:', error);
      if (error.name === 'AbortError') {
        new Notice('❌ 连接超时（10秒）');
      } else {
        new Notice(`❌ 连接失败: ${error.message}`);
      }
    }
  }

  private async testModelConnection(baseURL: string, apiKey: string, model: string): Promise<void> {
    try {
      console.log('[EditSourceModal] 发送测试请求:', { baseURL, model });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      // 发送真实的测试请求
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[EditSourceModal] 测试请求响应:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      if (response.ok) {
        const result = await response.json();
        const reply = result.choices?.[0]?.message?.content || '';
        console.log('[EditSourceModal] 测试成功，模型响应:', reply);
        new Notice(`✅ 连接测试成功！模型 ${model} 响应: "${reply.substring(0, 20)}..."`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = `❌ 测试请求失败: ${response.status} - ${errorData.error?.message || response.statusText}`;
        console.error('[EditSourceModal]', errorMsg, { errorData });
        new Notice(errorMsg);
      }
    } catch (error: any) {
      console.error('[EditSourceModal] 测试请求异常:', error);
      if (error.name === 'AbortError') {
        new Notice('❌ 测试请求超时（15秒）');
      } else {
        new Notice(`❌ 测试请求失败: ${error.message}`);
      }
    }
  }

  private validateForm(): string | null {
    const { baseURL } = this.formData;

    if (!baseURL.trim()) {
      return 'Base URL 不能为空';
    }

    try {
      new URL(baseURL);
    } catch {
      return 'Base URL 格式无效';
    }

    return null;
  }

  private async handleSubmit(): Promise<void> {
    const error = this.validateForm();
    if (error) {
      new Notice(`❌ ${error}`);
      return;
    }

    this.onSubmit(this.formData);
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
