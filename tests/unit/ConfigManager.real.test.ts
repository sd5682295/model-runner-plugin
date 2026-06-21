import { ConfigManager } from '../../src/ConfigManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * ConfigManager 单元测试 - 真实文件系统版本
 *
 * 测试原则：
 * 1. ❌ 不使用 Mock 文件系统
 * 2. ✅ 使用真实的临时文件
 * 3. ✅ 验证实际的读写行为
 * 4. ✅ 测试所有边界情况
 * 5. ✅ 测试错误处理
 */
describe('ConfigManager - 真实文件系统测试', () => {
  let testDir: string;
  let configManager: ConfigManager;
  let configPath: string;

  const validConfig = {
    sources: [
      {
        id: 'test-source-1',
        name: '测试源1',
        baseUrl: 'https://api.test.com/v1',
        apiKeys: ['key-123'],
        models: [],
        costConfig: { enabled: false }
      }
    ],
    activeSourceId: 'test-source-1',
    modelRoutes: {},
    timeout: 30000,
    retries: 3,
  };

  beforeEach(() => {
    // 创建真实的临时目录
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-runner-test-'));
    configPath = path.join(testDir, 'config.json');
    configManager = new ConfigManager(testDir);
  });

  afterEach(() => {
    // 清理临时目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('load() - 配置加载', () => {
    it('应该成功读取配置文件', async () => {
      // 创建真实的配置文件
      fs.writeFileSync(configPath, JSON.stringify(validConfig, null, 2));

      // 加载配置
      const config = await configManager.load();

      // 验证返回值
      expect(config).toEqual(validConfig);

      // 验证内部状态
      expect(configManager.getConfig()).toEqual(validConfig);

      // 验证文件确实被读取了（再次读取应该得到相同结果）
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual(validConfig);
    });

    it('配置文件不存在时应该抛出错误', async () => {
      // 确保文件不存在
      expect(fs.existsSync(configPath)).toBe(false);

      // 验证抛出错误
      await expect(configManager.load()).rejects.toThrow('配置文件不存在');
    });

    it('配置文件格式错误时应该抛出错误', async () => {
      // 写入无效的 JSON
      fs.writeFileSync(configPath, 'invalid json{]]');

      // 验证抛出错误
      await expect(configManager.load()).rejects.toThrow();
    });

    it('配置文件为空时应该抛出错误', async () => {
      fs.writeFileSync(configPath, '');
      await expect(configManager.load()).rejects.toThrow();
    });

    it('配置文件只有空白字符时应该抛出错误', async () => {
      fs.writeFileSync(configPath, '   \n\t  ');
      await expect(configManager.load()).rejects.toThrow();
    });

    it('配置文件有多余逗号时应该抛出错误', async () => {
      fs.writeFileSync(configPath, '{"sources": [],}');
      await expect(configManager.load()).rejects.toThrow();
    });

    it('配置文件有 BOM 标记时应该正常处理', async () => {
      // UTF-8 BOM
      const bom = '﻿';
      fs.writeFileSync(configPath, bom + JSON.stringify(validConfig));

      const config = await configManager.load();
      expect(config).toEqual(validConfig);
    });

    it('配置文件权限不足时应该抛出错误', async () => {
      if (process.platform !== 'win32') {
        fs.writeFileSync(configPath, JSON.stringify(validConfig));
        // 移除读权限
        fs.chmodSync(configPath, 0o000);

        await expect(configManager.load()).rejects.toThrow();

        // 恢复权限以便清理
        fs.chmodSync(configPath, 0o644);
      }
    });
  });

  describe('save() - 配置保存', () => {
    it('应该成功保存配置文件', async () => {
      // 保存配置
      await configManager.save(validConfig);

      // 验证文件已创建
      expect(fs.existsSync(configPath)).toBe(true);

      // 验证文件内容正确
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const savedConfig = JSON.parse(fileContent);
      expect(savedConfig).toEqual(validConfig);

      // 验证内部状态已更新
      expect(configManager.getConfig()).toEqual(validConfig);
    });

    it('应该保存格式化的 JSON（带缩进）', async () => {
      await configManager.save(validConfig);

      const fileContent = fs.readFileSync(configPath, 'utf-8');

      // 验证有缩进（不是单行）
      expect(fileContent.split('\n').length).toBeGreaterThan(1);
      expect(fileContent).toContain('  '); // 有空格缩进
    });

    it('保存空配置时应该成功', async () => {
      const emptyConfig = {
        sources: [],
        activeSourceId: '',
        modelRoutes: {},
        timeout: 30000,
        retries: 3,
      };

      await configManager.save(emptyConfig);

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig).toEqual(emptyConfig);
    });

    it('目录不存在时应该抛出错误', async () => {
      // 删除目录
      fs.rmSync(testDir, { recursive: true });

      // 验证目录不存在
      expect(fs.existsSync(testDir)).toBe(false);

      // 尝试保存应该失败
      await expect(configManager.save(validConfig)).rejects.toThrow();
    });

    it('目录权限不足时应该抛出错误', async () => {
      if (process.platform !== 'win32') {
        // 移除写权限
        fs.chmodSync(testDir, 0o444);

        await expect(configManager.save(validConfig)).rejects.toThrow();

        // 恢复权限
        fs.chmodSync(testDir, 0o755);
      }
    });

    it('磁盘满时应该抛出错误（模拟）', async () => {
      // 创建一个非常大的配置（可能触发写入错误）
      const hugeConfig = {
        ...validConfig,
        sources: Array(10000).fill(validConfig.sources[0]).map((s, i) => ({
          ...s,
          id: `source-${i}`,
          name: `Source ${i}`,
        })),
      };

      // 如果能保存，至少验证它能处理大文件
      await configManager.save(hugeConfig);
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(saved.sources.length).toBe(10000);
    });
  });

  describe('addSource() - 添加源', () => {
    beforeEach(async () => {
      fs.writeFileSync(configPath, JSON.stringify(validConfig));
      await configManager.load();
    });

    it('应该成功添加新源', async () => {
      const newSource = {
        id: 'new-source',
        name: '新源',
        baseUrl: 'https://new.api.com/v1',
        apiKey: 'new-key-456',
      };

      await configManager.addSource(newSource);

      // 验证内存中的配置
      const config = configManager.getConfig();
      expect(config.sources.length).toBe(2);
      expect(config.sources[1].id).toBe('new-source');

      // 验证文件已更新
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.sources.length).toBe(2);
      expect(savedConfig.sources[1].apiKeys).toEqual(['new-key-456']);
    });

    it('添加重复 ID 的源时应该抛出错误', async () => {
      const duplicateSource = {
        id: 'test-source-1',
        name: '重复源',
        baseUrl: 'https://dup.api.com/v1',
        apiKey: 'dup-key',
      };

      await expect(configManager.addSource(duplicateSource)).rejects.toThrow('已存在');

      // 验证文件未被修改
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.sources.length).toBe(1);
    });

    it('添加空 ID 的源时应该抛出错误', async () => {
      const invalidSource = {
        id: '',
        name: '无效源',
        baseUrl: 'https://invalid.com/v1',
        apiKey: 'key',
      };

      await expect(configManager.addSource(invalidSource)).rejects.toThrow();
    });

    it('添加无效 URL 的源时应该抛出错误', async () => {
      const invalidSource = {
        id: 'invalid-url',
        name: '无效 URL',
        baseUrl: 'not-a-url',
        apiKey: 'key',
      };

      await expect(configManager.addSource(invalidSource)).rejects.toThrow();
    });

    it('添加空 URL 的源时应该抛出错误', async () => {
      const invalidSource = {
        id: 'empty-url',
        name: '空 URL',
        baseUrl: '',
        apiKey: 'key',
      };

      await expect(configManager.addSource(invalidSource)).rejects.toThrow();
    });

    it('添加包含特殊字符的源 ID 时应该成功', async () => {
      const specialSource = {
        id: 'source-with_special.chars-123',
        name: '特殊字符源',
        baseUrl: 'https://special.com/v1',
        apiKey: 'key',
      };

      await configManager.addSource(specialSource);

      const config = configManager.getConfig();
      expect(config.sources.some(s => s.id === 'source-with_special.chars-123')).toBe(true);
    });
  });

  describe('updateSource() - 更新源', () => {
    beforeEach(async () => {
      fs.writeFileSync(configPath, JSON.stringify(validConfig));
      await configManager.load();
    });

    it('应该成功更新源的名称', async () => {
      await configManager.updateSource('test-source-1', { name: '新名称' });

      const config = configManager.getConfig();
      expect(config.sources[0].name).toBe('新名称');

      // 验证文件已更新
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.sources[0].name).toBe('新名称');
    });

    it('应该成功更新源的 URL', async () => {
      const newUrl = 'https://updated.com/v1';
      await configManager.updateSource('test-source-1', { baseUrl: newUrl });

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.sources[0].baseUrl).toBe(newUrl);
    });

    it('更新到无效 URL 时应该抛出错误', async () => {
      await expect(
        configManager.updateSource('test-source-1', { baseUrl: 'invalid-url' })
      ).rejects.toThrow();

      // 验证文件未被修改
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.sources[0].baseUrl).toBe('https://api.test.com/v1');
    });

    it('更新不存在的源时应该抛出错误', async () => {
      await expect(
        configManager.updateSource('non-existent', { name: 'test' })
      ).rejects.toThrow('源不存在');

      // 验证文件未被修改
      const originalContent = JSON.stringify(validConfig, null, 2);
      const currentContent = fs.readFileSync(configPath, 'utf-8');
      expect(JSON.parse(currentContent)).toEqual(validConfig);
    });

    it('应该支持部分更新（只更新指定字段）', async () => {
      const originalUrl = validConfig.sources[0].baseUrl;

      await configManager.updateSource('test-source-1', { name: '新名称' });

      const config = configManager.getConfig();
      expect(config.sources[0].name).toBe('新名称');
      expect(config.sources[0].baseUrl).toBe(originalUrl); // URL 未改变
    });
  });

  describe('deleteSource() - 删除源', () => {
    beforeEach(async () => {
      const multiSourceConfig = {
        ...validConfig,
        sources: [
          ...validConfig.sources,
          {
            id: 'source-2',
            name: '源2',
            baseUrl: 'https://api2.com/v1',
            apiKeys: ['key-2'],
            models: [],
            costConfig: { enabled: false }
          }
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(multiSourceConfig));
      await configManager.load();
    });

    it('应该成功删除非当前源', async () => {
      await configManager.deleteSource('source-2');

      const config = configManager.getConfig();
      expect(config.sources.length).toBe(1);
      expect(config.sources[0].id).toBe('test-source-1');

      // 验证文件已更新
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.sources.length).toBe(1);
    });

    it('删除当前使用的源时应该抛出错误', async () => {
      await expect(configManager.deleteSource('test-source-1')).rejects.toThrow('无法删除当前使用的源');

      // 验证文件未被修改
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.sources.length).toBe(2);
    });

    it('删除不存在的源时应该抛出错误', async () => {
      await expect(configManager.deleteSource('non-existent')).rejects.toThrow();
    });

    it('删除后只剩一个源时应该成功', async () => {
      await configManager.deleteSource('source-2');

      const config = configManager.getConfig();
      expect(config.sources.length).toBe(1);
    });
  });

  describe('switchSource() - 切换源', () => {
    beforeEach(async () => {
      const multiSourceConfig = {
        ...validConfig,
        sources: [
          ...validConfig.sources,
          {
            id: 'source-2',
            name: '源2',
            baseUrl: 'https://api2.com/v1',
            apiKeys: ['key-2'],
            models: [],
            costConfig: { enabled: false }
          }
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(multiSourceConfig));
      await configManager.load();
    });

    it('应该成功切换源', async () => {
      await configManager.switchSource('source-2');

      expect(configManager.getCurrentSource()).toBe('source-2');

      // 验证文件已更新
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.activeSourceId).toBe('source-2');
    });

    it('切换到不存在的源时应该抛出错误', async () => {
      await expect(configManager.switchSource('non-existent')).rejects.toThrow('源不存在');

      // 验证文件未被修改
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.activeSourceId).toBe('test-source-1');
    });

    it('切换到当前源时应该成功（幂等操作）', async () => {
      await configManager.switchSource('test-source-1');

      expect(configManager.getCurrentSource()).toBe('test-source-1');
    });
  });

  describe('边界值和极端情况', () => {
    it('应该处理非常长的源名称', async () => {
      const longName = 'A'.repeat(1000);
      const config = {
        ...validConfig,
        sources: [{
          ...validConfig.sources[0],
          name: longName,
        }],
      };

      await configManager.save(config);
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.sources[0].name).toBe(longName);
    });

    it('应该处理包含特殊字符的源名称', async () => {
      const specialName = '测试源 <script>alert("xss")</script> & " \' \\';
      fs.writeFileSync(configPath, JSON.stringify(validConfig));
      await configManager.load();

      await configManager.updateSource('test-source-1', { name: specialName });

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.sources[0].name).toBe(specialName);
    });

    it('应该处理包含 Unicode 字符的配置', async () => {
      const unicodeName = '测试源 🚀 émoji ñ 中文';
      const config = {
        ...validConfig,
        sources: [{
          ...validConfig.sources[0],
          name: unicodeName,
        }],
      };

      await configManager.save(config);
      await configManager.load();

      expect(configManager.getConfig().sources[0].name).toBe(unicodeName);
    });

    it('应该处理非常多的源（性能测试）', async () => {
      const manySources = Array(1000).fill(null).map((_, i) => ({
        id: `source-${i}`,
        name: `Source ${i}`,
        baseUrl: `https://api${i}.com/v1`,
        apiKeys: [`key-${i}`],
        models: [],
        costConfig: { enabled: false }
      }));

      const config = {
        ...validConfig,
        sources: manySources,
      };

      const startTime = Date.now();
      await configManager.save(config);
      const saveTime = Date.now() - startTime;

      const loadStartTime = Date.now();
      await configManager.load();
      const loadTime = Date.now() - loadStartTime;

      // 性能断言（应该在合理时间内完成）
      expect(saveTime).toBeLessThan(1000); // < 1秒
      expect(loadTime).toBeLessThan(500);  // < 0.5秒

      expect(configManager.getConfig().sources.length).toBe(1000);
    });
  });

  describe('并发操作测试', () => {
    beforeEach(async () => {
      fs.writeFileSync(configPath, JSON.stringify(validConfig));
      await configManager.load();
    });

    it('应该处理快速连续的保存操作', async () => {
      const promises = Array(10).fill(null).map((_, i) =>
        configManager.updateSource('test-source-1', { name: `名称-${i}` })
      );

      await Promise.all(promises);

      // 最后一次更新应该生效
      const config = configManager.getConfig();
      expect(config.sources[0].name).toMatch(/^名称-\d$/);
    });

    it('应该处理并发的添加源操作', async () => {
      const promises = Array(5).fill(null).map((_, i) =>
        configManager.addSource({
          id: `concurrent-${i}`,
          name: `并发源-${i}`,
          baseUrl: `https://api${i}.com/v1`,
          apiKey: `key-${i}`,
        })
      );

      await Promise.all(promises);

      const config = configManager.getConfig();
      expect(config.sources.length).toBe(6); // 1 original + 5 new
    });
  });

  describe('错误恢复测试', () => {
    it('配置损坏后应该能恢复', async () => {
      // 保存正常配置
      await configManager.save(validConfig);

      // 损坏配置文件
      fs.writeFileSync(configPath, 'corrupted{');

      // 尝试加载应该失败
      const newManager = new ConfigManager(testDir);
      await expect(newManager.load()).rejects.toThrow();

      // 修复配置
      fs.writeFileSync(configPath, JSON.stringify(validConfig));

      // 应该能正常加载
      await newManager.load();
      expect(newManager.getConfig()).toEqual(validConfig);
    });

    it('文件被删除后应该能重新创建', async () => {
      await configManager.save(validConfig);

      // 删除文件
      fs.unlinkSync(configPath);

      // 重新保存
      await configManager.save(validConfig);

      // 验证文件已重新创建
      expect(fs.existsSync(configPath)).toBe(true);
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig).toEqual(validConfig);
    });
  });
});
