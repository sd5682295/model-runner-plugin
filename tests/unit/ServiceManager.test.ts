import { ServiceManager } from '../../src/ServiceManager';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('child_process');
jest.mock('fs');

describe('ServiceManager - Unit Tests', () => {
  let serviceManager: ServiceManager;

  beforeEach(() => {
    jest.clearAllMocks();
    serviceManager = new ServiceManager();
  });

  describe('getServices()', () => {
    it('应该返回所有注册的服务', () => {
      const services = serviceManager.getServices();

      expect(services).toHaveLength(2);
      expect(services[0].name).toBe('model-runner');
      expect(services[1].name).toBe('search-relay');
    });

    it('返回的服务应该包含完整的配置信息', () => {
      const services = serviceManager.getServices();
      const modelRunner = services.find(s => s.name === 'model-runner');

      expect(modelRunner).toBeDefined();
      expect(modelRunner!.displayName).toBe('Model Runner');
      expect(modelRunner!.description).toBe('AI 模型代理服务器');
      expect(modelRunner!.port).toBe(4000);
      expect(modelRunner!.command).toBe('node');
      expect(modelRunner!.configFile).toBe('config.json');
    });
  });

  describe('getServiceConfig()', () => {
    it('应该返回指定服务的配置', () => {
      const config = serviceManager.getServiceConfig('model-runner');

      expect(config).toBeDefined();
      expect(config!.name).toBe('model-runner');
      expect(config!.port).toBe(4000);
    });

    it('不存在的服务应该返回 undefined', () => {
      const config = serviceManager.getServiceConfig('non-existent');

      expect(config).toBeUndefined();
    });
  });

  describe('startService()', () => {
    it('应该使用正确的参数启动进程', async () => {
      const mockProcess = {
        unref: jest.fn(),
        kill: jest.fn(),
      } as any;

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      await serviceManager.startService('model-runner');

      expect(spawn).toHaveBeenCalledWith(
        'node',
        ['server.js'],
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
        })
      );
      expect(mockProcess.unref).toHaveBeenCalled();
    });

    it('服务不存在时应该抛出错误', async () => {
      await expect(serviceManager.startService('non-existent'))
        .rejects.toThrow('服务不存在');
    });

    it('服务已在运行时应该抛出错误', async () => {
      const mockProcess = {
        unref: jest.fn(),
        kill: jest.fn(),
      } as any;

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      await serviceManager.startService('model-runner');

      await expect(serviceManager.startService('model-runner'))
        .rejects.toThrow('服务已在运行');
    });
  });

  describe('checkServiceStatus()', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('健康检查成功时应该返回 running', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
      });

      const status = await serviceManager.checkServiceStatus('model-runner');

      expect(status).toBe('running');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/health',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('健康检查失败时应该返回 stopped', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const status = await serviceManager.checkServiceStatus('model-runner');

      expect(status).toBe('stopped');
    });

    it('HTTP 状态码非 ok 时应该返回 stopped', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const status = await serviceManager.checkServiceStatus('model-runner');

      expect(status).toBe('stopped');
    });

    it('没有 healthCheckUrl 的服务应该返回 unknown', async () => {
      // 创建一个没有 healthCheckUrl 的服务
      const status = await serviceManager.checkServiceStatus('non-existent');

      expect(status).toBe('unknown');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('readServiceConfig()', () => {
    it('应该读取并解析 JSON 配置文件', async () => {
      const mockConfig = {
        sources: [{ id: 'test', name: 'Test Source' }],
        activeSourceId: 'test',
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      const config = await serviceManager.readServiceConfig('model-runner');

      expect(config).toEqual(mockConfig);
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('应该读取并解析 .env 配置文件', async () => {
      const mockEnv = `TAVILY_API_KEY=test-key
RELAY_PORT=18795
SEARCH_PROVIDER=tavily`;

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(mockEnv);

      const config = await serviceManager.readServiceConfig('search-relay');

      expect(config).toEqual({
        TAVILY_API_KEY: 'test-key',
        RELAY_PORT: '18795',
        SEARCH_PROVIDER: 'tavily',
      });
    });

    it('配置文件不存在时应该抛出错误', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(serviceManager.readServiceConfig('model-runner'))
        .rejects.toThrow('配置文件不存在');
    });

    it('服务没有配置文件时应该抛出错误', async () => {
      await expect(serviceManager.readServiceConfig('non-existent'))
        .rejects.toThrow('配置文件不存在');
    });
  });

  describe('saveServiceConfig()', () => {
    it('应该保存 JSON 配置文件', async () => {
      const config = {
        sources: [{ id: 'test' }],
        activeSourceId: 'test',
      };

      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      await serviceManager.saveServiceConfig('model-runner', config);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(config, null, 2),
        'utf-8'
      );
    });

    it('应该保存 .env 配置文件', async () => {
      const config = {
        TAVILY_API_KEY: 'test-key',
        RELAY_PORT: '18795',
      };

      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      await serviceManager.saveServiceConfig('search-relay', config);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        'TAVILY_API_KEY=test-key\nRELAY_PORT=18795',
        'utf-8'
      );
    });
  });

  describe('stopService()', () => {
    it('应该停止正在运行的服务', async () => {
      const mockProcess = {
        unref: jest.fn(),
        kill: jest.fn(),
      } as any;

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      // 先启动
      await serviceManager.startService('model-runner');

      // Mock killPort 以避免真实的进程操作
      const originalKillPort = (serviceManager as any).killPort;
      (serviceManager as any).killPort = jest.fn().mockResolvedValue(undefined);

      // 再停止
      await serviceManager.stopService('model-runner');

      expect(mockProcess.kill).toHaveBeenCalled();

      // 恢复
      (serviceManager as any).killPort = originalKillPort;
    }, 10000);

    it('服务不存在时应该抛出错误', async () => {
      await expect(serviceManager.stopService('non-existent'))
        .rejects.toThrow('服务不存在');
    });
  });
});
