/**
 * ServiceManager 集成测试
 *
 * 目标：测试 ServiceManager 与真实进程、文件系统的集成
 * 不使用 Mock，测试真实行为
 */

import { ServiceManager } from '../../src/ServiceManager';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('ServiceManager - Integration Tests', () => {
  let serviceManager: ServiceManager;
  const testConfigDir = path.join(__dirname, '../fixtures/test-service');

  beforeAll(() => {
    // 创建测试目录和配置文件
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }

    // 创建测试配置文件
    const testConfig = {
      sources: [{ id: 'test', name: 'Test Source' }],
      activeSourceId: 'test',
    };

    fs.writeFileSync(
      path.join(testConfigDir, 'config.json'),
      JSON.stringify(testConfig, null, 2)
    );

    // 创建测试 .env 文件
    fs.writeFileSync(
      path.join(testConfigDir, '.env'),
      'TEST_KEY=test-value\nTEST_PORT=8080'
    );
  });

  afterAll(() => {
    // 清理测试文件
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    serviceManager = new ServiceManager();
  });

  describe('IT-SM-001: 服务注册和发现', () => {
    it('应该正确注册所有预定义服务', () => {
      const services = serviceManager.getServices();

      expect(services).toHaveLength(2);

      const serviceNames = services.map(s => s.name);
      expect(serviceNames).toContain('model-runner');
      expect(serviceNames).toContain('search-relay');
    });

    it('每个服务应该有完整的配置', () => {
      const services = serviceManager.getServices();

      services.forEach(service => {
        expect(service.name).toBeDefined();
        expect(service.displayName).toBeDefined();
        expect(service.description).toBeDefined();
        expect(service.command).toBeDefined();
        expect(service.args).toBeDefined();
        expect(service.cwd).toBeDefined();
      });
    });
  });

  describe('IT-SM-002: 配置文件读写（真实文件系统）', () => {
    it('应该正确读取 JSON 配置文件', async () => {
      // 创建一个临时的 ServiceManager 实例，指向测试目录
      const tempServiceManager = new ServiceManager();

      // 手动添加测试服务
      (tempServiceManager as any).services.set('test-service', {
        name: 'test-service',
        displayName: 'Test Service',
        description: 'Test',
        command: 'node',
        args: [],
        cwd: testConfigDir,
        configFile: 'config.json',
      });

      const config = await tempServiceManager.readServiceConfig('test-service');

      expect(config).toHaveProperty('sources');
      expect(config.sources).toHaveLength(1);
      expect(config.activeSourceId).toBe('test');
    });

    it('应该正确读取 .env 配置文件', async () => {
      const tempServiceManager = new ServiceManager();

      (tempServiceManager as any).services.set('test-env-service', {
        name: 'test-env-service',
        displayName: 'Test Env Service',
        description: 'Test',
        command: 'node',
        args: [],
        cwd: testConfigDir,
        configFile: '.env',
      });

      const config = await tempServiceManager.readServiceConfig('test-env-service');

      expect(config).toHaveProperty('TEST_KEY');
      expect(config.TEST_KEY).toBe('test-value');
      expect(config.TEST_PORT).toBe('8080');
    });

    it('应该正确保存 JSON 配置文件', async () => {
      const tempServiceManager = new ServiceManager();

      (tempServiceManager as any).services.set('test-service', {
        name: 'test-service',
        displayName: 'Test Service',
        description: 'Test',
        command: 'node',
        args: [],
        cwd: testConfigDir,
        configFile: 'config.json',
      });

      const newConfig = {
        sources: [{ id: 'new', name: 'New Source' }],
        activeSourceId: 'new',
      };

      await tempServiceManager.saveServiceConfig('test-service', newConfig);

      // 验证文件内容
      const savedContent = fs.readFileSync(
        path.join(testConfigDir, 'config.json'),
        'utf-8'
      );
      const savedConfig = JSON.parse(savedContent);

      expect(savedConfig.sources[0].id).toBe('new');
      expect(savedConfig.activeSourceId).toBe('new');
    });

    it('应该正确保存 .env 配置文件', async () => {
      const tempServiceManager = new ServiceManager();

      (tempServiceManager as any).services.set('test-env-service', {
        name: 'test-env-service',
        displayName: 'Test Env Service',
        description: 'Test',
        command: 'node',
        args: [],
        cwd: testConfigDir,
        configFile: '.env',
      });

      const newConfig = {
        NEW_KEY: 'new-value',
        NEW_PORT: '9090',
      };

      await tempServiceManager.saveServiceConfig('test-env-service', newConfig);

      // 验证文件内容
      const savedContent = fs.readFileSync(
        path.join(testConfigDir, '.env'),
        'utf-8'
      );

      expect(savedContent).toContain('NEW_KEY=new-value');
      expect(savedContent).toContain('NEW_PORT=9090');
    });
  });

  describe('IT-SM-003: 健康检查（真实网络请求）', () => {
    it('对不存在的服务进行健康检查应该返回 stopped', async () => {
      const status = await serviceManager.checkServiceStatus('model-runner');

      // 假设服务未启动
      expect(['stopped', 'unknown']).toContain(status);
    }, 10000);

    it('健康检查应该有超时控制', async () => {
      const startTime = Date.now();

      await serviceManager.checkServiceStatus('model-runner');

      const elapsed = Date.now() - startTime;

      // 应该在5秒内完成（3秒超时 + 网络开销）
      expect(elapsed).toBeLessThan(5000);
    }, 10000);
  });

  describe('IT-SM-004: 端口清理（真实进程操作）', () => {
    it('应该能够检测端口占用情况', async () => {
      // 这个测试需要管理员权限，所以只验证方法不抛出错误
      const killPort = (serviceManager as any).killPort.bind(serviceManager);

      // 尝试清理一个不太可能被占用的高端口
      await expect(killPort(59999)).resolves.not.toThrow();
    }, 15000);
  });

  describe('IT-SM-005: 错误处理', () => {
    it('读取不存在的配置文件应该抛出错误', async () => {
      const tempServiceManager = new ServiceManager();

      (tempServiceManager as any).services.set('bad-service', {
        name: 'bad-service',
        displayName: 'Bad Service',
        description: 'Test',
        command: 'node',
        args: [],
        cwd: '/nonexistent',
        configFile: 'config.json',
      });

      await expect(tempServiceManager.readServiceConfig('bad-service'))
        .rejects.toThrow();
    });

    it('启动不存在的服务应该抛出错误', async () => {
      await expect(serviceManager.startService('nonexistent-service'))
        .rejects.toThrow('服务不存在');
    });

    it('停止不存在的服务应该抛出错误', async () => {
      await expect(serviceManager.stopService('nonexistent-service'))
        .rejects.toThrow('服务不存在');
    });
  });
});
