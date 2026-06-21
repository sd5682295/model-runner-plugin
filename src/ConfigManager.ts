import * as fs from 'fs';
import * as path from 'path';

// 原始配置格式（server.js 使用的格式）
export interface OriginalSource {
  id: string;
  name: string;
  baseUrl: string;
  apiKeys: string[];
}

export interface OriginalConfig {
  sources: OriginalSource[];
  activeSourceId: string;
  modelRoutes?: any;
  timeout?: number;
  retries?: number;
  promptDir?: string;
}

// 插件使用的简化格式
export interface PluginSource {
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export class ConfigManager {
  private configPath: string;
  private config: OriginalConfig | null = null;

  constructor(serverDir: string) {
    this.configPath = path.join(serverDir, 'config.json');
  }

  /**
   * 读取配置文件
   */
  async load(): Promise<OriginalConfig> {
    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`配置文件不存在: ${this.configPath}`);
      }

      let content = fs.readFileSync(this.configPath, 'utf-8');

      // 移除 UTF-8 BOM 标记（如果存在）
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }

      this.config = JSON.parse(content);
      return this.config!;
    } catch (error) {
      console.error('读取配置失败:', error);
      throw error;
    }
  }

  /**
   * 保存配置文件
   */
  async save(config: OriginalConfig): Promise<void> {
    try {
      const content = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, content, 'utf-8');
      this.config = config;
    } catch (error) {
      console.error('保存配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): OriginalConfig | null {
    return this.config;
  }

  /**
   * 获取所有源（转换为插件格式）
   */
  getSources(): { id: string; name: string; enabled: boolean }[] {
    if (!this.config) return [];

    return this.config.sources.map((source) => ({
      id: source.id,
      name: source.name,
      enabled: true, // 原始格式没有 enabled 字段，默认为 true
    }));
  }

  /**
   * 获取当前源
   */
  getCurrentSource(): string {
    return this.config?.activeSourceId || '';
  }

  /**
   * 获取当前源的名称
   */
  getCurrentSourceName(): string {
    if (!this.config) return '';

    const source = this.config.sources.find(s => s.id === this.config!.activeSourceId);
    return source?.name || '';
  }

  /**
   * 切换源
   */
  async switchSource(sourceId: string): Promise<void> {
    if (!this.config) {
      throw new Error('配置未加载');
    }

    const source = this.config.sources.find(s => s.id === sourceId);
    if (!source) {
      throw new Error(`源不存在: ${sourceId}`);
    }

    this.config.activeSourceId = sourceId;
    await this.save(this.config);
  }

  /**
   * 验证 URL 格式
   */
  private validateUrl(url: string): boolean {
    if (!url || url.trim() === '') {
      return false;
    }

    try {
      const urlObj = new URL(url);
      // 只允许 http 和 https 协议
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * 验证源 ID 格式
   */
  private validateSourceId(id: string): boolean {
    if (!id || id.trim() === '') {
      return false;
    }

    // 允许字母、数字、下划线、连字符、点号
    const validPattern = /^[a-zA-Z0-9_.-]+$/;
    return validPattern.test(id);
  }

  /**
   * 添加源
   */
  async addSource(data: {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
  }): Promise<void> {
    if (!this.config) {
      throw new Error('配置未加载');
    }

    // 验证 ID
    if (!this.validateSourceId(data.id)) {
      throw new Error('源 ID 不能为空，且只能包含字母、数字、下划线、连字符和点号');
    }

    // 验证 URL
    if (!this.validateUrl(data.baseUrl)) {
      throw new Error('源 URL 格式无效');
    }

    // 检查 ID 是否已存在
    if (this.config.sources.find(s => s.id === data.id)) {
      throw new Error(`源 ID "${data.id}" 已存在`);
    }

    // 添加新源
    this.config.sources.push({
      id: data.id,
      name: data.name,
      baseUrl: data.baseUrl,
      apiKeys: [data.apiKey],
    });

    await this.save(this.config);
  }

  /**
   * 更新源
   */
  async updateSource(sourceId: string, data: {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<void> {
    if (!this.config) {
      throw new Error('配置未加载');
    }

    const source = this.config.sources.find(s => s.id === sourceId);
    if (!source) {
      throw new Error(`源不存在: ${sourceId}`);
    }

    // 验证 URL（如果提供）
    if (data.baseUrl !== undefined && !this.validateUrl(data.baseUrl)) {
      throw new Error('源 URL 格式无效');
    }

    // 更新字段
    if (data.name) source.name = data.name;
    if (data.baseUrl) source.baseUrl = data.baseUrl;
    if (data.apiKey) {
      // 更新第一个 API Key
      source.apiKeys[0] = data.apiKey;
    }

    await this.save(this.config);
  }

  /**
   * 删除源
   */
  async deleteSource(sourceId: string): Promise<void> {
    if (!this.config) {
      throw new Error('配置未加载');
    }

    // 检查源是否存在
    const sourceExists = this.config.sources.some(s => s.id === sourceId);
    if (!sourceExists) {
      throw new Error(`源不存在: ${sourceId}`);
    }

    // 不能删除当前使用的源
    if (this.config.activeSourceId === sourceId) {
      throw new Error('无法删除当前使用的源');
    }

    // 删除源
    this.config.sources = this.config.sources.filter(s => s.id !== sourceId);

    await this.save(this.config);
  }

  /**
   * 获取源详情
   */
  getSource(sourceId: string): OriginalSource | null {
    if (!this.config) return null;

    return this.config.sources.find(s => s.id === sourceId) || null;
  }

  /**
   * 更新端口（插件特有，不保存到 config.json）
   */
  async updatePort(port: number): Promise<void> {
    // config.json 中没有端口配置
    // 端口配置在插件的 settings 中
    throw new Error('端口配置不在 config.json 中，请使用插件设置');
  }

  /**
   * 获取端口
   */
  getPort(): number {
    return 4000; // 默认端口
  }
}

