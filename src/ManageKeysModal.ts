import { App, Modal, Notice, Setting } from 'obsidian';
import type ModelRunnerPlugin from './main';

export class ManageKeysModal extends Modal {
  plugin: ModelRunnerPlugin;
  sourceId: string;
  sourceName: string;
  apiKeys: string[];
  onSave: (keys: string[]) => void;

  constructor(
    app: App,
    plugin: ModelRunnerPlugin,
    sourceId: string,
    sourceName: string,
    apiKeys: string[],
    onSave: (keys: string[]) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.sourceId = sourceId;
    this.sourceName = sourceName;
    this.apiKeys = [...apiKeys]; // 复制数组
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: `🔑 管理 API Keys: ${this.sourceName}` });

    // 提示信息
    const tipDiv = contentEl.createDiv({ cls: 'setting-item-description' });
    tipDiv.setText('管理此源的所有 API Keys。多个 Key 将按顺序轮询使用。');

    // Keys 列表容器
    const keysContainer = contentEl.createDiv({ cls: 'api-keys-container' });
    this.renderKeysList(keysContainer);

    // 轮询策略
    new Setting(contentEl)
      .setName('轮询策略')
      .setDesc('多个 Key 的使用策略')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('round-robin', '顺序轮询')
          .addOption('random', '随机选择')
          .addOption('priority', '优先级')
          .setValue('round-robin');
      });

    // 添加新 Key 按钮
    const addBtn = contentEl.createEl('button', {
      text: '➕ 添加新 Key',
      cls: 'mod-cta',
    });
    addBtn.style.width = '100%';
    addBtn.style.marginTop = '16px';
    addBtn.onclick = () => this.showAddKeyModal();

    // 按钮区域
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => this.close();

    const saveBtn = buttonContainer.createEl('button', {
      text: '保存',
      cls: 'mod-cta',
    });
    saveBtn.onclick = () => this.handleSave();
  }

  private renderKeysList(container: HTMLElement): void {
    container.empty();

    if (this.apiKeys.length === 0) {
      const emptyDiv = container.createDiv({ cls: 'api-key-item-empty' });
      emptyDiv.setText('暂无 API Key，点击下方按钮添加');
      return;
    }

    this.apiKeys.forEach((key, index) => {
      const keyItem = container.createDiv({ cls: 'api-key-item' });

      // Key 信息
      const keyInfo = keyItem.createDiv({ cls: 'api-key-info' });

      const keyLabel = keyInfo.createDiv({ cls: 'api-key-label' });
      keyLabel.setText(`Key ${index + 1}`);

      const keyValue = keyInfo.createDiv({ cls: 'api-key-value' });
      keyValue.setText(this.maskKey(key));

      const keyStatus = keyInfo.createDiv({ cls: 'api-key-status' });
      keyStatus.setText('状态: 未测试');

      // 操作按钮
      const keyActions = keyItem.createDiv({ cls: 'api-key-actions' });

      const testBtn = keyActions.createEl('button', {
        text: '测试',
        cls: 'mod-warning',
      });
      testBtn.onclick = () => this.testKey(key, keyStatus);

      const editBtn = keyActions.createEl('button', { text: '编辑' });
      editBtn.onclick = () => this.showEditKeyModal(index);

      const deleteBtn = keyActions.createEl('button', {
        text: '删除',
        cls: 'mod-warning',
      });
      deleteBtn.onclick = () => this.deleteKey(index);
    });
  }

  private maskKey(key: string): string {
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 8) + '•'.repeat(Math.min(key.length - 8, 20));
  }

  private showAddKeyModal(): void {
    const modal = new AddKeyModal(this.app, (newKey) => {
      if (this.apiKeys.includes(newKey)) {
        new Notice('❌ 此 Key 已存在');
        return;
      }
      this.apiKeys.push(newKey);
      this.onOpen(); // 刷新显示
      new Notice('✅ Key 已添加');
    });
    modal.open();
  }

  private showEditKeyModal(index: number): void {
    const oldKey = this.apiKeys[index];
    if (!oldKey) return;

    const modal = new EditKeyModal(this.app, oldKey, (newKey) => {
      this.apiKeys[index] = newKey;
      this.onOpen(); // 刷新显示
      new Notice('✅ Key 已更新');
    });
    modal.open();
  }

  private deleteKey(index: number): void {
    if (this.apiKeys.length === 1) {
      new Notice('❌ 至少需要保留一个 Key');
      return;
    }

    const confirmed = confirm('确定要删除此 Key 吗？');
    if (confirmed) {
      this.apiKeys.splice(index, 1);
      this.onOpen(); // 刷新显示
      new Notice('✅ Key 已删除');
    }
  }

  private async testKey(key: string, statusEl: HTMLElement): Promise<void> {
    statusEl.setText('状态: 🔍 测试中...');

    try {
      const config = this.plugin.configManager?.getConfig();
      const source = config?.sources.find((s) => s.id === this.sourceId);
      if (!source) {
        statusEl.setText('状态: ❌ 源不存在');
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${source.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const modelCount = data.data?.length || 0;
        statusEl.setText(`状态: ✅ 正常 (${modelCount} 个模型)`);
        new Notice('✅ Key 测试成功');
      } else {
        statusEl.setText(`状态: ❌ 失败 (${response.status})`);
        new Notice(`❌ Key 测试失败: ${response.status}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        statusEl.setText('状态: ❌ 超时');
        new Notice('❌ 连接超时');
      } else {
        statusEl.setText('状态: ❌ 错误');
        new Notice(`❌ 测试失败: ${error.message}`);
      }
    }
  }

  private handleSave(): void {
    if (this.apiKeys.length === 0) {
      new Notice('❌ 至少需要一个 API Key');
      return;
    }

    this.onSave(this.apiKeys);
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// 添加 Key 的小模态框
class AddKeyModal extends Modal {
  onSubmit: (key: string) => void;
  keyValue: string = '';

  constructor(app: App, onSubmit: (key: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h3', { text: '添加 API Key' });

    new Setting(contentEl)
      .setName('API Key')
      .setDesc('输入新的 API Key')
      .addText((text) => {
        text
          .setPlaceholder('sk-...')
          .onChange((value) => {
            this.keyValue = value;
          });
        text.inputEl.type = 'password';
        text.inputEl.style.width = '100%';
      });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => this.close();

    const addBtn = buttonContainer.createEl('button', {
      text: '添加',
      cls: 'mod-cta',
    });
    addBtn.onclick = () => {
      if (!this.keyValue.trim()) {
        new Notice('❌ Key 不能为空');
        return;
      }
      this.onSubmit(this.keyValue);
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// 编辑 Key 的小模态框
class EditKeyModal extends Modal {
  oldKey: string;
  newKey: string = '';
  onSubmit: (key: string) => void;

  constructor(app: App, oldKey: string, onSubmit: (key: string) => void) {
    super(app);
    this.oldKey = oldKey;
    this.newKey = oldKey;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h3', { text: '编辑 API Key' });

    new Setting(contentEl)
      .setName('API Key')
      .setDesc('修改 API Key')
      .addText((text) => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.oldKey)
          .onChange((value) => {
            this.newKey = value;
          });
        text.inputEl.type = 'password';
        text.inputEl.style.width = '100%';
      });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => this.close();

    const saveBtn = buttonContainer.createEl('button', {
      text: '保存',
      cls: 'mod-cta',
    });
    saveBtn.onclick = () => {
      if (!this.newKey.trim()) {
        new Notice('❌ Key 不能为空');
        return;
      }
      this.onSubmit(this.newKey);
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
