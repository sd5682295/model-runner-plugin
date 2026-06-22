import * as fs from 'fs';
import * as path from 'path';

export interface SearchSource {
  id: string;
  name: string;
  provider: string; // 'google', 'bing', 'tavily', 'serper', etc.
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  params?: Record<string, any>; // 额外参数
}

export interface SearchSourcesConfig {
  sources: SearchSource[];
  activeSourceId: string;
}

export class SearchSourceManager {
  private configPath: string;
  private _config: SearchSourcesConfig | null = null;

  constructor(serverDir: string) {
    this.configPath = path.join(serverDir, 'search-sources.json');
  }

  /**
   * 读取搜索源配置
   */
  readConfig(): SearchSourcesConfig | null {
    try {
      if (!fs.existsSync(this.configPath)) {
        // 返回默认配置
        return this.getDefaultConfig();
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      this._config = JSON.parse(content);
      return this._config;
    } catch (error) {
      console.error('[SearchSourceManager] 读取配置失败:', error);
      return null;
    }
  }

  /**
   * 保存配置
   */
  saveConfig(config: SearchSourcesConfig): boolean {
    try {
      const content = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, content, 'utf-8');
      this._config = config;
      return true;
    } catch (error) {
      console.error('[SearchSourceManager] 保存配置失败:', error);
      return false;
    }
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): SearchSourcesConfig {
    return {
      sources: [],
      activeSourceId: '',
    };
  }

  /**
   * 添加搜索源
   */
  addSource(source: SearchSource): boolean {
    const config = this.readConfig();
    if (!config) {
      return false;
    }

    // 检查 ID 是否已存在
    if (config.sources.some(s => s.id === source.id)) {
      throw new Error(`搜索源 ID "${source.id}" 已存在`);
    }

    config.sources.push(source);

    // 如果是第一个源，设为当前源
    if (config.sources.length === 1) {
      config.activeSourceId = source.id;
    }

    return this.saveConfig(config);
  }

  /**
   * 更新搜索源
   */
  updateSource(sourceId: string, updates: Partial<SearchSource>): boolean {
    const config = this.readConfig();
    if (!config) {
      return false;
    }

    const index = config.sources.findIndex(s => s.id === sourceId);
    if (index === -1) {
      throw new Error(`找不到搜索源: ${sourceId}`);
    }

    config.sources[index] = { ...config.sources[index], ...updates };
    return this.saveConfig(config);
  }

  /**
   * 删除搜索源
   */
  deleteSource(sourceId: string): boolean {
    const config = this.readConfig();
    if (!config) {
      return false;
    }

    // 不能删除当前使用的源
    if (sourceId === config.activeSourceId) {
      throw new Error('不能删除当前使用的搜索源');
    }

    config.sources = config.sources.filter(s => s.id !== sourceId);
    return this.saveConfig(config);
  }

  /**
   * 切换当前源
   */
  switchSource(sourceId: string): boolean {
    const config = this.readConfig();
    if (!config) {
      return false;
    }

    const source = config.sources.find(s => s.id === sourceId);
    if (!source) {
      throw new Error(`找不到搜索源: ${sourceId}`);
    }

    config.activeSourceId = sourceId;
    return this.saveConfig(config);
  }

  /**
   * 获取当前源
   */
  getCurrentSource(): SearchSource | null {
    const config = this.readConfig();
    if (!config) {
      return null;
    }

    return config.sources.find(s => s.id === config.activeSourceId) || null;
  }

  /**
   * 测试搜索源连接
   */
  async testConnection(source: SearchSource, testQuery: string = 'test'): Promise<{
    success: boolean;
    message: string;
    results?: any;
  }> {
    try {
      console.log('[SearchSourceManager] 测试连接:', source.name);

      // 根据不同的 provider 构建请求
      const response = await this.performSearch(source, testQuery);

      if (response.success) {
        return {
          success: true,
          message: '连接成功',
          results: response.results,
        };
      } else {
        return {
          success: false,
          message: response.error || '连接失败',
        };
      }
    } catch (error: any) {
      console.error('[SearchSourceManager] 测试连接失败:', error);
      return {
        success: false,
        message: error.message || '连接失败',
      };
    }
  }

  /**
   * 执行搜索请求
   */
  private async performSearch(source: SearchSource, query: string): Promise<{
    success: boolean;
    results?: any;
    error?: string;
  }> {
    try {
      let url: string;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      let body: any;

      // 根据不同 provider 构建请求
      switch (source.provider.toLowerCase()) {
        case 'google':
          // Google Custom Search API
          url = `${source.baseUrl}?key=${source.apiKey}&cx=${source.params?.cx || ''}&q=${encodeURIComponent(query)}`;
          break;

        case 'bing':
          // Bing Search API
          url = `${source.baseUrl}?q=${encodeURIComponent(query)}`;
          headers['Ocp-Apim-Subscription-Key'] = source.apiKey;
          break;

        case 'tavily':
          // Tavily Search API
          url = source.baseUrl;
          headers['Authorization'] = `Bearer ${source.apiKey}`;
          body = JSON.stringify({
            query: query,
            max_results: 3,
          });
          break;

        case 'serper':
          // Serper.dev API
          url = source.baseUrl;
          headers['X-API-KEY'] = source.apiKey;
          body = JSON.stringify({
            q: query,
          });
          break;

        default:
          // 通用 API
          url = `${source.baseUrl}?q=${encodeURIComponent(query)}`;
          headers['Authorization'] = `Bearer ${source.apiKey}`;
          break;
      }

      const fetchOptions: RequestInit = {
        method: body ? 'POST' : 'GET',
        headers,
      };

      if (body) {
        fetchOptions.body = body;
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        results: data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 验证搜索源 ID
   */
  validateId(id: string): boolean {
    return /^[a-z0-9-]+$/.test(id);
  }

  /**
   * 验证 URL
   */
  validateUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }
}
