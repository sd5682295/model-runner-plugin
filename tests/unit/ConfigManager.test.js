const { ConfigManager } = require('../src/ConfigManager');
const fs = require('fs');
const path = require('path');

// Mock fs 模块
jest.mock('fs');

describe('ConfigManager - 单元测试', () => {
  let configManager;
  const mockServerDir = '/mock/server/dir';
  const mockConfigPath = path.join(mockServerDir, 'config.json');

  beforeEach(() => {
    jest.clearAllMocks();
    configManager = new ConfigManager(mockServerDir);
  });

  describe('UT-CFG-001: 读取有效配置', () => {
    test('应该成功读取配置文件', () => {
      const mockConfig = {
        sources: [{ id: 'test', name: 'Test Source', baseUrl: 'https://api.test.com/v1', apiKeys: ['sk-123'] }],
        activeSourceId: 'test',
        timeout: 30000,
        retries: 3
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const result = configManager.getConfig();

      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
      expect(result).toEqual(mockConfig);
      expect(result.sources).toHaveLength(1);
    });
  });

  describe('UT-CFG-002: 读取不存在配置', () => {
    test('应该返回 null', () => {
      fs.existsSync.mockReturnValue(false);

      const result = configManager.getConfig();

      expect(result).toBeNull();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  describe('UT-CFG-003: 读取损坏配置', () => {
    test('应该返回 null 并记录错误', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{ invalid json }');

      const result = configManager.getConfig();

      expect(result).toBeNull();
    });
  });

  describe('UT-CFG-004: 保存配置', () => {
    test('应该成功写入配置文件', () => {
      const mockConfig = {
        sources: [{ id: 'test', name: 'Test', baseUrl: 'https://api.test.com/v1', apiKeys: ['sk-123'] }],
        activeSourceId: 'test'
      };

      fs.writeFileSync.mockImplementation(() => {});

      const result = configManager.saveConfig(mockConfig);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('"activeSourceId": "test"'),
        'utf-8'
      );
      expect(result).toBe(true);
    });
  });

  describe('UT-CFG-005: 验证 URL - 有效', () => {
    test('HTTPS URL 应该有效', () => {
      const result = configManager.validateUrl('https://api.example.com/v1');
      expect(result).toBe(true);
    });

    test('HTTP URL 应该有效', () => {
      const result = configManager.validateUrl('http://localhost:4000');
      expect(result).toBe(true);
    });
  });

  describe('UT-CFG-006: 验证 URL - 无协议', () => {
    test('应该返回 false', () => {
      const result = configManager.validateUrl('api.example.com');
      expect(result).toBe(false);
    });
  });

  describe('UT-CFG-007: 验证 URL - 非 HTTP', () => {
    test('FTP URL 应该无效', () => {
      const result = configManager.validateUrl('ftp://example.com');
      expect(result).toBe(false);
    });
  });

  describe('UT-CFG-008: 验证 ID - 有效', () => {
    test('字母数字和连字符应该有效', () => {
      const result = configManager.validateId('my-source-123');
      expect(result).toBe(true);
    });
  });

  describe('UT-CFG-009: 验证 ID - 空', () => {
    test('空字符串应该无效', () => {
      const result = configManager.validateId('');
      expect(result).toBe(false);
    });
  });

  describe('UT-CFG-010: 验证 ID - 特殊字符', () => {
    test('包含空格和特殊字符应该无效', () => {
      expect(configManager.validateId('my source!')).toBe(false);
      expect(configManager.validateId('source<>')).toBe(false);
    });
  });

  describe('UT-CFG-011: 添加源', () => {
    test('应该成功添加新源', () => {
      const existingConfig = {
        sources: [],
        activeSourceId: ''
      };

      const newSource = {
        id: 'new-source',
        name: 'New Source',
        baseUrl: 'https://api.new.com/v1',
        apiKeys: ['sk-new']
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync.mockImplementation(() => {});

      const result = configManager.addSource(newSource);

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('UT-CFG-012: 添加重复源', () => {
    test('应该抛出错误', () => {
      const existingConfig = {
        sources: [{ id: 'existing', name: 'Existing', baseUrl: 'https://api.test.com/v1', apiKeys: ['sk-123'] }],
        activeSourceId: 'existing'
      };

      const duplicateSource = {
        id: 'existing',
        name: 'Duplicate',
        baseUrl: 'https://api.new.com/v1',
        apiKeys: ['sk-new']
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingConfig));

      expect(() => {
        configManager.addSource(duplicateSource);
      }).toThrow();
    });
  });

  describe('UT-CFG-013: 删除源', () => {
    test('应该成功删除非当前源', () => {
      const config = {
        sources: [
          { id: 'source1', name: 'Source 1', baseUrl: 'https://api1.com/v1', apiKeys: ['sk-1'] },
          { id: 'source2', name: 'Source 2', baseUrl: 'https://api2.com/v1', apiKeys: ['sk-2'] }
        ],
        activeSourceId: 'source1'
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(config));
      fs.writeFileSync.mockImplementation(() => {});

      const result = configManager.deleteSource('source2');

      expect(result).toBe(true);
    });
  });

  describe('UT-CFG-014: 删除当前源', () => {
    test('应该抛出错误', () => {
      const config = {
        sources: [{ id: 'current', name: 'Current', baseUrl: 'https://api.com/v1', apiKeys: ['sk-1'] }],
        activeSourceId: 'current'
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(config));

      expect(() => {
        configManager.deleteSource('current');
      }).toThrow('Cannot delete active source');
    });
  });

  describe('UT-CFG-015: 切换源', () => {
    test('应该成功切换源', () => {
      const config = {
        sources: [
          { id: 'source1', name: 'Source 1', baseUrl: 'https://api1.com/v1', apiKeys: ['sk-1'] },
          { id: 'source2', name: 'Source 2', baseUrl: 'https://api2.com/v1', apiKeys: ['sk-2'] }
        ],
        activeSourceId: 'source1'
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(config));
      fs.writeFileSync.mockImplementation(() => {});

      const result = configManager.switchSource('source2');

      expect(result).toBe(true);
      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.activeSourceId).toBe('source2');
    });
  });
});
