// Jest 测试环境设置

// 全局测试超时
jest.setTimeout(30000);

// Mock Obsidian API
global.Notice = class Notice {
  constructor(message) {
    this.message = message;
  }
};

global.Plugin = class Plugin {
  constructor() {
    this.app = {};
    this.manifest = {};
  }

  async loadData() {
    return {};
  }

  async saveData(data) {
    return;
  }
};

global.ItemView = class ItemView {};
global.PluginSettingTab = class PluginSettingTab {};
global.Modal = class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = {
      empty: jest.fn(),
      createEl: jest.fn(() => ({
        createEl: jest.fn(),
        createDiv: jest.fn(),
        createSpan: jest.fn(),
        setText: jest.fn(),
        onclick: jest.fn()
      })),
      createDiv: jest.fn(() => ({
        createEl: jest.fn(),
        createDiv: jest.fn(),
        createSpan: jest.fn(),
        setText: jest.fn()
      }))
    };
  }

  open() {}
  close() {}
};

global.Setting = class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
  }

  setName(name) {
    return this;
  }

  setDesc(desc) {
    return this;
  }

  addText(callback) {
    const textComponent = {
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
      inputEl: { type: 'text' }
    };
    callback(textComponent);
    return this;
  }

  addDropdown(callback) {
    const dropdownComponent = {
      addOption: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis()
    };
    callback(dropdownComponent);
    return this;
  }

  addToggle(callback) {
    const toggleComponent = {
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis()
    };
    callback(toggleComponent);
    return this;
  }

  addButton(callback) {
    const buttonComponent = {
      setButtonText: jest.fn().mockReturnThis(),
      setCta: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockReturnThis(),
      setDisabled: jest.fn().mockReturnThis()
    };
    callback(buttonComponent);
    return this;
  }
};

global.FileSystemAdapter = class FileSystemAdapter {
  getBasePath() {
    return '/mock/vault/path';
  }
};

// 控制台输出控制
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// 在测试中隐藏预期的错误/警告
global.console = {
  ...console,
  error: jest.fn((...args) => {
    // 只记录非预期的错误
    if (!args[0]?.includes('[test expected error]')) {
      originalConsoleError(...args);
    }
  }),
  warn: jest.fn((...args) => {
    // 只记录非预期的警告
    if (!args[0]?.includes('[test expected warning]')) {
      originalConsoleWarn(...args);
    }
  })
};

// 清理函数
afterEach(() => {
  jest.clearAllMocks();
});
