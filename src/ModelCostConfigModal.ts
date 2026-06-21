import { App, Modal, Notice, Setting } from 'obsidian';
import type ModelRunnerPlugin from './main';

interface ModelCostData {
  modelId: string;
  inputTokenPrice: number;  // $/1M tokens
  outputTokenPrice: number; // $/1M tokens
}

export class ModelCostConfigModal extends Modal {
  plugin: ModelRunnerPlugin;
  model: any;
  costData: ModelCostData;
  onSave: (data: ModelCostData) => void;

  constructor(
    app: App,
    plugin: ModelRunnerPlugin,
    model: any,
    onSave: (data: ModelCostData) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.model = model;
    this.onSave = onSave;

    // 从配置中读取已有的成本配置
    const config = this.plugin.configManager?.getConfig();
    const existingCost = config?.sources
      .find(s => s.id === config.activeSourceId)
      ?.costConfig?.[model.id];

    this.costData = {
      modelId: model.id,
      inputTokenPrice: existingCost?.input || 0,
      outputTokenPrice: existingCost?.output || 0,
    };
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: '⚙️ 配置模型成本' });

    // 模型信息
    const modelInfo = contentEl.createDiv({ cls: 'model-cost-info' });
    modelInfo.createEl('strong', { text: '模型：' });
    modelInfo.createSpan({ text: this.model.id });

    const description = contentEl.createDiv({ cls: 'setting-item-description' });
    description.setText('设置模型的 Token 价格，用于成本统计和预算控制。');

    // Input Token 价格
    new Setting(contentEl)
      .setName('Input Token 价格')
      .setDesc('每 1M Input Tokens 的价格（美元）')
      .addText((text) => {
        text
          .setPlaceholder('例如: 0.50')
          .setValue(this.costData.inputTokenPrice.toString())
          .onChange((value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0) {
              this.costData.inputTokenPrice = num;
            }
          });
        text.inputEl.type = 'number';
        text.inputEl.step = '0.01';
        text.inputEl.min = '0';
      });

    // Output Token 价格
    new Setting(contentEl)
      .setName('Output Token 价格')
      .setDesc('每 1M Output Tokens 的价格（美元）')
      .addText((text) => {
        text
          .setPlaceholder('例如: 1.50')
          .setValue(this.costData.outputTokenPrice.toString())
          .onChange((value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0) {
              this.costData.outputTokenPrice = num;
            }
          });
        text.inputEl.type = 'number';
        text.inputEl.step = '0.01';
        text.inputEl.min = '0';
      });

    // 成本预览
    this.renderCostPreview(contentEl);

    // 常见价格模板
    this.renderPriceTemplates(contentEl);

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

  private renderCostPreview(containerEl: HTMLElement): void {
    const previewDiv = containerEl.createDiv({ cls: 'cost-preview' });
    previewDiv.createEl('h4', { text: '💰 成本预览' });

    const examples = [
      { input: 1000, output: 1000, label: '1K + 1K tokens' },
      { input: 10000, output: 10000, label: '10K + 10K tokens' },
      { input: 100000, output: 100000, label: '100K + 100K tokens' },
    ];

    const table = previewDiv.createEl('table', { cls: 'cost-preview-table' });

    examples.forEach((example) => {
      const row = table.createEl('tr');
      const labelCell = row.createEl('td', { text: example.label });
      labelCell.style.paddingRight = '16px';

      const inputCost = (example.input / 1000000) * this.costData.inputTokenPrice;
      const outputCost = (example.output / 1000000) * this.costData.outputTokenPrice;
      const totalCost = inputCost + outputCost;

      const costCell = row.createEl('td', { text: `$${totalCost.toFixed(4)}` });
      costCell.style.fontWeight = '600';
      costCell.style.color = 'var(--interactive-accent)';
    });
  }

  private renderPriceTemplates(containerEl: HTMLElement): void {
    const templatesDiv = containerEl.createDiv({ cls: 'price-templates' });
    templatesDiv.createEl('h4', { text: '📋 常见价格模板' });

    const templates = [
      {
        name: 'GPT-4 Turbo',
        input: 10.0,
        output: 30.0,
      },
      {
        name: 'GPT-4',
        input: 30.0,
        output: 60.0,
      },
      {
        name: 'GPT-3.5 Turbo',
        input: 0.5,
        output: 1.5,
      },
      {
        name: 'Claude 3 Opus',
        input: 15.0,
        output: 75.0,
      },
      {
        name: 'Claude 3 Sonnet',
        input: 3.0,
        output: 15.0,
      },
      {
        name: 'Claude 3 Haiku',
        input: 0.25,
        output: 1.25,
      },
    ];

    const templatesGrid = templatesDiv.createDiv({ cls: 'templates-grid' });

    templates.forEach((template) => {
      const templateBtn = templatesGrid.createEl('button', {
        cls: 'template-button',
      });

      const nameSpan = templateBtn.createSpan({ text: template.name });
      nameSpan.style.display = 'block';
      nameSpan.style.fontWeight = '600';
      nameSpan.style.marginBottom = '4px';

      const priceSpan = templateBtn.createSpan({
        text: `$${template.input} / $${template.output}`,
      });
      priceSpan.style.fontSize = '0.85em';
      priceSpan.style.color = 'var(--text-muted)';

      templateBtn.onclick = () => {
        this.costData.inputTokenPrice = template.input;
        this.costData.outputTokenPrice = template.output;
        this.close();
        this.onOpen(); // 重新打开以更新预览
      };
    });
  }

  private async handleSave(): Promise<void> {
    try {
      // 验证输入
      if (this.costData.inputTokenPrice < 0 || this.costData.outputTokenPrice < 0) {
        new Notice('❌ 价格不能为负数');
        return;
      }

      // 保存到配置
      await this.saveCostConfig();

      new Notice(`✅ 已保存 ${this.model.id} 的成本配置`);
      this.onSave(this.costData);
      this.close();
    } catch (error) {
      new Notice(`❌ 保存失败: ${error.message}`);
      console.error('[ModelCostConfigModal] 保存失败:', error);
    }
  }

  private async saveCostConfig(): Promise<void> {
    const config = this.plugin.configManager?.getConfig();
    if (!config) {
      throw new Error('配置未加载');
    }

    // 找到当前源
    const currentSource = config.sources.find(s => s.id === config.activeSourceId);
    if (!currentSource) {
      throw new Error('当前源不存在');
    }

    // 初始化 costConfig
    if (!currentSource.costConfig) {
      currentSource.costConfig = {};
    }

    // 保存成本配置
    currentSource.costConfig[this.model.id] = {
      input: this.costData.inputTokenPrice,
      output: this.costData.outputTokenPrice,
    };

    // 保存配置文件
    await this.plugin.configManager?.save(config);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
