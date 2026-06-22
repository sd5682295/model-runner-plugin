import * as fs from 'fs';
import * as path from 'path';

export interface SearchConfig {
  id: string;
  name: string;
  provider: string; // 'tavily', 'google', 'bing', 'serper'
  baseUrl: string;
  apiKey: string;
  params?: Record<string, string>; // 如 Google 的 cx
}

export interface SearchConfigsData {
  configs: SearchConfig[];
  activeConfigId: string;
}

export class SearchConfigManager {
  private configPath: string;

  constructor(searchRelayDir: string) {
    this.configPath = path.join(searchRelayDir, 'search-configs.json');
  }

  /**
   * 读取所有搜索配置
   */
  readConfigs(): SearchConfigsData {
    try {
      if (!fs.existsSync(this.configPath)) {
        return { configs: [], activeConfigId: '' };
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('[SearchConfigManager] 读取配置失败:', error);
      return { configs: [], activeConfigId: '' };
    }
  }

  /**
   * 保存所有配置
   */
  saveConfigs(data: SearchConfigsData): void {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(this.configPath, content, 'utf-8');
  }

  /**
   * 添加配置
   */
  addConfig(config: SearchConfig): void {
    const data = this.readConfigs();

    // 检查 ID 是否已存在
    if (data.configs.some(c => c.id === config.id)) {
      throw new Error(`配置 ID "${config.id}" 已存在`);
    }

    data.configs.push(config);

    // 如果是第一个配置，设为当前配置
    if (data.configs.length === 1) {
      data.activeConfigId = config.id;
    }

    this.saveConfigs(data);
  }

  /**
   * 更新配置
   */
  updateConfig(configId: string, updates: Partial<SearchConfig>): void {
    const data = this.readConfigs();
    const index = data.configs.findIndex(c => c.id === configId);

    if (index === -1) {
      throw new Error(`找不到配置: ${configId}`);
    }

    data.configs[index] = { ...data.configs[index], ...updates };
    this.saveConfigs(data);
  }

  /**
   * 删除配置
   */
  deleteConfig(configId: string): void {
    const data = this.readConfigs();

    // 不能删除当前使用的配置
    if (configId === data.activeConfigId) {
      throw new Error('不能删除当前使用的配置');
    }

    data.configs = data.configs.filter(c => c.id !== configId);
    this.saveConfigs(data);
  }

  /**
   * 切换配置（应用到 .env）
   */
  switchConfig(configId: string, envFilePath: string): void {
    const data = this.readConfigs();
    const config = data.configs.find(c => c.id === configId);

    if (!config) {
      throw new Error(`找不到配置: ${configId}`);
    }

    // 更新 activeConfigId
    data.activeConfigId = configId;
    this.saveConfigs(data);

    // 写入 .env
    this.applyConfigToEnv(config, envFilePath);
  }

  /**
   * 应用配置到 .env 文件
   */
  private applyConfigToEnv(config: SearchConfig, envFilePath: string): void {
    const envContent: string[] = [];

    // 基础配置
    envContent.push(`RELAY_HOST=127.0.0.1`);
    envContent.push(`RELAY_PORT=18795`);
    envContent.push(`SEARCH_PROVIDER=${config.provider}`);
    envContent.push(`UPSTREAM_TIMEOUT_MS=20000`);

    // 提供商特定配置
    switch (config.provider) {
      case 'tavily':
        envContent.push(`TAVILY_API_KEY=${config.apiKey}`);
        envContent.push(`TAVILY_BASE_URL=${config.baseUrl}`);
        break;

      case 'google':
        envContent.push(`GOOGLE_API_KEY=${config.apiKey}`);
        if (config.params?.cx) {
          envContent.push(`GOOGLE_CX=${config.params.cx}`);
        }
        break;

      case 'bing':
        envContent.push(`BING_API_KEY=${config.apiKey}`);
        break;

      case 'serper':
        envContent.push(`SERPER_API_KEY=${config.apiKey}`);
        break;
    }

    fs.writeFileSync(envFilePath, envContent.join('\n') + '\n', 'utf-8');
  }

  /**
   * 获取当前配置
   */
  getCurrentConfig(): SearchConfig | null {
    const data = this.readConfigs();
    return data.configs.find(c => c.id === data.activeConfigId) || null;
  }
}
