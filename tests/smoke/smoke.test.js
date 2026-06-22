/**
 * 冒烟测试 - 快速验证核心功能
 * 这些测试应该在每次构建后运行
 */

describe('冒烟测试 - 核心功能', () => {
  describe('基础功能', () => {
    test('SMOKE-001: 插件模块可以加载', () => {
      // 验证主要模块可以被 require
      expect(() => {
        require('../src/ConfigManager');
        require('../src/StatsManager');
        require('../src/ClaudeCodeManager');
        require('../src/ProcessManager');
      }).not.toThrow();
    });

    test('SMOKE-002: ConfigManager 可以创建实例', () => {
      const { ConfigManager } = require('../src/ConfigManager');
      const manager = new ConfigManager('/mock/path');
      expect(manager).toBeDefined();
    });

    test('SMOKE-003: StatsManager 可以创建实例', () => {
      const { StatsManager } = require('../src/StatsManager');
      const manager = new StatsManager('/mock/path');
      expect(manager).toBeDefined();
    });

    test('SMOKE-004: ClaudeCodeManager 可以创建实例', () => {
      const { ClaudeCodeManager } = require('../src/ClaudeCodeManager');
      const manager = new ClaudeCodeManager();
      expect(manager).toBeDefined();
    });

    test('SMOKE-005: ProcessManager 可以创建实例', () => {
      const { ProcessManager } = require('../src/ProcessManager');
      const manager = new ProcessManager('/mock/path', jest.fn(), jest.fn());
      expect(manager).toBeDefined();
    });
  });

  describe('配置管理', () => {
    test('SMOKE-006: ConfigManager 可以验证 URL', () => {
      const { ConfigManager } = require('../src/ConfigManager');
      const manager = new ConfigManager('/mock/path');

      expect(manager.validateUrl('https://api.example.com/v1')).toBe(true);
      expect(manager.validateUrl('http://localhost:4000')).toBe(true);
      expect(manager.validateUrl('ftp://example.com')).toBe(false);
      expect(manager.validateUrl('invalid')).toBe(false);
    });

    test('SMOKE-007: ConfigManager 可以验证 ID', () => {
      const { ConfigManager } = require('../src/ConfigManager');
      const manager = new ConfigManager('/mock/path');

      expect(manager.validateId('valid-id-123')).toBe(true);
      expect(manager.validateId('invalid id')).toBe(false);
      expect(manager.validateId('')).toBe(false);
    });
  });

  describe('统计管理', () => {
    test('SMOKE-008: StatsManager 返回空统计', () => {
      const { StatsManager } = require('../src/StatsManager');
      const fs = require('fs');
      jest.mock('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);

      const manager = new StatsManager('/mock/path');
      const stats = manager.readStats();

      expect(stats).toBeDefined();
      expect(stats.totalRequests).toBe(0);
      expect(stats.recentLogs).toEqual([]);
    });

    test('SMOKE-009: StatsManager 可以计算成功率', () => {
      const { StatsManager } = require('../src/StatsManager');
      const fs = require('fs');
      jest.mock('fs');

      const mockStats = {
        totalRequests: 10,
        successRequests: 8,
        failedRequests: 2,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgLatencyMs: 0,
        byModel: {},
        bySource: {},
        recentLogs: []
      };

      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockStats));

      const manager = new StatsManager('/mock/path');
      const summary = manager.getSummary();

      expect(summary.successRate).toBe(80);
    });
  });

  describe('ClaudeCode 集成', () => {
    test('SMOKE-010: ClaudeCodeManager 可以获取配置路径', () => {
      const { ClaudeCodeManager } = require('../src/ClaudeCodeManager');
      const manager = new ClaudeCodeManager();

      const configPath = manager.getConfigPath();
      expect(configPath).toContain('.claude');
      expect(configPath).toContain('settings.json');
    });

    test('SMOKE-011: ClaudeCodeManager 可以检查状态', () => {
      const { ClaudeCodeManager } = require('../src/ClaudeCodeManager');
      const fs = require('fs');
      jest.mock('fs');

      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'http://localhost:4000'
        }
      };

      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockConfig));

      const manager = new ClaudeCodeManager();
      const status = manager.getConfigStatus();

      expect(status).toBeDefined();
      expect(status.isUsingModelRunner).toBe(true);
    });
  });

  describe('关键方法存在性检查', () => {
    test('SMOKE-012: ConfigManager 有所有必需方法', () => {
      const { ConfigManager } = require('../src/ConfigManager');
      const manager = new ConfigManager('/mock/path');

      expect(typeof manager.getConfig).toBe('function');
      expect(typeof manager.saveConfig).toBe('function');
      expect(typeof manager.addSource).toBe('function');
      expect(typeof manager.deleteSource).toBe('function');
      expect(typeof manager.switchSource).toBe('function');
      expect(typeof manager.validateUrl).toBe('function');
      expect(typeof manager.validateId).toBe('function');
    });

    test('SMOKE-013: StatsManager 有所有必需方法', () => {
      const { StatsManager } = require('../src/StatsManager');
      const manager = new StatsManager('/mock/path');

      expect(typeof manager.readStats).toBe('function');
      expect(typeof manager.saveStats).toBe('function');
      expect(typeof manager.addRequestLog).toBe('function');
      expect(typeof manager.resetStats).toBe('function');
      expect(typeof manager.calculateTotalCost).toBe('function');
      expect(typeof manager.getSummary).toBe('function');
    });

    test('SMOKE-014: ClaudeCodeManager 有所有必需方法', () => {
      const { ClaudeCodeManager } = require('../src/ClaudeCodeManager');
      const manager = new ClaudeCodeManager();

      expect(typeof manager.readConfig).toBe('function');
      expect(typeof manager.saveConfig).toBe('function');
      expect(typeof manager.configureForModelRunner).toBe('function');
      expect(typeof manager.restoreOriginalConfig).toBe('function');
      expect(typeof manager.backupConfig).toBe('function');
      expect(typeof manager.getConfigStatus).toBe('function');
      expect(typeof manager.listBackups).toBe('function');
      expect(typeof manager.restoreFromBackup).toBe('function');
    });

    test('SMOKE-015: ProcessManager 有所有必需方法', () => {
      const { ProcessManager } = require('../src/ProcessManager');
      const manager = new ProcessManager('/mock/path', jest.fn(), jest.fn());

      expect(typeof manager.start).toBe('function');
      expect(typeof manager.stop).toBe('function');
      expect(typeof manager.isRunning).toBe('function');
    });
  });

  describe('类型和接口', () => {
    test('SMOKE-016: 类型定义文件存在', () => {
      expect(() => {
        require('../src/types');
      }).not.toThrow();
    });

    test('SMOKE-017: 常量定义文件存在', () => {
      expect(() => {
        require('../src/constants');
      }).not.toThrow();
    });

    test('SMOKE-018: 常量定义正确', () => {
      const constants = require('../src/constants');

      expect(constants.DEFAULT_PORT).toBeDefined();
      expect(constants.DEFAULT_SETTINGS).toBeDefined();
      expect(constants.SERVER_READY_PATTERNS).toBeDefined();
      expect(constants.LOG_COLORS).toBeDefined();
    });
  });

  describe('错误处理', () => {
    test('SMOKE-019: ConfigManager 处理无效输入', () => {
      const { ConfigManager } = require('../src/ConfigManager');
      const manager = new ConfigManager('/mock/path');

      expect(manager.validateUrl(null)).toBe(false);
      expect(manager.validateUrl(undefined)).toBe(false);
      expect(manager.validateId(null)).toBe(false);
      expect(manager.validateId(undefined)).toBe(false);
    });

    test('SMOKE-020: 模块不会在加载时崩溃', () => {
      // 重新加载所有模块，确保没有立即执行的错误
      jest.resetModules();

      expect(() => {
        require('../src/main');
        require('../src/ModelRunnerView');
        require('../src/SettingsTab');
        require('../src/SourceModals');
        require('../src/ManageKeysModal');
        require('../src/ModelCostConfigModal');
        require('../src/ServiceConfigModal');
        require('../src/ClaudeCodeSourceModal');
        require('../src/ServiceManager');
      }).not.toThrow();
    });
  });
});
