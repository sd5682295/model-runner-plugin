const { ClaudeCodeManager } = require('../src/ClaudeCodeManager');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('fs');
jest.mock('os');

describe('ClaudeCodeManager - 单元测试', () => {
  let manager;
  const mockConfigPath = '/home/user/.claude/settings.json';

  beforeEach(() => {
    jest.clearAllMocks();
    os.homedir.mockReturnValue('/home/user');
    manager = new ClaudeCodeManager();
  });

  describe('UT-CC-001: 读取配置', () => {
    test('settings.json 存在时应该返回配置', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
          ANTHROPIC_AUTH_TOKEN: 'sk-test'
        },
        permissions: {}
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const result = manager.readConfig();

      expect(result).toEqual(mockConfig);
      expect(result.env.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
    });

    test('配置不存在时应该返回 null', () => {
      fs.existsSync.mockReturnValue(false);

      const result = manager.readConfig();

      expect(result).toBeNull();
    });
  });

  describe('UT-CC-002: 配置使用 model-runner', () => {
    test('应该更新 URL 到 localhost', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
          ANTHROPIC_AUTH_TOKEN: 'sk-test'
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      fs.writeFileSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {}); // mock backup

      const result = manager.configureForModelRunner(4000);

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.env.ANTHROPIC_BASE_URL).toBe('http://localhost:4000');
    });

    test('应该保存原始配置', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
          ANTHROPIC_AUTH_TOKEN: 'sk-test'
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      fs.writeFileSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {});

      manager.configureForModelRunner(4000);

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.env._ORIGINAL_ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
      expect(savedConfig.env._ORIGINAL_ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
    });

    test('应该移除 ANTHROPIC_AUTH_TOKEN', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
          ANTHROPIC_AUTH_TOKEN: 'sk-test'
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      fs.writeFileSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {});

      manager.configureForModelRunner(4000);

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    });
  });

  describe('UT-CC-003: 恢复官方 API', () => {
    test('应该恢复原始配置', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'http://localhost:4000',
          _ORIGINAL_ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
          _ORIGINAL_ANTHROPIC_AUTH_TOKEN: 'sk-test'
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      fs.writeFileSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {});

      const result = manager.restoreOriginalConfig();

      expect(result).toBe(true);

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.env.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
      expect(savedConfig.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
      expect(savedConfig.env._ORIGINAL_ANTHROPIC_BASE_URL).toBeUndefined();
    });
  });

  describe('UT-CC-004: 备份配置', () => {
    test('应该创建备份文件', () => {
      fs.existsSync.mockReturnValue(true);
      fs.copyFileSync.mockImplementation(() => {});

      const result = manager.backupConfig();

      expect(result).toBe(true);
      expect(fs.copyFileSync).toHaveBeenCalled();

      const backupPath = fs.copyFileSync.mock.calls[0][1];
      expect(backupPath).toContain('.backup-');
    });

    test('配置不存在时应该返回 false', () => {
      fs.existsSync.mockReturnValue(false);

      const result = manager.backupConfig();

      expect(result).toBe(false);
      expect(fs.copyFileSync).not.toHaveBeenCalled();
    });
  });

  describe('UT-CC-005: 列出备份', () => {
    test('应该返回备份文件列表', () => {
      const mockFiles = [
        'settings.json',
        'settings.json.backup-2024-01-01T10-00-00',
        'settings.json.backup-2024-01-02T10-00-00',
        'other-file.txt'
      ];

      fs.readdirSync.mockReturnValue(mockFiles);

      const result = manager.listBackups();

      expect(result).toHaveLength(2);
      expect(result[0]).toContain('2024-01-02'); // 最新的在前
      expect(result[1]).toContain('2024-01-01');
    });
  });

  describe('UT-CC-006: 从备份恢复', () => {
    test('应该从备份文件恢复', () => {
      const backupPath = '/home/user/.claude/settings.json.backup-2024-01-01';

      fs.existsSync.mockReturnValue(true);
      fs.copyFileSync.mockImplementation(() => {});

      const result = manager.restoreFromBackup(backupPath);

      expect(result).toBe(true);
      expect(fs.copyFileSync).toHaveBeenCalledWith(backupPath, mockConfigPath);
    });

    test('备份不存在时应该返回 false', () => {
      const backupPath = '/home/user/.claude/settings.json.backup-nonexistent';

      fs.existsSync.mockReturnValue(false);

      const result = manager.restoreFromBackup(backupPath);

      expect(result).toBe(false);
    });
  });

  describe('UT-CC-007: 检查状态 - 使用 model-runner', () => {
    test('localhost URL 应该被识别为使用 model-runner', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'http://localhost:4000'
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const status = manager.getConfigStatus();

      expect(status.isUsingModelRunner).toBe(true);
      expect(status.currentUrl).toBe('http://localhost:4000');
    });
  });

  describe('UT-CC-008: 检查状态 - 使用官方 API', () => {
    test('官方 URL 应该被识别为不使用 model-runner', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com'
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const status = manager.getConfigStatus();

      expect(status.isUsingModelRunner).toBe(false);
      expect(status.currentUrl).toBe('https://api.anthropic.com');
    });
  });

  describe('UT-CC-009: 保存原始配置', () => {
    test('_ORIGINAL_* 字段应该存在', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
          ANTHROPIC_AUTH_TOKEN: 'sk-test'
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      fs.writeFileSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {});

      manager.configureForModelRunner(4000);

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.env._ORIGINAL_ANTHROPIC_BASE_URL).toBeDefined();
      expect(savedConfig.env._ORIGINAL_ANTHROPIC_AUTH_TOKEN).toBeDefined();
    });
  });

  describe('UT-CC-010: URL 带源参数', () => {
    test('指定源时应该添加 ?source=xxx', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com'
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      fs.writeFileSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {});

      manager.configureForModelRunner(4000, 'test-source');

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.env.ANTHROPIC_BASE_URL).toBe('http://localhost:4000?source=test-source');
      expect(savedConfig.env._MODELRUNNER_SOURCE_ID).toBe('test-source');
    });

    test('不指定源时 URL 不应该有参数', () => {
      const mockConfig = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com'
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      fs.writeFileSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {});

      manager.configureForModelRunner(4000);

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.env.ANTHROPIC_BASE_URL).toBe('http://localhost:4000');
      expect(savedConfig.env._MODELRUNNER_SOURCE_ID).toBeUndefined();
    });
  });
});
