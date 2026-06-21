import * as fs from 'fs';
import * as path from 'path';

export interface RequestLog {
  timestamp: string;
  model: string;
  source: string;
  status: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export interface Statistics {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgLatencyMs: number;
  byModel: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  bySource: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  recentLogs: RequestLog[];
}

export class StatsManager {
  private statsPath: string;
  private maxRecentLogs = 100;

  constructor(serverDir: string) {
    this.statsPath = path.join(serverDir, 'stats.json');
  }

  /**
   * 读取统计数据
   */
  readStats(): Statistics {
    try {
      if (!fs.existsSync(this.statsPath)) {
        return this.getEmptyStats();
      }

      const content = fs.readFileSync(this.statsPath, 'utf-8');
      const stats = JSON.parse(content);
      return stats;
    } catch (error) {
      console.error('[StatsManager] 读取统计数据失败:', error);
      return this.getEmptyStats();
    }
  }

  /**
   * 保存统计数据
   */
  saveStats(stats: Statistics): boolean {
    try {
      const content = JSON.stringify(stats, null, 2);
      fs.writeFileSync(this.statsPath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('[StatsManager] 保存统计数据失败:', error);
      return false;
    }
  }

  /**
   * 添加请求日志
   */
  addRequestLog(log: RequestLog): void {
    const stats = this.readStats();

    // 更新总计
    stats.totalRequests++;
    if (log.status === 200) {
      stats.successRequests++;
    } else {
      stats.failedRequests++;
    }

    stats.totalInputTokens += log.promptTokens;
    stats.totalOutputTokens += log.completionTokens;

    // 更新平均延迟
    const totalLatency = stats.avgLatencyMs * (stats.totalRequests - 1) + log.latencyMs;
    stats.avgLatencyMs = Math.round(totalLatency / stats.totalRequests);

    // 按模型统计
    if (!stats.byModel[log.model]) {
      stats.byModel[log.model] = { requests: 0, inputTokens: 0, outputTokens: 0 };
    }
    stats.byModel[log.model].requests++;
    stats.byModel[log.model].inputTokens += log.promptTokens;
    stats.byModel[log.model].outputTokens += log.completionTokens;

    // 按源统计
    if (!stats.bySource[log.source]) {
      stats.bySource[log.source] = { requests: 0, inputTokens: 0, outputTokens: 0 };
    }
    stats.bySource[log.source].requests++;
    stats.bySource[log.source].inputTokens += log.promptTokens;
    stats.bySource[log.source].outputTokens += log.completionTokens;

    // 添加到最近日志
    stats.recentLogs.unshift(log);
    if (stats.recentLogs.length > this.maxRecentLogs) {
      stats.recentLogs = stats.recentLogs.slice(0, this.maxRecentLogs);
    }

    this.saveStats(stats);
  }

  /**
   * 重置统计数据
   */
  resetStats(): void {
    this.saveStats(this.getEmptyStats());
  }

  /**
   * 获取空统计数据
   */
  private getEmptyStats(): Statistics {
    return {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgLatencyMs: 0,
      byModel: {},
      bySource: {},
      recentLogs: [],
    };
  }

  /**
   * 计算总成本
   */
  calculateTotalCost(costConfig: Record<string, { input: number; output: number }>): number {
    const stats = this.readStats();
    let totalCost = 0;

    for (const [model, modelStats] of Object.entries(stats.byModel)) {
      const cost = costConfig[model];
      if (cost) {
        const inputCost = (modelStats.inputTokens / 1000000) * cost.input;
        const outputCost = (modelStats.outputTokens / 1000000) * cost.output;
        totalCost += inputCost + outputCost;
      }
    }

    return totalCost;
  }

  /**
   * 获取统计摘要
   */
  getSummary(): {
    totalRequests: number;
    successRate: number;
    avgLatency: number;
    totalTokens: number;
  } {
    const stats = this.readStats();

    const successRate = stats.totalRequests > 0
      ? Math.round((stats.successRequests / stats.totalRequests) * 100)
      : 0;

    return {
      totalRequests: stats.totalRequests,
      successRate,
      avgLatency: stats.avgLatencyMs,
      totalTokens: stats.totalInputTokens + stats.totalOutputTokens,
    };
  }
}
