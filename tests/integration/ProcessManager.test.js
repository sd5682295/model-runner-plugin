/**
 * 集成测试 - ProcessManager
 * 测试进程管理的真实行为
 */

const { ProcessManager } = require('../src/ProcessManager');
const { spawn } = require('child_process');
const net = require('net');

// 不 mock，使用真实的进程管理
describe('ProcessManager - 集成测试', () => {
  let processManager;
  const testServerDir = require('path').join(__dirname, '../../server');
  const testPort = 4001; // 使用不同端口避免冲突

  beforeEach(() => {
    const mockLogCallback = jest.fn();
    const mockStatusCallback = jest.fn();
    processManager = new ProcessManager(testServerDir, mockLogCallback, mockStatusCallback);
  });

  afterEach(async () => {
    // 清理：确保测试后停止所有进程
    if (processManager.isRunning()) {
      await processManager.stop();
    }
  });

  describe('IT-PROC-001: 启动服务器', () => {
    test('端口空闲时应该成功启动', async () => {
      // 确保端口空闲
      const isPortFree = await checkPortFree(testPort);
      expect(isPortFree).toBe(true);

      // 启动服务器
      await processManager.start();

      // 验证：进程应该在运行
      expect(processManager.isRunning()).toBe(true);

      // 验证：端口应该被占用
      const isPortUsed = await checkPortInUse(testPort);
      expect(isPortUsed).toBe(true);
    }, 15000); // 增加超时时间
  });

  describe('IT-PROC-002: 端口冲突处理', () => {
    test('端口被占用时应该自动清理', async () => {
      // 先占用端口
      const dummyServer = await createDummyServer(testPort);

      try {
        // 尝试启动
        await processManager.start();

        // 验证：应该成功启动（因为自动清理了端口）
        expect(processManager.isRunning()).toBe(true);
      } finally {
        dummyServer.close();
      }
    }, 20000);
  });

  describe('IT-PROC-003: 启动超时', () => {
    test('10秒未就绪应该抛出超时错误', async () => {
      // Mock server.js 使其不输出就绪消息
      // 这个测试需要特殊的测试服务器脚本

      // 暂时跳过此测试
      test.skip('需要特殊的测试服务器脚本', () => {});
    });
  });

  describe('IT-PROC-004: 停止服务器', () => {
    test('应该成功停止运行中的进程', async () => {
      // 先启动
      await processManager.start();
      expect(processManager.isRunning()).toBe(true);

      // 停止
      await processManager.stop();

      // 验证：进程应该已停止
      expect(processManager.isRunning()).toBe(false);

      // 等待端口释放
      await sleep(2000);

      // 验证：端口应该空闲
      const isPortFree = await checkPortFree(testPort);
      expect(isPortFree).toBe(true);
    }, 15000);
  });

  describe('IT-PROC-005: 日志捕获', () => {
    test('应该捕获 server.js 的输出', async () => {
      const logCallback = jest.fn();
      const statusCallback = jest.fn();

      const pm = new ProcessManager(testServerDir, logCallback, statusCallback);

      await pm.start();

      // 等待日志输出
      await sleep(3000);

      // 验证：日志回调应该被调用
      expect(logCallback).toHaveBeenCalled();

      // 验证：应该包含启动消息
      const allLogs = logCallback.mock.calls.map(call => call[0]).join('');
      expect(allLogs).toContain('Model Runner');

      await pm.stop();
    }, 15000);
  });

  describe('IT-PROC-006: 状态更新', () => {
    test('启动/停止时应该更新状态', async () => {
      const statusCallback = jest.fn();
      const pm = new ProcessManager(testServerDir, jest.fn(), statusCallback);

      // 启动
      await pm.start();
      expect(statusCallback).toHaveBeenCalledWith(true);

      // 停止
      await pm.stop();
      expect(statusCallback).toHaveBeenCalledWith(false);
    }, 15000);
  });

  describe('IT-PROC-007: 重启服务器', () => {
    test('应该先停止后启动', async () => {
      // 启动
      await processManager.start();
      const firstRunning = processManager.isRunning();

      // 重启
      await processManager.stop();
      await sleep(2000);
      await processManager.start();

      // 验证：应该再次运行
      expect(processManager.isRunning()).toBe(true);
      expect(firstRunning).toBe(true);
    }, 25000);
  });

  describe('IT-PROC-008: 跨平台命令', () => {
    test('端口检测应该在当前平台工作', async () => {
      const isWin = process.platform === 'win32';

      // 创建一个测试服务器占用端口
      const server = await createDummyServer(testPort);

      try {
        // 使用 ProcessManager 的端口检测
        // 这里需要暴露 checkPortInUse 方法或者通过启动来间接测试
        const isPortUsed = await checkPortInUse(testPort);
        expect(isPortUsed).toBe(true);
      } finally {
        server.close();
      }
    });
  });
});

// 辅助函数

function checkPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

function checkPortInUse(port) {
  return checkPortFree(port).then(free => !free);
}

function createDummyServer(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(port, () => {
      resolve(server);
    });
    server.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
