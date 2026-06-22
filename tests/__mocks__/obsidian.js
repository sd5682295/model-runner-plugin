// Mock Obsidian API for testing

module.exports = {
  Notice: class Notice {
    constructor(message) {
      this.message = message;
    }
  },

  Plugin: class Plugin {
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

    addRibbonIcon(icon, title, callback) {
      return {};
    }

    addSettingTab(tab) {}

    registerView(type, creator) {}
  },

  ItemView: class ItemView {},

  PluginSettingTab: class PluginSettingTab {},

  Modal: class Modal {
    constructor(app) {
      this.app = app;
      this.contentEl = {
        empty: jest.fn(),
        createEl: jest.fn(() => ({
          createEl: jest.fn(),
          createDiv: jest.fn(),
          createSpan: jest.fn(),
          setText: jest.fn()
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
  },

  Setting: class Setting {
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
      callback({
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
        inputEl: { type: 'text' }
      });
      return this;
    }

    addDropdown(callback) {
      callback({
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis()
      });
      return this;
    }

    addToggle(callback) {
      callback({
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis()
      });
      return this;
    }

    addButton(callback) {
      callback({
        setButtonText: jest.fn().mockReturnThis(),
        setCta: jest.fn().mockReturnThis(),
        onClick: jest.fn().mockReturnThis()
      });
      return this;
    }
  },

  FileSystemAdapter: class FileSystemAdapter {
    getBasePath() {
      return '/mock/vault/path';
    }
  }
};
