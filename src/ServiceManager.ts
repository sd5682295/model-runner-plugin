import { Notice } from 'obsidian';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface ServiceConfig {
  name: string;
  displayName: string;
  description: string;
  command: string;
  args: string[];
  cwd: string;
  port?: number;
  healthCheckUrl?: string;
  configFile?: string;
}

export class ServiceManager {
  private processes: Map<string, ChildProcess> = new Map();
  private services: Map<string, ServiceConfig> = new Map();

  constructor() {
    console.log('[ServiceManager] 构造函数初始化');
    console.log('[ServiceManager] process.env.PATH:', process.env.PATH);
    console.log('[ServiceManager] PATH 是否包含 nodejs:',
      (process.env.PATH || '').toLowerCase().includes('nodejs'));
    this.initializeServices();
  }

  private initializeServices(): void {
    // 直接使用 'node' 命令，与 ProcessManager 完全一致
    const nodePath = 'node';
    console.log('[ServiceManager] 使用 node 命令（与 ProcessManager 完全一致）');

    // Model Runner
    this.services.set('model-runner', {
      name: 'model-runner',
      displayName: 'Model Runner',
      description: 'AI 模型代理服务器',
      command: nodePath,
      args: ['server.js'],
      cwd: path.join(process.env.USERPROFILE || '', '.obsidian/plugins/model-runner/server'),
      port: 4000,
      healthCheckUrl: 'http://localhost:4000/health',
      configFile: 'config.json',
    });

    // Search Relay
    this.services.set('search-relay', {
      name: 'search-relay',
      displayName: '本地搜索中转服务',
      description: '本地搜索中转服务',
      command: nodePath,
      args: ['src/server.js'],
      cwd: 'D:\\work\\search-relay',
      port: 18795,
      healthCheckUrl: 'http://localhost:18795/health',
      configFile: '.env',
    });
  }

  /**
   * 启动服务
   */
  async startService(serviceName: string): Promise<void> {
    const config = this.services.get(serviceName);
    if (!config) {
      throw new Error(`服务不存在: ${serviceName}`);
    }

    if (this.processes.has(serviceName)) {
      throw new Error(`服务已在运行: ${config.displayName}`);
    }

    try {
      console.log('[ServiceManager] 启动服务:', {
        command: config.command,
        args: config.args,
        cwd: config.cwd,
      });

      // 完全模仿 ProcessManager 的 spawn 选项
      // 移除 env, windowsHide，使用与 ProcessManager 一致的 stdio
      const spawnOptions: any = {
        cwd: config.cwd,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'], // 与 ProcessManager 完全一致
      };

      console.log('[ServiceManager] spawn 选项:', spawnOptions);

      console.log('[ServiceManager] 环境变量 PATH:', process.env.PATH);

      const childProcess = spawn(config.command, config.args, spawnOptions);

      childProcess.on('error', (error: any) => {
        console.error('[ServiceManager] 进程启动错误:', error);
        console.error('[ServiceManager] 命令:', config.command);
        console.error('[ServiceManager] 参数:', config.args);
        throw error;
      });

      childProcess.on('spawn', () => {
        console.log('[ServiceManager] ✅ 进程已 spawn:', childProcess.pid);
      });

      this.processes.set(serviceName, childProcess);

      console.log('[ServiceManager] ✅ 服务启动成功:', serviceName);
      new Notice(`✅ ${config.displayName} 启动成功`);
    } catch (error) {
      throw new Error(`启动失败: ${error}`);
    }
  }

  /**
   * 停止服务
   */
  async stopService(serviceName: string): Promise<void> {
    const config = this.services.get(serviceName);
    if (!config) {
      throw new Error(`服务不存在: ${serviceName}`);
    }

    const process = this.processes.get(serviceName);
    if (process) {
      process.kill();
      this.processes.delete(serviceName);
    }

    // 使用端口号强制停止
    if (config.port) {
      await this.killPort(config.port);
    }

    new Notice(`🛑 ${config.displayName} 已停止`);
  }

  /**
   * 检查服务状态
   */
  async checkServiceStatus(serviceName: string): Promise<'running' | 'stopped' | 'unknown'> {
    const config = this.services.get(serviceName);
    if (!config || !config.healthCheckUrl) {
      return 'unknown';
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(config.healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 检查响应状态
      if (response.ok) {
        return 'running';
      } else {
        return 'stopped';
      }
    } catch (error: any) {
      // 网络错误或超时，认为服务已停止
      return 'stopped';
    }
  }

  /**
   * 获取所有服务
   */
  getServices(): ServiceConfig[] {
    return Array.from(this.services.values());
  }

  /**
   * 获取服务配置
   */
  getServiceConfig(serviceName: string): ServiceConfig | undefined {
    return this.services.get(serviceName);
  }

  /**
   * 停止占用端口的进程
   */
  private async killPort(port: number): Promise<void> {
    const platform = process.platform;

    if (platform === 'win32') {
      const { exec } = require('child_process');
      await new Promise<void>((resolve) => {
        exec(`netstat -ano | findstr :${port}`, (error: any, stdout: string) => {
          if (error || !stdout) {
            resolve();
            return;
          }

          const lines = stdout.split('\n');
          const pids = new Set<string>();

          lines.forEach((line) => {
            const match = line.match(/LISTENING\s+(\d+)/);
            if (match && match[1]) {
              pids.add(match[1]);
            }
          });

          if (pids.size === 0) {
            resolve();
            return;
          }

          const pidArray = Array.from(pids);
          exec(`taskkill /F /PID ${pidArray.join(' /PID ')}`, () => {
            resolve();
          });
        });
      });
    } else {
      // macOS/Linux
      const { exec } = require('child_process');
      await new Promise<void>((resolve) => {
        exec(`lsof -ti:${port}`, (error: any, stdout: string) => {
          if (error || !stdout) {
            resolve();
            return;
          }

          const pids = stdout.trim().split('\n');
          exec(`kill -9 ${pids.join(' ')}`, () => {
            resolve();
          });
        });
      });
    }
  }

  /**
   * 读取服务配置文件
   */
  async readServiceConfig(serviceName: string): Promise<any> {
    const config = this.services.get(serviceName);
    if (!config || !config.configFile) {
      throw new Error('配置文件不存在');
    }

    const configPath = path.join(config.cwd, config.configFile);

    if (!fs.existsSync(configPath)) {
      throw new Error(`配置文件不存在: ${configPath}`);
    }

    const content = fs.readFileSync(configPath, 'utf-8');

    if (config.configFile.endsWith('.json')) {
      return JSON.parse(content);
    } else if (config.configFile === '.env') {
      // 解析 .env 文件
      const env: Record<string, string> = {};
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key) {
            env[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
      return env;
    }

    return content;
  }

  /**
   * 保存服务配置
   */
  async saveServiceConfig(serviceName: string, config: any): Promise<void> {
    const serviceConfig = this.services.get(serviceName);
    if (!serviceConfig || !serviceConfig.configFile) {
      throw new Error('配置文件不存在');
    }

    const configPath = path.join(serviceConfig.cwd, serviceConfig.configFile);

    let content: string;

    if (serviceConfig.configFile.endsWith('.json')) {
      content = JSON.stringify(config, null, 2);
    } else if (serviceConfig.configFile === '.env') {
      // 生成 .env 文件
      content = Object.entries(config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    } else {
      content = String(config);
    }

    fs.writeFileSync(configPath, content, 'utf-8');
  }
}
