import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type ModelRunnerPlugin from './main';
import { AddSourceModal, EditSourceModal } from './SourceModals';
import { ManageKeysModal } from './ManageKeysModal';

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

  private renderModelsTab(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '🎯 模型管理' });
    containerEl.createDiv({ text: '功能开发中...' });
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
    new Notice('配置编辑功能开发中...');
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
