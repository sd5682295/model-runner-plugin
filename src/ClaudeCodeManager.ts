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
   * 配置 ClaudeCode 使用指定的源
   * @param sourceBaseUrl 源的 baseUrl（不带 /v1）
   * @param sourceApiKey 源的 API Key
   * @param sourceId 源的 ID（用于记录）
   */
  configureForSource(sourceBaseUrl: string, sourceApiKey: string, sourceId: string): boolean {
    const config = this.readConfig();
    if (!config) {
      console.error('[ClaudeCodeManager] 无法读取配置');
      return false;
    }

    // 确保 env 对象存在
    if (!config.env) {
      config.env = {};
    }

    // 直接设置为指定源的配置（不保存原始值）
    // 注意：不添加 /v1，因为 ClaudeCode 会自动添加
    config.env.ANTHROPIC_BASE_URL = sourceBaseUrl;
    config.env.ANTHROPIC_AUTH_TOKEN = sourceApiKey;

    // 记录使用的源 ID（用于显示）
    config.env._CURRENT_SOURCE_ID = sourceId;

    // 清理可能存在的旧的 _ORIGINAL_ 字段
    delete config.env._ORIGINAL_ANTHROPIC_BASE_URL;
    delete config.env._ORIGINAL_ANTHROPIC_AUTH_TOKEN;

    return this.saveConfig(config);
  }

  /**
   * 恢复 ClaudeCode 使用原始配置
   * 注意：现在直接覆盖，没有保存原始配置，此方法仅清理 _CURRENT_SOURCE_ID
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

    // 清理源 ID 记录
    if (config.env._CURRENT_SOURCE_ID) {
      delete config.env._CURRENT_SOURCE_ID;
    }

    // 清理可能存在的旧字段
    if (config.env._ORIGINAL_ANTHROPIC_BASE_URL) {
      delete config.env._ORIGINAL_ANTHROPIC_BASE_URL;
    }
    if (config.env._ORIGINAL_ANTHROPIC_AUTH_TOKEN) {
      delete config.env._ORIGINAL_ANTHROPIC_AUTH_TOKEN;
    }

    return this.saveConfig(config);
  }

  /**
   * 检查当前配置状态
   */
  getConfigStatus(): {
    hasConfig: boolean;
    isUsingCustomSource: boolean;
    currentUrl: string | null;
    currentSourceId: string | null;
  } {
    const config = this.readConfig();

    if (!config) {
      return {
        hasConfig: false,
        isUsingCustomSource: false,
        currentUrl: null,
        currentSourceId: null,
      };
    }

    const currentUrl = config.env?.ANTHROPIC_BASE_URL || null;
    const currentSourceId = config.env?._CURRENT_SOURCE_ID || null;

    // 判断是否使用了自定义源（有 _CURRENT_SOURCE_ID 标记）
    const isUsingCustomSource = !!currentSourceId;

    return {
      hasConfig: true,
      isUsingCustomSource,
      currentUrl,
      currentSourceId,
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
