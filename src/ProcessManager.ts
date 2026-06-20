import { Notice } from 'obsidian';
import { ChildProcess, spawn, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { SERVER_READY_PATTERNS } from './constants';

export class ProcessManager {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;
  private logBuffer: string[] = [];
  private restartAttempts: number = 0;

  constructor(
    private serverDir: string,
    private onLog: (msg: string, level: 'INFO' | 'WARN' | 'ERROR') => void,
    private onStatusChange: (running: boolean) => void
  ) {}

  async start(): Promise<boolean> {
    console.log('[ProcessManager] 尝试启动服务器...');
    if (this.isRunning) {
      console.warn('[ProcessManager] 服务器已在运行');
      new Notice('⚠️ 服务器已在运行');
      return false;
    }

    // 检查端口是否被占用
    console.log('[ProcessManager] 检查端口 4000 是否被占用...');
    const portInUse = await this.checkPortInUse();
    console.log('[ProcessManager] 端口占用检查结果:', portInUse);

    if (portInUse) {
      const msg = '端口 4000 已被占用，正在尝试停止旧进程...';
      this.onLog(msg, 'WARN');
      new Notice('⚠️ ' + msg);

      // 尝试自动停止占用端口的进程
      try {
        console.log('[ProcessManager] 开始清理端口 4000...');
        await this.killPort(4000);
        this.onLog('已停止占用端口的旧进程', 'INFO');
        new Notice('✅ 已停止旧进程，正在启动...');
        // 等待一小段时间确保端口释放
        console.log('[ProcessManager] 等待端口释放...');
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        const errorMsg = `无法停止旧进程: ${error}`;
        console.error('[ProcessManager]', errorMsg, error);
        this.onLog(errorMsg, 'ERROR');
        new Notice('❌ ' + errorMsg + '\n请手动停止占用端口的进程');
        return false;
      }
    }

    const serverPath = path.join(this.serverDir, 'server.js');

    if (!fs.existsSync(serverPath)) {
      this.onLog(`server.js 不存在: ${serverPath}`, 'ERROR');
      new Notice('❌ 找不到 server.js 文件');
      return false;
    }

    this.onLog('正在启动服务器...', 'INFO');
    this.onLog(`服务器路径: ${serverPath}`, 'INFO');

    return new Promise((resolve) => {
      this.process = spawn('node', [serverPath], {
        cwd: this.serverDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      let startupTimer: NodeJS.Timeout;
      let resolved = false;

      const onStartupSuccess = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(startupTimer);
        this.isRunning = true;
        this.onStatusChange(true);
        this.onLog('服务器启动成功', 'INFO');
        new Notice('✅ Model Runner 已启动');
        this.restartAttempts = 0;
        resolve(true);
      };

      const onStartupFailure = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(startupTimer);
        this.onLog('服务器启动超时', 'ERROR');
        new Notice('❌ 服务器启动失败');
        this.cleanup();
        resolve(false);
      };

      // 10秒超时
      startupTimer = setTimeout(onStartupFailure, 10000);

      this.process.stdout?.on('data', (data) => {
        const msg = data.toString();
        this.onLog(msg, 'INFO');
        this.logBuffer.push(msg);

        // 检测启动成功标志
        if (SERVER_READY_PATTERNS.some(pattern => pattern.test(msg))) {
          onStartupSuccess();
        }
      });

      this.process.stderr?.on('data', (data) => {
        const msg = data.toString();
        this.onLog(msg, 'ERROR');
        this.logBuffer.push(`[ERROR] ${msg}`);
      });

      this.process.on('close', (code) => {
        this.isRunning = false;
        this.onStatusChange(false);
        this.onLog(`进程退出，代码 ${code}`, code === 0 ? 'INFO' : 'ERROR');

        if (code !== 0 && code !== null) {
          this.onLog(`服务器异常退出`, 'ERROR');
        }

        this.cleanup();
      });

      this.process.on('error', (err) => {
        this.onLog(`进程错误: ${err.message}`, 'ERROR');
        new Notice('❌ 启动失败: ' + err.message);
        onStartupFailure();
      });
    });
  }

  async stop(): Promise<void> {
    this.onLog('正在停止服务器...', 'INFO');
    console.log('[ProcessManager] 开始停止流程');

    // 直接使用 killPort 查找并停止真实进程
    // 不依赖 this.process.pid（可能已经过期）
    try {
      await this.killPort(4000);
      console.log('[ProcessManager] ✅ 端口已清理');
    } catch (error) {
      console.log('[ProcessManager] 端口清理失败或无需清理:', error);
    }

    this.cleanup();
    new Notice('🛑 Model Runner 已停止');
  }

  private async killPort(port: number): Promise<void> {
    console.log(`[ProcessManager] 尝试清理端口 ${port}`);
    return new Promise((resolve, reject) => {
      if (process.platform === 'win32') {
        // Windows: 查找并杀死占用端口的进程
        const cmd = `netstat -ano | findstr :${port}`;
        console.log(`[ProcessManager] 执行命令: ${cmd}`);

        exec(cmd, (err, stdout) => {
          console.log(`[ProcessManager] netstat 输出:`, stdout);

          if (err || !stdout) {
            const errorMsg = '未找到占用端口的进程';
            console.error(`[ProcessManager] ${errorMsg}`, err);
            reject(new Error(errorMsg));
            return;
          }

          // 提取 PID（最后一列）
          const lines = stdout.trim().split('\n');
          const pids = new Set<string>();

          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            const state = parts[parts.length - 2]; // 获取连接状态

            console.log(`[ProcessManager] 解析行: "${line}" -> PID: ${pid}, 状态: ${state}`);

            // 忽略 TIME_WAIT 状态的连接（这些是已关闭的连接）
            if (state === 'TIME_WAIT') {
              console.log(`[ProcessManager] 忽略 TIME_WAIT 连接`);
              continue;
            }

            if (pid && pid !== '0' && /^\d+$/.test(pid)) {
              pids.add(pid);
            }
          }

          console.log(`[ProcessManager] 找到 PIDs:`, Array.from(pids));

          if (pids.size === 0) {
            const errorMsg = '未找到有效的进程ID';
            console.error(`[ProcessManager] ${errorMsg}`);
            reject(new Error(errorMsg));
            return;
          }

          // 杀死所有占用端口的进程
          const killPromises = Array.from(pids).map(pid => {
            return new Promise<void>((res, rej) => {
              const killCmd = `taskkill /PID ${pid} /F`;
              console.log(`[ProcessManager] 执行: ${killCmd}`);
              exec(killCmd, (error) => {
                if (error) {
                  console.error(`[ProcessManager] 停止进程 ${pid} 失败:`, error);
                  rej(error);
                } else {
                  console.log(`[ProcessManager] ✅ 已停止进程 ${pid}`);
                  res();
                }
              });
            });
          });

          Promise.all(killPromises)
            .then(() => {
              console.log(`[ProcessManager] ✅ 成功清理端口 ${port}`);
              resolve();
            })
            .catch((error) => {
              console.error(`[ProcessManager] ❌ 清理端口失败:`, error);
              reject(error);
            });
        });
      } else {
        // Unix/Linux/Mac: 使用 lsof
        exec(`lsof -ti:${port}`, (err, stdout) => {
          if (err || !stdout) {
            reject(new Error('未找到占用端口的进程'));
            return;
          }

          const pids = stdout.trim().split('\n');
          const killPromises = pids.map(pid => {
            return new Promise<void>((res, rej) => {
              exec(`kill -9 ${pid}`, (error) => {
                if (error) {
                  rej(error);
                } else {
                  res();
                }
              });
            });
          });

          Promise.all(killPromises)
            .then(() => resolve())
            .catch(reject);
        });
      }
    });
  }

  private killPortByCommand(port: number): void {
    this.killPort(port)
      .then(() => {
        this.onLog('通过端口停止进程成功', 'INFO');
      })
      .catch((error) => {
        this.onLog(`通过端口停止失败: ${error}`, 'ERROR');
      });
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getLogs(): string[] {
    return this.logBuffer;
  }

  clearLogs(): void {
    this.logBuffer = [];
  }

  private cleanup(): void {
    this.process = null;
    this.isRunning = false;
  }

  private async checkPortInUse(): Promise<boolean> {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      const command = process.platform === 'win32'
        ? 'netstat -ano | findstr :4000'
        : 'lsof -i :4000';

      exec(command, (error: any, stdout: string) => {
        if (!stdout || stdout.trim().length === 0) {
          resolve(false);
          return;
        }

        // 检查是否所有连接都是 TIME_WAIT 状态
        const lines = stdout.trim().split('\n');
        const hasActiveConnection = lines.some(line => {
          // TIME_WAIT 状态的连接不算占用
          return line.includes(':4000') && !line.includes('TIME_WAIT');
        });

        resolve(hasActiveConnection);
      });
    });
  }
}
