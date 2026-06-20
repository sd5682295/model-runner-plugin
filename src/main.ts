import { Plugin, Notice, FileSystemAdapter } from 'obsidian';
import { ProcessManager } from './ProcessManager';
import { ModelRunnerView, VIEW_TYPE } from './ModelRunnerView';
import { ConfigManager } from './ConfigManager';
import { ServiceManager } from './ServiceManager';
import { ModelRunnerSettingTab } from './SettingsTab';
import { DEFAULT_SETTINGS, type PluginSettings } from './constants';
import * as path from 'path';

export default class ModelRunnerPlugin extends Plugin {
  settings!: PluginSettings;
  processManager!: ProcessManager;
  configManager?: ConfigManager;
  serviceManager!: ServiceManager;
  statusBarItem!: HTMLElement;
  view: ModelRunnerView | null = null;
  serverDir!: string;

  async onload(): Promise<void> {
    console.log('Loading Model Runner Plugin');

    await this.loadSettings();

    // 正确获取插件目录的方式（根据 Obsidian 官方文档）
    let vaultPath: string;
    if (this.app.vault.adapter instanceof FileSystemAdapter) {
      vaultPath = this.app.vault.adapter.getBasePath();
    } else {
      new Notice('❌ 插件仅支持桌面版 Obsidian');
      console.error('FileSystemAdapter not available');
      return;
    }

    const pluginDir = path.join(vaultPath, this.manifest.dir || '');
    const serverDir = path.join(pluginDir, 'server');
    this.serverDir = serverDir;

    console.log('Vault path:', vaultPath);
    console.log('Plugin directory:', pluginDir);
    console.log('Server directory:', serverDir);

    // 初始化配置管理器
    this.configManager = new ConfigManager(serverDir);

    // 初始化服务管理器
    this.serviceManager = new ServiceManager();

    this.processManager = new ProcessManager(
      serverDir,
      (msg, level) => this.view?.appendLog(msg, level),
      (running) => this.updateStatusBar(running)
    );

    // 添加设置页面
    this.addSettingTab(new ModelRunnerSettingTab(this.app, this));

    // 注册视图
    this.registerView(VIEW_TYPE, (leaf) => {
      this.view = new ModelRunnerView(leaf, this);
      return this.view;
    });

    // Ribbon 图标
    this.addRibbonIcon('cpu', 'Model Runner', () => {
      this.activateView();
    });

    // 状态栏
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar(false);
    this.statusBarItem.onclick = () => this.toggleServer();

    // 命令
    this.addCommand({
      id: 'start-server',
      name: '启动服务器',
      callback: () => this.startServer(),
    });

    this.addCommand({
      id: 'stop-server',
      name: '停止服务器',
      callback: () => this.stopServer(),
    });

    this.addCommand({
      id: 'open-panel',
      name: '打开控制面板',
      callback: () => this.activateView(),
    });

    // 自动启动
    if (this.settings.autoStart) {
      setTimeout(() => this.startServer(), 2000);
    }
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (!rightLeaf) return;
      await rightLeaf.setViewState({ type: VIEW_TYPE, active: true });
      leaf = rightLeaf;
    }

    workspace.revealLeaf(leaf);
  }

  async startServer(): Promise<void> {
    // 加载配置
    try {
      await this.configManager?.load();
      console.log('配置已加载');

      // 刷新侧边栏配置显示
      if (this.view) {
        this.view.refreshConfig();
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      // 继续启动，使用默认配置
    }

    await this.processManager.start();
  }

  async stopServer(): Promise<void> {
    await this.processManager.stop();
  }

  toggleServer(): void {
    if (this.processManager.getIsRunning()) {
      this.stopServer();
    } else {
      this.startServer();
    }
  }

  updateStatusBar(running: boolean): void {
    const icon = running ? '🟢' : '🔴';
    const text = running ? '运行中' : '未运行';
    this.statusBarItem.setText(`${icon} ${text}`);
  }

  async onunload(): Promise<void> {
    console.log('Unloading Model Runner Plugin');
    this.stopServer();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
