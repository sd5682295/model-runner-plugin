import { ConfigManager } from '../../src/ConfigManager';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const testServerDir = '/test/server';
  const testConfigPath = path.join(testServerDir, 'config.json');

  const mockConfig = {
    sources: [
      {
        id: 'test-source',
        name: '测试源',
        baseUrl: 'https://api.test.com/v1',
        apiKeys: ['test-key-123'],
      },
    ],
    activeSourceId: 'test-source',
    modelRoutes: {},
    timeout: 30000,
    retries: 3,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configManager = new ConfigManager(testServerDir);
  });

  describe('load()', () => {
    it('应该成功读取配置文件', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      const config = await configManager.load();

      expect(fs.existsSync).toHaveBeenCalledWith(testConfigPath);
      expect(fs.readFileSync).toHaveBeenCalledWith(testConfigPath, 'utf-8');
      expect(config).toEqual(mockConfig);
      expect(configManager.getConfig()).toEqual(mockConfig);
    });

    it('配置文件不存在时应该抛出错误', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      await expect(configManager.load()).rejects.toThrow('配置文件不存在');
    });

    it('配置文件格式错误时应该抛出错误', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json{');
      await expect(configManager.load()).rejects.toThrow();
    });
  });

  describe('save()', () => {
    it('应该成功保存配置文件', async () => {
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      await configManager.save(mockConfig);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testConfigPath,
        JSON.stringify(mockConfig, null, 2),
        'utf-8'
      );
      expect(configManager.getConfig()).toEqual(mockConfig);
    });

    it('保存失败时应该抛出错误', async () => {
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(configManager.save(mockConfig)).rejects.toThrow('Permission denied');
    });
  });

  describe('getSources()', () => {
    it('配置未加载时应该返回空数组', () => {
      const sources = configManager.getSources();
      expect(sources).toEqual([]);
    });

    it('应该返回源列表', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
      await configManager.load();

      const sources = configManager.getSources();

      expect(sources).toHaveLength(1);
      expect(sources[0]).toEqual({
        id: 'test-source',
        name: '测试源',
        enabled: true,
      });
    });

    it('应该返回多个源', async () => {
      const multiSourceConfig = {
        ...mockConfig,
        sources: [
          ...mockConfig.sources,
          {
            id: 'source-2',
            name: '源2',
            baseUrl: 'https://api2.test.com/v1',
            apiKeys: ['key-2'],
          },
        ],
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(multiSourceConfig));
      await configManager.load();

      const sources = configManager.getSources();

      expect(sources).toHaveLength(2);
      expect(sources[1].id).toBe('source-2');
    });
  });

  describe('getCurrentSource()', () => {
    it('配置未加载时应该返回空字符串', () => {
      expect(configManager.getCurrentSource()).toBe('');
    });

    it('应该返回当前源 ID', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
      await configManager.load();

      expect(configManager.getCurrentSource()).toBe('test-source');
    });
  });

  describe('getCurrentSourceName()', () => {
    it('配置未加载时应该返回空字符串', () => {
      expect(configManager.getCurrentSourceName()).toBe('');
    });

    it('应该返回当前源名称', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
      await configManager.load();

      expect(configManager.getCurrentSourceName()).toBe('测试源');
    });
  });

  describe('switchSource()', () => {
    beforeEach(async () => {
      const multiSourceConfig = {
        ...mockConfig,
        sources: [
          ...mockConfig.sources,
          {
            id: 'new-source',
            name: '新源',
            baseUrl: 'https://new.test.com/v1',
            apiKeys: ['new-key'],
          },
        ],
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(multiSourceConfig));
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
      await configManager.load();
    });

    it('应该成功切换源', async () => {
      await configManager.switchSource('new-source');

      expect(configManager.getCurrentSource()).toBe('new-source');
      expect(fs.writeFileSync).toHaveBeenCalled();

      const savedConfig = JSON.parse((fs.writeFileSync as jest.Mock).mock.calls[0][1]);
      expect(savedConfig.activeSourceId).toBe('new-source');
    });

    it('切换到不存在的源时应该抛出错误', async () => {
      await expect(configManager.switchSource('non-existent')).rejects.toThrow('源不存在');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('配置未加载时应该抛出错误', async () => {
      const newManager = new ConfigManager(testServerDir);
      await expect(newManager.switchSource('test-source')).rejects.toThrow('配置未加载');
    });
  });

  describe('addSource()', () => {
    beforeEach(async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
      await configManager.load();
    });

    it('应该成功添加新源', async () => {
      const newSource = {
        id: 'new-source',
        name: '新源',
        baseUrl: 'https://new.test.com/v1',
        apiKey: 'new-key-123',
      };

      await configManager.addSource(newSource);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedConfig = JSON.parse((fs.writeFileSync as jest.Mock).mock.calls[0][1]);
      expect(savedConfig.sources).toHaveLength(2);
      expect(savedConfig.sources[1].id).toBe('new-source');
      expect(savedConfig.sources[1].apiKeys).toEqual(['new-key-123']);
    });

    it('添加重复 ID 的源时应该抛出错误', async () => {
      const duplicateSource = {
        id: 'test-source',
        name: '重复源',
        baseUrl: 'https://dup.test.com/v1',
        apiKey: 'dup-key',
      };

      await expect(configManager.addSource(duplicateSource)).rejects.toThrow('源 ID "test-source" 已存在');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('updateSource()', () => {
    beforeEach(async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
      await configManager.load();
    });

    it('应该成功更新源的名称', async () => {
      await configManager.updateSource('test-source', { name: '新名称' });

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedConfig = JSON.parse((fs.writeFileSync as jest.Mock).mock.calls[0][1]);
      expect(savedConfig.sources[0].name).toBe('新名称');
    });

    it('应该成功更新源的 URL', async () => {
      await configManager.updateSource('test-source', { baseUrl: 'https://updated.test.com/v1' });

      const savedConfig = JSON.parse((fs.writeFileSync as jest.Mock).mock.calls[0][1]);
      expect(savedConfig.sources[0].baseUrl).toBe('https://updated.test.com/v1');
    });

    it('应该成功更新源的 API Key', async () => {
      await configManager.updateSource('test-source', { apiKey: 'updated-key' });

      const savedConfig = JSON.parse((fs.writeFileSync as jest.Mock).mock.calls[0][1]);
      expect(savedConfig.sources[0].apiKeys[0]).toBe('updated-key');
    });

    it('更新不存在的源时应该抛出错误', async () => {
      await expect(configManager.updateSource('non-existent', { name: 'test' })).rejects.toThrow('源不存在');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('deleteSource()', () => {
    beforeEach(async () => {
      const multiSourceConfig = {
        ...mockConfig,
        sources: [
          ...mockConfig.sources,
          {
            id: 'other-source',
            name: '其他源',
            baseUrl: 'https://other.test.com/v1',
            apiKeys: ['other-key'],
          },
        ],
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(multiSourceConfig));
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
      await configManager.load();
    });

    it('应该成功删除非当前源', async () => {
      await configManager.deleteSource('other-source');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedConfig = JSON.parse((fs.writeFileSync as jest.Mock).mock.calls[0][1]);
      expect(savedConfig.sources).toHaveLength(1);
      expect(savedConfig.sources[0].id).toBe('test-source');
    });

    it('删除当前使用的源时应该抛出错误', async () => {
      await expect(configManager.deleteSource('test-source')).rejects.toThrow('无法删除当前使用的源');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('getSource()', () => {
    beforeEach(async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
      await configManager.load();
    });

    it('应该返回指定源的详情', () => {
      const source = configManager.getSource('test-source');

      expect(source).toBeTruthy();
      expect(source!.id).toBe('test-source');
      expect(source!.name).toBe('测试源');
      expect(source!.baseUrl).toBe('https://api.test.com/v1');
      expect(source!.apiKeys).toEqual(['test-key-123']);
    });

    it('获取不存在的源时应该返回 null', () => {
      const source = configManager.getSource('non-existent');
      expect(source).toBeNull();
    });

    it('配置未加载时应该返回 null', () => {
      const newManager = new ConfigManager(testServerDir);
      const source = newManager.getSource('test-source');
      expect(source).toBeNull();
    });
  });
});
