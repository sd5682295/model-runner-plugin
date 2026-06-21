import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ClaudeCodeConfig {
  env: {
    ANTHROPIC_BASE_URL?: string;
    ANTHROPIC_AUTH_TOKEN?: string;
    [key: string]: any;
  };
  permissions?: any;
  [key: string]: any;
}

export class ClaudeCodeManager {
  private configPath: string;

  constructor() {
    // ClaudeCode 配置文件路径
    this.configPath = path.join(os.homedir(), '.claude', 'settings.json');
  }

  /**
   * 读取 ClaudeCode 配置
   */
  readConfig(): ClaudeCodeConfig | null {
    try {
      if (!fs.existsSync(this.configPath)) {
        console.log('[ClaudeCodeManager] 配置文件不存在:', this.configPath);
        return null;
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(content);
      return config;
    } catch (error) {
      console.error('[ClaudeCodeManager] 读取配置失败:', error);
      return null;
    }
  }

  /**
   * 保存 ClaudeCode 配置
   */
  saveConfig(config: ClaudeCodeConfig): boolean {
    try {
      // 备份原配置
      this.backupConfig();

      // 格式化并保存
      const content = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, content, 'utf-8');
      console.log('[ClaudeCodeManager] 配置已保存');
      return true;
    } catch (error) {
      console.error('[ClaudeCodeManager] 保存配置失败:', error);
      return false;
    }
  }

  /**
   * 备份配置文件
   */
  backupConfig(): boolean {
    try {
      if (!fs.existsSync(this.configPath)) {
        return false;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.configPath}.backup-${timestamp}`;

      fs.copyFileSync(this.configPath, backupPath);
      console.log('[ClaudeCodeManager] 配置已备份到:', backupPath);
      return true;
    } catch (error) {
      console.error('[ClaudeCodeManager] 备份失败:', error);
      return false;
    }
  }

  /**
   * 配置 ClaudeCode 使用 model-runner
   */
  configureForModelRunner(port: number = 4000): boolean {
    const config = this.readConfig();
    if (!config) {
      console.error('[ClaudeCodeManager] 无法读取配置');
      return false;
    }

    // 确保 env 对象存在
    if (!config.env) {
      config.env = {};
    }

    // 保存原有的 API URL（如果有）
    const originalUrl = config.env.ANTHROPIC_BASE_URL;

    // 设置为本地 model-runner
    config.env.ANTHROPIC_BASE_URL = `http://localhost:${port}`;

    // 移除 ANTHROPIC_AUTH_TOKEN（model-runner 不需要）
    // 但先保存一份到备注字段
    if (config.env.ANTHROPIC_AUTH_TOKEN) {
      config.env._ORIGINAL_ANTHROPIC_AUTH_TOKEN = config.env.ANTHROPIC_AUTH_TOKEN;
      delete config.env.ANTHROPIC_AUTH_TOKEN;
    }

    // 保存原始 URL
    if (originalUrl) {
      config.env._ORIGINAL_ANTHROPIC_BASE_URL = originalUrl;
    }

    return this.saveConfig(config);
  }

  /**
   * 恢复 ClaudeCode 使用官方 API
   */
  restoreOriginalConfig(): boolean {
    const config = this.readConfig();
    if (!config) {
      console.error('[ClaudeCodeManager] 无法读取配置');
      return false;
    }

    if (!config.env) {
      config.env = {};
    }

    // 恢复原始配置
    if (config.env._ORIGINAL_ANTHROPIC_BASE_URL) {
      config.env.ANTHROPIC_BASE_URL = config.env._ORIGINAL_ANTHROPIC_BASE_URL;
      delete config.env._ORIGINAL_ANTHROPIC_BASE_URL;
    }

    if (config.env._ORIGINAL_ANTHROPIC_AUTH_TOKEN) {
      config.env.ANTHROPIC_AUTH_TOKEN = config.env._ORIGINAL_ANTHROPIC_AUTH_TOKEN;
      delete config.env._ORIGINAL_ANTHROPIC_AUTH_TOKEN;
    }

    return this.saveConfig(config);
  }

  /**
   * 检查当前配置状态
   */
  getConfigStatus(): {
    hasConfig: boolean;
    isUsingModelRunner: boolean;
    currentUrl: string | null;
    originalUrl: string | null;
  } {
    const config = this.readConfig();

    if (!config) {
      return {
        hasConfig: false,
        isUsingModelRunner: false,
        currentUrl: null,
        originalUrl: null,
      };
    }

    const currentUrl = config.env?.ANTHROPIC_BASE_URL || null;
    const originalUrl = config.env?._ORIGINAL_ANTHROPIC_BASE_URL || null;
    const isUsingModelRunner = currentUrl?.includes('localhost') || false;

    return {
      hasConfig: true,
      isUsingModelRunner,
      currentUrl,
      originalUrl,
    };
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 列出所有备份文件
   */
  listBackups(): string[] {
    try {
      const dir = path.dirname(this.configPath);
      const basename = path.basename(this.configPath);

      const files = fs.readdirSync(dir);
      const backups = files
        .filter(f => f.startsWith(basename + '.backup-'))
        .sort()
        .reverse(); // 最新的在前面

      return backups.map(f => path.join(dir, f));
    } catch (error) {
      console.error('[ClaudeCodeManager] 列出备份失败:', error);
      return [];
    }
  }

  /**
   * 从备份恢复
   */
  restoreFromBackup(backupPath: string): boolean {
    try {
      if (!fs.existsSync(backupPath)) {
        console.error('[ClaudeCodeManager] 备份文件不存在:', backupPath);
        return false;
      }

      // 备份当前配置
      this.backupConfig();

      // 从备份恢复
      fs.copyFileSync(backupPath, this.configPath);
      console.log('[ClaudeCodeManager] 已从备份恢复:', backupPath);
      return true;
    } catch (error) {
      console.error('[ClaudeCodeManager] 恢复失败:', error);
      return false;
    }
  }
}
