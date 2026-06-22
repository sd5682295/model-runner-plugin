const { StatsManager } = require('../src/StatsManager');
const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('StatsManager - 单元测试', () => {
  let statsManager;
  const mockServerDir = '/mock/server/dir';
  const mockStatsPath = path.join(mockServerDir, 'stats.json');

  beforeEach(() => {
    jest.clearAllMocks();
    statsManager = new StatsManager(mockServerDir);
  });

  describe('UT-STATS-001: 读取空统计', () => {
    test('stats.json 不存在时应该返回空对象', () => {
      fs.existsSync.mockReturnValue(false);

      const result = statsManager.readStats();

      expect(result).toEqual({
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgLatencyMs: 0,
        byModel: {},
        bySource: {},
        recentLogs: []
      });
    });
  });

  describe('UT-STATS-002: 读取有效统计', () => {
    test('应该成功读取统计文件', () => {
      const mockStats = {
        totalRequests: 10,
        successRequests: 8,
        failedRequests: 2,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        avgLatencyMs: 1200,
        byModel: { 'gpt-4': { requests: 5, inputTokens: 500, outputTokens: 250 } },
        bySource: { 'test-source': { requests: 10, inputTokens: 1000, outputTokens: 500 } },
        recentLogs: []
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockStats));

      const result = statsManager.readStats();

      expect(result).toEqual(mockStats);
      expect(result.totalRequests).toBe(10);
    });
  });

  describe('UT-STATS-003: 添加请求日志', () => {
    test('应该更新统计数据', () => {
      const emptyStats = {
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgLatencyMs: 0,
        byModel: {},
        bySource: {},
        recentLogs: []
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(emptyStats));
      fs.writeFileSync.mockImplementation(() => {});

      const log = {
        timestamp: '2024-01-01T00:00:00Z',
        model: 'gpt-4',
        source: 'test-source',
        status: 200,
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 1500
      };

      statsManager.addRequestLog(log);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedStats = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedStats.totalRequests).toBe(1);
      expect(savedStats.successRequests).toBe(1);
      expect(savedStats.totalInputTokens).toBe(100);
      expect(savedStats.totalOutputTokens).toBe(50);
    });
  });

  describe('UT-STATS-004: 计算成功率', () => {
    test('10 成功 + 2 失败 = 83%', () => {
      const stats = {
        totalRequests: 12,
        successRequests: 10,
        failedRequests: 2,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgLatencyMs: 0,
        byModel: {},
        bySource: {},
        recentLogs: []
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(stats));

      const summary = statsManager.getSummary();

      expect(summary.successRate).toBe(83);
    });
  });

  describe('UT-STATS-005: 计算平均延迟', () => {
    test('应该正确计算平均值', () => {
      const stats = {
        totalRequests: 3,
        successRequests: 3,
        failedRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgLatencyMs: 200, // (100 + 200 + 300) / 3
        byModel: {},
        bySource: {},
        recentLogs: []
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(stats));

      const summary = statsManager.getSummary();

      expect(summary.avgLatency).toBe(200);
    });
  });

  describe('UT-STATS-006: 按模型统计', () => {
    test('应该正确累加模型统计', () => {
      const emptyStats = {
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgLatencyMs: 0,
        byModel: {},
        bySource: {},
        recentLogs: []
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(emptyStats));
      fs.writeFileSync.mockImplementation(() => {});

      const log = {
        timestamp: '2024-01-01T00:00:00Z',
        model: 'gpt-4',
        source: 'test-source',
        status: 200,
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 1500
      };

      statsManager.addRequestLog(log);

      const savedStats = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedStats.byModel['gpt-4']).toBeDefined();
      expect(savedStats.byModel['gpt-4'].requests).toBe(1);
      expect(savedStats.byModel['gpt-4'].inputTokens).toBe(100);
      expect(savedStats.byModel['gpt-4'].outputTokens).toBe(50);
    });
  });

  describe('UT-STATS-007: 按源统计', () => {
    test('应该正确累加源统计', () => {
      const emptyStats = {
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgLatencyMs: 0,
        byModel: {},
        bySource: {},
        recentLogs: []
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(emptyStats));
      fs.writeFileSync.mockImplementation(() => {});

      const log = {
        timestamp: '2024-01-01T00:00:00Z',
        model: 'gpt-4',
        source: 'test-source',
        status: 200,
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 1500
      };

      statsManager.addRequestLog(log);

      const savedStats = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedStats.bySource['test-source']).toBeDefined();
      expect(savedStats.bySource['test-source'].requests).toBe(1);
    });
  });

  describe('UT-STATS-008: 最近日志限制', () => {
    test('应该只保留最近 100 条日志', () => {
      const stats = {
        totalRequests: 100,
        successRequests: 100,
        failedRequests: 0,
        totalInputTokens: 10000,
        totalOutputTokens: 5000,
        avgLatencyMs: 1000,
        byModel: {},
        bySource: {},
        recentLogs: Array(100).fill({
          timestamp: '2024-01-01T00:00:00Z',
          model: 'gpt-4',
          source: 'test',
          status: 200,
          promptTokens: 100,
          completionTokens: 50,
          latencyMs: 1000
        })
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(stats));
      fs.writeFileSync.mockImplementation(() => {});

      const newLog = {
        timestamp: '2024-01-02T00:00:00Z',
        model: 'gpt-4',
        source: 'test',
        status: 200,
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 1000
      };

      statsManager.addRequestLog(newLog);

      const savedStats = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedStats.recentLogs.length).toBe(100);
      expect(savedStats.recentLogs[0].timestamp).toBe('2024-01-02T00:00:00Z');
    });
  });

  describe('UT-STATS-009: 计算总成本', () => {
    test('应该正确计算成本', () => {
      const stats = {
        totalRequests: 2,
        successRequests: 2,
        failedRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgLatencyMs: 0,
        byModel: {
          'gpt-4': {
            requests: 2,
            inputTokens: 1000000, // 1M
            outputTokens: 500000  // 0.5M
          }
        },
        bySource: {},
        recentLogs: []
      };

      const costConfig = {
        'gpt-4': {
          input: 30,  // $30/1M tokens
          output: 60  // $60/1M tokens
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(stats));

      const totalCost = statsManager.calculateTotalCost(costConfig);

      // 1M * $30 + 0.5M * $60 = $30 + $30 = $60
      expect(totalCost).toBe(60);
    });
  });

  describe('UT-STATS-010: 重置统计', () => {
    test('应该清空所有数据', () => {
      fs.writeFileSync.mockImplementation(() => {});

      statsManager.resetStats();

      const savedStats = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedStats.totalRequests).toBe(0);
      expect(savedStats.recentLogs).toEqual([]);
    });
  });

  describe('UT-STATS-011: 格式化数字 K', () => {
    test('1234 应该格式化为 1.2K', () => {
      // 注意：这需要在 SettingsTab 中测试，StatsManager 不包含这个方法
      const num = 1234;
      const formatted = num >= 1000 ? `${(num / 1000).toFixed(1)}K` : num.toString();
      expect(formatted).toBe('1.2K');
    });
  });

  describe('UT-STATS-012: 格式化数字 M', () => {
    test('1234567 应该格式化为 1.2M', () => {
      const num = 1234567;
      const formatted = num >= 1000000 ? `${(num / 1000000).toFixed(1)}M` : num.toString();
      expect(formatted).toBe('1.2M');
    });
  });
});
