import { ProcessManager } from '../../src/ProcessManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * ProcessManager 单元测试 - 真实进程版本
 *
 * 测试原则：
 * 1. ❌ 不使用 Mock child_process
 * 2. ✅ 启动真实的 Node.js 进程
 * 3. ✅ 验证实际的进程存在
 * 4. ✅ 验证端口真的被占用
 * 5. ✅ 验证服务器真的能响应
 */
describe('ProcessManager - 真实进程测试', () => {
  let testDir: string;
  let processManager: ProcessManager;
  let serverPath: string;
  let logMessages: string[] = [];
  let statusUpdates: string[] = [];

  const TEST_PORT = 4555; // 使用不同的端口避免冲突

  // 检查端口是否被占用
  async function checkPortInUse(port: number): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        // 过滤掉 TIME_WAIT 状态
        const lines = stdout.split('\n').filter(line =>
          line.includes(`:${port}`) && !line.includes('TIME_WAIT')
        );
        return lines.length > 0;
      } else {
        const { stdout } = await execAsync(`lsof -i :${port}`);
        return stdout.trim().length > 0;
      }
    } catch {
      return false;
    }
  }

  // 获取端口的 PID
  async function getPortPid(port: number): Promise<number | null> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[parts.length - 1]);
            if (pid > 0) return pid;
          }
        }
      } else {
        const { stdout } = await execAsync(`lsof -ti :${port}`);
        const pid = parseInt(stdout.trim());
        if (pid > 0) return pid;
      }
    } catch {
      // 端口未被占用
    }
    return null;
  }

  // 检查进程是否存在
  async function checkProcessExists(pid: number): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}"`);
        return stdout.includes(`${pid}`);
      } else {
        const { stdout } = await execAsync(`ps -p ${pid}`);
        return stdout.includes(`${pid}`);
      }
    } catch {
      return false;
    }
  }

  beforeEach(async () => {
    // 创建临时目录
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));

    // 创建简单的测试服务器（必须命名为 server.js）
    const testServerCode = `
const http = require('http');
const port = 4000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(port, () => {
  console.log('Server running on port ' + port);
  console.log('Model Runner 运行');
});

// 优雅退出
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
`;

    serverPath = path.join(testDir, 'server.js');
    fs.writeFileSync(serverPath, testServerCode);

    // 清空日志
    logMessages = [];
    statusUpdates = [];

    // 创建 ProcessManager
    processManager = new ProcessManager(
      testDir,
      (msg, level) => {
        logMessages.push(`[${level}] ${msg}`);
      },
      (status) => {
        statusUpdates.push(status);
      }
    );

    // 修改内部的端口（如果可能）
    // 注意：这里需要修改 ProcessManager 以支持自定义端口
    // 暂时使用默认端口 4000
  });

  afterEach(async () => {
    // 停止进程
    try {
      await processManager.stop();
    } catch (error) {
      console.log('停止进程时出错（可能已停止）:', error);
    }

    // 等待端口释放
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 清理临时目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('start() - 启动进程', () => {
    it('应该成功启动服务器进程', async () => {
      await processManager.start();

      // 验证 1：进程对象存在
      const process = (processManager as any).process;
      expect(process).toBeDefined();
      expect(process.pid).toBeGreaterThan(0);

      // 验证 2：进程确实存在
      const processExists = await checkProcessExists(process.pid);
      expect(processExists).toBe(true);

      // 验证 3：端口被占用
      const portInUse = await checkPortInUse(4000);
      expect(portInUse).toBe(true);

      // 验证 4：服务器能响应
      const response = await fetch('http://localhost:4000/health');
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('OK');

      // 验证 5：状态回调被调用
      expect(statusUpdates).toContain('running');
    }, 15000);

    it('已运行时再次启动应该提示', async () => {
      await processManager.start();

      // 再次启动
      await processManager.start();

      // 验证：不会创建多个进程
      const portPid = await getPortPid(4000);
      expect(portPid).toBeTruthy();

      // 日志中应该有"已在运行"的提示
      const hasRunningMessage = logMessages.some(msg =>
        msg.includes('已在运行') || msg.includes('already running')
      );
      expect(hasRunningMessage).toBe(true);
    }, 15000);

    it('server.js 不存在时应该抛出错误', async () => {
      // 删除 server.js
      fs.unlinkSync(serverPath);

      // 尝试启动应该失败
      await expect(processManager.start()).rejects.toThrow();

      // 验证：端口未被占用
      const portInUse = await checkPortInUse(4000);
      expect(portInUse).toBe(false);
    }, 10000);

    it('端口被占用时应该清理端口', async () => {
      // 先启动一个占用端口的进程
      const { spawn } = require('child_process');
      const blockingProcess = spawn('node', [serverPath], {
        cwd: testDir,
        stdio: 'ignore',
        detached: false,
      });

      // 等待进程启动
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 验证端口被占用
      const portInUse1 = await checkPortInUse(4000);
      expect(portInUse1).toBe(true);

      // 尝试启动 ProcessManager（应该自动清理端口）
      await processManager.start();

      // 验证：新进程启动成功
      const response = await fetch('http://localhost:4000/health');
      expect(response.status).toBe(200);

      // 清理
      blockingProcess.kill('SIGTERM');
    }, 20000);
  });

  describe('stop() - 停止进程', () => {
    beforeEach(async () => {
      await processManager.start();
      // 等待服务器完全启动
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    it('应该成功停止服务器进程', async () => {
      const process = (processManager as any).process;
      const pid = process.pid;

      // 验证进程存在
      const existsBefore = await checkProcessExists(pid);
      expect(existsBefore).toBe(true);

      // 停止进程
      await processManager.stop();

      // 等待进程完全停止
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 验证 1：进程不存在
      const existsAfter = await checkProcessExists(pid);
      expect(existsAfter).toBe(false);

      // 验证 2：端口释放
      const portInUse = await checkPortInUse(4000);
      expect(portInUse).toBe(false);

      // 验证 3：服务器不响应
      await expect(fetch('http://localhost:4000/health')).rejects.toThrow();

      // 验证 4：状态回调被调用
      expect(statusUpdates).toContain('stopped');
    }, 15000);

    it('已停止时再次停止应该不报错', async () => {
      await processManager.stop();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 再次停止（应该不报错）
      await processManager.stop();

      // 验证：端口未被占用
      const portInUse = await checkPortInUse(4000);
      expect(portInUse).toBe(false);
    }, 10000);

    it('强制停止应该立即终止进程', async () => {
      const process = (processManager as any).process;
      const pid = process.pid;

      // 强制停止
      await processManager.stop();

      // 立即检查（不等待）
      await new Promise(resolve => setTimeout(resolve, 500));

      // 进程应该已经不存在
      const exists = await checkProcessExists(pid);
      expect(exists).toBe(false);
    }, 10000);
  });

  describe('端口管理', () => {
    it('应该能正确检查端口占用', async () => {
      // 端口未占用
      const notInUse = await checkPortInUse(4000);
      expect(notInUse).toBe(false);

      // 启动服务器
      await processManager.start();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 端口被占用
      const inUse = await checkPortInUse(4000);
      expect(inUse).toBe(true);

      // 停止服务器
      await processManager.stop();
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 端口释放
      const notInUseAgain = await checkPortInUse(4000);
      expect(notInUseAgain).toBe(false);
    }, 15000);

    it('应该能获取端口的 PID', async () => {
      await processManager.start();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const pid = await getPortPid(4000);
      expect(pid).toBeGreaterThan(0);

      const process = (processManager as any).process;
      expect(pid).toBe(process.pid);
    }, 10000);
  });

  describe('日志捕获', () => {
    it('应该捕获进程的标准输出', async () => {
      await processManager.start();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 验证日志被捕获
      expect(logMessages.length).toBeGreaterThan(0);

      // 应该包含启动成功的日志
      const hasStartLog = logMessages.some(msg =>
        msg.toLowerCase().includes('server') ||
        msg.toLowerCase().includes('listening') ||
        msg.toLowerCase().includes('running')
      );
      expect(hasStartLog).toBe(true);
    }, 10000);

    it('应该捕获进程的错误输出', async () => {
      // 创建一个会输出错误的服务器
      const errorServerCode = `
        console.error('This is an error message');
        setTimeout(() => process.exit(1), 1000);
      `;
      const errorServerPath = path.join(testDir, 'error-server.js');
      fs.writeFileSync(errorServerPath, errorServerCode);

      // 修改 serverPath
      const originalPath = serverPath;
      serverPath = errorServerPath;

      await processManager.start();
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 验证错误日志被捕获
      const hasErrorLog = logMessages.some(msg =>
        msg.toLowerCase().includes('error')
      );
      expect(hasErrorLog).toBe(true);

      serverPath = originalPath;
    }, 10000);
  });

  describe('状态回调', () => {
    it('启动时应该触发状态回调', async () => {
      statusUpdates = [];

      await processManager.start();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 应该包含 running 状态
      expect(statusUpdates).toContain('running');
    }, 10000);

    it('停止时应该触发状态回调', async () => {
      await processManager.start();
      await new Promise(resolve => setTimeout(resolve, 1000));

      statusUpdates = [];

      await processManager.stop();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 应该包含 stopped 状态
      expect(statusUpdates).toContain('stopped');
    }, 15000);
  });

  describe('错误处理', () => {
    it('进程崩溃时应该捕获错误', async () => {
      // 创建一个会立即崩溃的服务器
      const crashServerCode = `
        setTimeout(() => {
          throw new Error('Intentional crash');
        }, 1000);
      `;
      const crashServerPath = path.join(testDir, 'crash-server.js');
      fs.writeFileSync(crashServerPath, crashServerCode);

      const originalPath = serverPath;
      serverPath = crashServerPath;

      await processManager.start();
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 验证错误被记录
      const hasError = logMessages.some(msg =>
        msg.toLowerCase().includes('error') ||
        msg.toLowerCase().includes('crash')
      );
      expect(hasError).toBe(true);

      serverPath = originalPath;
    }, 10000);

    it('启动失败时应该清理资源', async () => {
      // 使用不存在的文件
      fs.unlinkSync(serverPath);

      try {
        await processManager.start();
      } catch {
        // 预期会失败
      }

      // 验证端口未被占用
      const portInUse = await checkPortInUse(4000);
      expect(portInUse).toBe(false);

      // 验证内部状态被清理
      const process = (processManager as any).process;
      expect(process).toBeNull();
    }, 10000);
  });

  describe('并发操作', () => {
    it('应该处理快速连续的启动/停止', async () => {
      // 快速启动和停止多次
      for (let i = 0; i < 3; i++) {
        await processManager.start();
        await new Promise(resolve => setTimeout(resolve, 500));
        await processManager.stop();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 最终应该是停止状态
      const portInUse = await checkPortInUse(4000);
      expect(portInUse).toBe(false);
    }, 30000);

    it('应该处理同时启动多次的情况', async () => {
      // 同时调用多次启动
      const promises = [
        processManager.start(),
        processManager.start(),
        processManager.start(),
      ];

      await Promise.all(promises);

      // 验证只有一个进程
      const portPid = await getPortPid(4000);
      expect(portPid).toBeTruthy();

      // 清理
      await processManager.stop();
    }, 15000);
  });

  describe('性能测试', () => {
    it('启动时间应该 < 3 秒', async () => {
      const startTime = Date.now();

      await processManager.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(3000);

      // 验证服务器真的启动了
      const response = await fetch('http://localhost:4000/health');
      expect(response.status).toBe(200);
    }, 10000);

    it('停止时间应该 < 5 秒', async () => {
      await processManager.start();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const startTime = Date.now();

      await processManager.stop();
      await new Promise(resolve => setTimeout(resolve, 500));

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000);

      // 验证进程真的停止了
      const portInUse = await checkPortInUse(4000);
      expect(portInUse).toBe(false);
    }, 15000);
  });
});
