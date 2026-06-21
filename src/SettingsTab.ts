import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type ModelRunnerPlugin from './main';
import { AddSourceModal, EditSourceModal } from './SourceModals';
import { ManageKeysModal } from './ManageKeysModal';
import { ModelCostConfigModal } from './ModelCostConfigModal';
import { ServiceConfigModal } from './ServiceConfigModal';

export class ModelRunnerSettingTab extends PluginSettingTab {
  plugin: ModelRunnerPlugin;
  private activeTab: string = 'sources';

  constructor(app: App, plugin: ModelRunnerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'AI 服务配置中心' });

    // Tab 导航
    const tabContainer = containerEl.createDiv({ cls: 'model-runner-tabs' });
    const tabButtons = tabContainer.createDiv({ cls: 'tab-buttons' });

    const tabs = [
      { id: 'sources', name: '🌐 源管理' },
      { id: 'models', name: '🎯 模型管理' },
      { id: 'services', name: '🔧 服务管理' },
      { id: 'monitor', name: '📊 状态监控' },
    ];

    tabs.forEach((tab) => {
      const button = tabButtons.createEl('button', {
        text: tab.name,
        cls: this.activeTab === tab.id ? 'tab-button active' : 'tab-button',
      });
      button.onclick = () => {
        this.activeTab = tab.id;
        this.display();
      };
    });

    // Tab 内容容器
    const tabContent = containerEl.createDiv({ cls: 'tab-content' });

    // 渲染对应的 Tab 内容
    switch (this.activeTab) {
      case 'sources':
        this.renderSourcesTab(tabContent);
        break;
      case 'models':
        this.renderModelsTab(tabContent);
        break;
      case 'services':
        this.renderServicesTab(tabContent);
        break;
      case 'monitor':
        this.renderMonitorTab(tabContent);
        break;
    }
  }

  private renderSourcesTab(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '🌐 源管理' });

    const desc = containerEl.createDiv({ cls: 'setting-item-description' });
    desc.setText('管理所有 API 源的配置，包括 URL、Keys、模型和成本信息。');

    // 当前源选择
    this.renderCurrentSourceSelector(containerEl);

    // 源列表
    this.renderSourcesList(containerEl);

    // 添加新源按钮
    new Setting(containerEl).addButton((button) =>
      button
        .setButtonText('➕ 添加新源')
        .setCta()
        .onClick(() => {
          this.showAddSourceModal();
        })
    );
  }

  private async renderModelsTab(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl('h3', { text: '🎯 模型管理' });

    const desc = containerEl.createDiv({ cls: 'setting-item-description' });
    desc.setText('查看和管理当前源支持的模型，配置模型成本。');

    // 检查配置是否加载
    const config = this.plugin.configManager?.getConfig();
    if (!config) {
      const notice = containerEl.createDiv({ cls: 'mod-warning' });
      notice.setText('⚠️ 配置未加载，请先启动服务器或切换源');
      return;
    }

    // 显示当前源信息
    const currentSource = config.sources.find(s => s.id === config.activeSourceId);
    if (!currentSource) {
      const notice = containerEl.createDiv({ cls: 'mod-warning' });
      notice.setText('⚠️ 当前源不存在');
      return;
    }

    const sourceInfo = containerEl.createDiv({ cls: 'model-source-info' });
    sourceInfo.createEl('strong', { text: '当前源：' });
    sourceInfo.createSpan({ text: currentSource.name });
    sourceInfo.createSpan({ text: ` (${currentSource.baseUrl})` });

    // 刷新按钮
    new Setting(containerEl)
      .setName('模型列表')
      .setDesc('从当前源获取可用的模型列表')
      .addButton((button) =>
        button
          .setButtonText('🔄 刷新模型列表')
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('获取中...');
            await this.loadAndDisplayModels(containerEl, currentSource);
            button.setDisabled(false);
            button.setButtonText('🔄 刷新模型列表');
          })
      );

    // 模型列表容器
    const modelsContainer = containerEl.createDiv({ cls: 'models-container' });

    // 自动加载模型列表
    await this.loadAndDisplayModels(modelsContainer, currentSource);
  }

  private async loadAndDisplayModels(containerEl: HTMLElement, source: any): Promise<void> {
    // 清空容器
    const modelsContainer = containerEl.querySelector('.models-list') as HTMLElement;
    if (modelsContainer) {
      modelsContainer.remove();
    }

    const loadingDiv = containerEl.createDiv({ cls: 'models-loading' });
    loadingDiv.setText('⏳ 正在获取模型列表...');

    try {
      // 获取模型列表
      const models = await this.fetchModels(source);

      // 移除加载提示
      loadingDiv.remove();

      if (!models || models.length === 0) {
        containerEl.createDiv({
          cls: 'mod-warning',
          text: '⚠️ 未找到可用模型'
        });
        return;
      }

      // 显示模型数量
      const statsDiv = containerEl.createDiv({ cls: 'models-stats' });
      statsDiv.setText(`✅ 找到 ${models.length} 个模型`);

      // 搜索和过滤
      this.renderModelFilters(containerEl);

      // 渲染模型列表
      this.renderModelsList(containerEl, models);

    } catch (error) {
      loadingDiv.remove();
      const errorDiv = containerEl.createDiv({ cls: 'mod-error' });
      errorDiv.setText(`❌ 获取模型列表失败: ${error.message}`);
      console.error('[SettingsTab] 获取模型失败:', error);
    }
  }

  private async fetchModels(source: any): Promise<any[]> {
    const apiKey = source.apiKeys?.[0];
    if (!apiKey) {
      throw new Error('当前源没有 API Key');
    }

    const response = await fetch(`${source.baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  private renderModelFilters(containerEl: HTMLElement): void {
    const filtersDiv = containerEl.createDiv({ cls: 'models-filters' });

    // 搜索框
    new Setting(filtersDiv)
      .setName('搜索模型')
      .addSearch((search) => {
        search.setPlaceholder('输入模型名称...');
        search.onChange((value) => {
          this.filterModels(value);
        });
      });
  }

  private filterModels(searchTerm: string): void {
    const modelCards = document.querySelectorAll('.model-card');
    const lowerSearch = searchTerm.toLowerCase();

    modelCards.forEach((card) => {
      const modelName = card.getAttribute('data-model-id')?.toLowerCase() || '';
      const modelDisplay = card.textContent?.toLowerCase() || '';

      if (modelName.includes(lowerSearch) || modelDisplay.includes(lowerSearch)) {
        (card as HTMLElement).style.display = '';
      } else {
        (card as HTMLElement).style.display = 'none';
      }
    });
  }

  private renderModelsList(containerEl: HTMLElement, models: any[]): void {
    const modelsListDiv = containerEl.createDiv({ cls: 'models-list' });

    // 按 provider 分组
    const groupedModels = this.groupModelsByProvider(models);

    Object.keys(groupedModels).sort().forEach((provider) => {
      const groupDiv = modelsListDiv.createDiv({ cls: 'model-group' });

      // 分组标题
      const groupHeader = groupDiv.createDiv({ cls: 'model-group-header' });
      groupHeader.createEl('h4', { text: provider });
      groupHeader.createSpan({
        text: `${groupedModels[provider].length} 个模型`,
        cls: 'model-count'
      });

      // 模型卡片
      const groupModels = groupDiv.createDiv({ cls: 'model-group-models' });
      groupedModels[provider].forEach((model) => {
        this.renderModelCard(groupModels, model);
      });
    });
  }

  private groupModelsByProvider(models: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    models.forEach((model) => {
      // 从模型 ID 提取 provider（如 openai/gpt-4 -> openai）
      const provider = this.extractProvider(model.id);

      if (!grouped[provider]) {
        grouped[provider] = [];
      }
      grouped[provider].push(model);
    });

    return grouped;
  }

  private extractProvider(modelId: string): string {
    // 尝试从 ID 中提取 provider
    if (modelId.includes('/')) {
      return modelId.split('/')[0];
    }

    // 根据常见前缀判断
    if (modelId.startsWith('gpt-')) return 'OpenAI';
    if (modelId.startsWith('claude-')) return 'Anthropic';
    if (modelId.startsWith('gemini-')) return 'Google';
    if (modelId.startsWith('llama-')) return 'Meta';

    return 'Other';
  }

  private renderModelCard(containerEl: HTMLElement, model: any): void {
    const card = containerEl.createDiv({ cls: 'model-card' });
    card.setAttribute('data-model-id', model.id);

    // 模型基本信息
    const infoDiv = card.createDiv({ cls: 'model-info' });

    const nameDiv = infoDiv.createDiv({ cls: 'model-name' });
    nameDiv.setText(model.id);

    // 模型详情（如果有）
    if (model.context_length || model.max_tokens) {
      const detailsDiv = infoDiv.createDiv({ cls: 'model-details' });

      if (model.context_length) {
        const contextSpan = detailsDiv.createSpan({ cls: 'model-detail' });
        contextSpan.setText(`📏 Context: ${this.formatNumber(model.context_length)}`);
      }

      if (model.max_tokens) {
        const maxTokenSpan = detailsDiv.createSpan({ cls: 'model-detail' });
        maxTokenSpan.setText(`🔢 Max: ${this.formatNumber(model.max_tokens)}`);
      }
    }

    // 显示价格（如果已配置）
    const costConfig = this.getModelCost(model.id);
    if (costConfig) {
      const priceDiv = infoDiv.createDiv({ cls: 'model-price' });
      priceDiv.createSpan({
        text: `💰 $${costConfig.input} / $${costConfig.output}`,
        cls: 'model-price-text',
      });
      priceDiv.createSpan({
        text: ' per 1M tokens',
        cls: 'model-price-unit',
      });
    }

    // 操作按钮
    const actionsDiv = card.createDiv({ cls: 'model-actions' });

    const configBtn = actionsDiv.createEl('button', {
      text: costConfig ? '⚙️ 编辑成本' : '⚙️ 配置成本',
      cls: 'mod-cta',
    });
    configBtn.onclick = () => {
      this.openModelCostConfig(model);
    };
  }

  private getModelCost(modelId: string): { input: number; output: number } | null {
    const config = this.plugin.configManager?.getConfig();
    if (!config) return null;

    const currentSource = config.sources.find(s => s.id === config.activeSourceId);
    if (!currentSource || !currentSource.costConfig) return null;

    return currentSource.costConfig[modelId] || null;
  }

  private openModelCostConfig(model: any): void {
    const modal = new ModelCostConfigModal(
      this.app,
      this.plugin,
      model,
      (data) => {
        // 成本保存后刷新显示
        new Notice(`✅ 已保存 ${model.id} 的成本配置`);
        // 重新渲染模型列表以更新价格显示
        this.display();
      }
    );
    modal.open();
  }

  private renderServicesTab(containerEl: HTMLElement): void {
    // 清空容器，避免重复渲染
    containerEl.empty();

    containerEl.createEl('h3', { text: '🔧 服务管理' });

    const desc = containerEl.createDiv({ cls: 'setting-item-description' });
    desc.setText('管理 Model Runner、Search Relay、Claude Code 等服务的启动和配置。');

    // 获取所有服务
    const services = this.plugin.serviceManager.getServices();

    const servicesContainer = containerEl.createDiv({ cls: 'model-runner-services' });

    services.forEach((service) => {
      this.renderServiceCard(servicesContainer, service);
    });

    // Claude Code 配置区域
    this.renderClaudeCodeConfig(containerEl);
  }

  private renderServiceCard(containerEl: HTMLElement, service: any): void {
    const serviceCard = containerEl.createDiv({ cls: 'service-card' });

    // 服务头部
    const serviceHeader = serviceCard.createDiv({ cls: 'service-header' });
    const serviceName = serviceHeader.createDiv({ cls: 'service-name' });
    serviceName.setText(service.displayName);

    const statusBadge = serviceHeader.createDiv({ cls: 'service-status' });
    statusBadge.setText('检查中...');

    // 服务描述
    const serviceDesc = serviceCard.createDiv({ cls: 'service-description' });
    serviceDesc.setText(service.description);

    // 服务详情
    const serviceDetails = serviceCard.createDiv({ cls: 'service-details' });

    if (service.port) {
      const portRow = serviceDetails.createDiv({ cls: 'service-detail-row' });
      portRow.createSpan({ text: '端口: ', cls: 'service-detail-label' });
      portRow.createSpan({ text: String(service.port), cls: 'service-detail-value' });
    }

    if (service.configFile) {
      const configRow = serviceDetails.createDiv({ cls: 'service-detail-row' });
      configRow.createSpan({ text: '配置: ', cls: 'service-detail-label' });
      configRow.createSpan({ text: service.configFile, cls: 'service-detail-value' });
    }

    // 操作按钮
    const serviceActions = serviceCard.createDiv({ cls: 'service-actions' });

    const startBtn = serviceActions.createEl('button', {
      text: '启动',
      cls: 'mod-cta',
    });
    startBtn.onclick = async () => {
      try {
        startBtn.disabled = true;
        startBtn.setText('启动中...');

        // 对于 model-runner，委托给 ProcessManager
        if (service.name === 'model-runner') {
          console.log('[SettingsTab] 委托给 ProcessManager 启动');
          await this.plugin.processManager.start();
        } else {
          // 其他服务使用 ServiceManager
          await this.plugin.serviceManager.startService(service.name);
        }

        // 重新渲染整个设置页面
        this.display();
      } catch (error) {
        new Notice('启动失败: ' + error);
        startBtn.disabled = false;
        startBtn.setText('启动');
      }
    };

    const stopBtn = serviceActions.createEl('button', {
      text: '停止',
      cls: 'mod-warning',
    });
    stopBtn.onclick = async () => {
      try {
        stopBtn.disabled = true;
        stopBtn.setText('停止中...');

        // 对于 model-runner，委托给 ProcessManager
        if (service.name === 'model-runner') {
          console.log('[SettingsTab] 委托给 ProcessManager 停止');
          await this.plugin.processManager.stop(); // ← 添加 await
          // 等待端口释放
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // 其他服务使用 ServiceManager
          await this.plugin.serviceManager.stopService(service.name);
        }

        // 重新渲染整个设置页面
        this.display();
      } catch (error) {
        new Notice('停止失败: ' + error);
        stopBtn.disabled = false;
        stopBtn.setText('停止');
      }
    };

    const configBtn = serviceActions.createEl('button', {
      text: '配置',
    });
    configBtn.onclick = () => {
      this.showServiceConfigModal(service);
    };

    // 检查服务状态
    this.plugin.serviceManager.checkServiceStatus(service.name).then((status) => {
      statusBadge.className = 'service-status status-' + status;
      statusBadge.setText(status === 'running' ? '运行中' : '已停止');

      if (status === 'running') {
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    });
  }

  private renderClaudeCodeConfig(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: '💻 Claude Code 配置' });

    const claudeDesc = containerEl.createDiv({ cls: 'setting-item-description' });
    claudeDesc.setText('管理 Claude Code 的 API 源和模型配置');

    const claudeCard = containerEl.createDiv({ cls: 'service-card' });

    // 配置路径
    const pathRow = claudeCard.createDiv({ cls: 'service-detail-row' });
    pathRow.createSpan({ text: '配置路径: ', cls: 'service-detail-label' });
    pathRow.createSpan({
      text: '~/.claude/settings.json',
      cls: 'service-detail-value'
    });

    // 操作按钮
    const claudeActions = claudeCard.createDiv({ cls: 'service-actions' });

    const openConfigBtn = claudeActions.createEl('button', {
      text: '打开配置',
      cls: 'mod-cta',
    });
    openConfigBtn.onclick = () => {
      new Notice('功能开发中...');
    };

    const editSourceBtn = claudeActions.createEl('button', {
      text: '编辑 API 源',
    });
    editSourceBtn.onclick = () => {
      new Notice('功能开发中...');
    };
  }

  private showServiceConfigModal(service: any): void {
    const modal = new ServiceConfigModal(
      this.app,
      this.plugin,
      service,
      (config) => {
        new Notice(`✅ 已保存 ${service.displayName} 配置`);
        // 配置保存后刷新显示
        this.display();
      }
    );
    modal.open();
  }

  private renderMonitorTab(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '📊 状态监控' });
    containerEl.createDiv({ text: '功能开发中...' });
  }

  private renderCurrentSourceSelector(containerEl: HTMLElement): void {
    const config = this.plugin.configManager?.getConfig();
    if (!config) {
      const notice = containerEl.createDiv({ cls: 'mod-warning' });
      notice.setText('⚠️ 配置未加载，请先启动服务器');
      return;
    }

    const currentSourceId = config.activeSourceId;

    new Setting(containerEl)
      .setName('当前源')
      .setDesc('选择当前使用的 API 源')
      .addDropdown((dropdown) => {
        config.sources.forEach((source) => {
          dropdown.addOption(source.id, source.name);
        });
        dropdown.setValue(currentSourceId).onChange(async (value) => {
          try {
            await this.plugin.configManager?.switchSource(value);
            const sourceName = config.sources.find(s => s.id === value)?.name || value;
            new Notice('切换成功: ' + sourceName);
            this.plugin.view?.refreshConfig();
          } catch (error) {
            new Notice('切换失败: ' + error);
          }
        });
      });
  }

  private renderSourcesList(containerEl: HTMLElement): void {
    const config = this.plugin.configManager?.getConfig();
    if (!config) return;

    const sourcesContainer = containerEl.createDiv({ cls: 'model-runner-sources' });

    config.sources.forEach((source) => {
      const sourceItem = sourcesContainer.createDiv({ cls: 'source-item' });

      // 源信息头部
      const sourceHeader = sourceItem.createDiv({ cls: 'source-header' });
      const sourceName = sourceHeader.createDiv({ cls: 'source-name' });
      sourceName.setText(source.name);

      if (source.id === config.activeSourceId) {
        sourceName.createSpan({ text: ' (当前)', cls: 'source-current-badge' });
      }

      // 源详细信息
      const sourceDetails = sourceItem.createDiv({ cls: 'source-details' });

      // Base URL
      const urlRow = sourceDetails.createDiv({ cls: 'source-detail-row' });
      urlRow.createSpan({ text: '🔗 ', cls: 'source-detail-icon' });
      urlRow.createSpan({ text: 'URL: ', cls: 'source-detail-label' });
      urlRow.createSpan({ text: source.baseUrl, cls: 'source-detail-value' });

      // API Keys 数量
      const keysRow = sourceDetails.createDiv({ cls: 'source-detail-row' });
      keysRow.createSpan({ text: '🔑 ', cls: 'source-detail-icon' });
      keysRow.createSpan({ text: 'Keys: ', cls: 'source-detail-label' });
      keysRow.createSpan({
        text: (source.apiKeys?.length || 0) + ' 个',
        cls: 'source-detail-value'
      });

      // 操作按钮
      const sourceActions = sourceItem.createDiv({ cls: 'source-actions' });

      // 管理 Keys 按钮
      const keysBtn = sourceActions.createEl('button', {
        text: '🔑 管理 Keys',
      });
      keysBtn.onclick = () => {
        new ManageKeysModal(
          this.app,
          this.plugin,
          source.id,
          source.name,
          source.apiKeys || [],
          async (keys) => {
            try {
              const config = this.plugin.configManager?.getConfig();
              if (config) {
                const sourceToUpdate = config.sources.find(s => s.id === source.id);
                if (sourceToUpdate) {
                  sourceToUpdate.apiKeys = keys;
                  await this.plugin.configManager?.save(config);
                  new Notice('Keys 已更新');
                  this.display();
                }
              }
            } catch (error) {
              new Notice('更新失败: ' + error);
            }
          }
        ).open();
      };

      // 编辑按钮
      const editBtn = sourceActions.createEl('button', {
        text: '✏️ 编辑',
      });
      editBtn.onclick = () => {
        this.showEditSourceModal(source.id, source);
      };

      // 删除按钮
      const deleteBtn = sourceActions.createEl('button', {
        text: '🗑️ 删除',
        cls: 'mod-warning',
      });
      deleteBtn.onclick = async () => {
        if (source.id === config.activeSourceId) {
          new Notice('无法删除当前使用的源');
          return;
        }

        const confirmed = confirm('确定要删除源 "' + source.name + '" 吗？');
        if (confirmed) {
          try {
            await this.plugin.configManager?.deleteSource(source.id);
            new Notice('已删除: ' + source.name);
            this.display();
          } catch (error) {
            new Notice('删除失败: ' + error);
          }
        }
      };
    });
  }

  private showAddSourceModal(): void {
    new AddSourceModal(this.app, this.plugin, async (data) => {
      try {
        await this.plugin.configManager?.addSource({
          id: data.name.toLowerCase().replace(/\s+/g, '-'),
          name: data.name,
          baseUrl: data.baseURL,
          apiKey: data.apiKey,
        });

        new Notice('已添加源: ' + data.name);
        this.display();
      } catch (error) {
        new Notice('添加失败: ' + error);
      }
    }).open();
  }

  private showEditSourceModal(sourceId: string, source: any): void {
    new EditSourceModal(this.app, this.plugin, source.name, source, async (data) => {
      try {
        await this.plugin.configManager?.updateSource(sourceId, {
          name: data.name || undefined,
          baseUrl: data.baseURL || undefined,
          apiKey: data.apiKey || undefined,
        });

        new Notice('已更新源: ' + source.name);
        this.display();
      } catch (error) {
        new Notice('更新失败: ' + error);
      }
    }).open();
  }
}
