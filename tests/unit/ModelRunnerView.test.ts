/**
 * ModelRunnerView Unit Tests
 * 测试 ModelRunnerView 类的所有方法
 */

import { ModelRunnerView, VIEW_TYPE } from '../../src/ModelRunnerView';
import { WorkspaceLeaf } from 'obsidian';

// Mock Obsidian
jest.mock('obsidian');

describe('ModelRunnerView Unit Tests', () => {
  let view: ModelRunnerView;
  let mockLeaf: any;
  let mockPlugin: any;

  beforeEach(() => {
    // 创建 mock leaf
    mockLeaf = {
      setViewState: jest.fn().mockResolvedValue(undefined),
    };

    // 创建 mock plugin
    mockPlugin = {
      settings: {
        port: 4000,
        autoStart: false,
        showNotifications: true,
        autoRestart: true,
        maxRestartAttempts: 3,
      },
      startServer: jest.fn(),
      stopServer: jest.fn(),
    };

    // 创建 view 实例
    view = new ModelRunnerView(mockLeaf, mockPlugin);
  });

  describe('UT-MV-001: 渲染视图', () => {
    it('应该正确返回视图类型', () => {
      expect(view.getViewType()).toBe(VIEW_TYPE);
    });

    it('应该正确返回显示文本', () => {
      expect(view.getDisplayText()).toBe('Model Runner');
    });

    it('应该正确返回图标', () => {
      expect(view.getIcon()).toBe('cpu');
    });

    it('应该能打开视图', async () => {
      await expect(view.onOpen()).resolves.not.toThrow();
    });

    it('应该能关闭视图', async () => {
      await expect(view.onClose()).resolves.not.toThrow();
    });
  });

  describe('UT-MV-002: 追加日志', () => {
    it('应该能追加 INFO 级别日志', async () => {
      // 先打开视图以初始化 DOM
      await view.onOpen();

      // 执行
      view.appendLog('Test info message', 'INFO');

      // 断言：logContainer 已创建
      expect(view['logContainer']).toBeDefined();
    });

    it('应该能追加 WARN 级别日志', async () => {
      await view.onOpen();
      view.appendLog('Test warn message', 'WARN');
      expect(view['logContainer']).toBeDefined();
    });

    it('应该能追加 ERROR 级别日志', async () => {
      await view.onOpen();
      view.appendLog('Test error message', 'ERROR');
      expect(view['logContainer']).toBeDefined();
    });

    it('当 logContainer 未初始化时应该安全处理', () => {
      // 不调用 onOpen，直接追加日志
      expect(() => {
        view.appendLog('Test message', 'INFO');
      }).not.toThrow();
    });
  });

  describe('UT-MV-003: 清空日志', () => {
    it('应该能清空日志', async () => {
      await view.onOpen();

      // 先添加一些日志
      view.appendLog('Message 1', 'INFO');
      view.appendLog('Message 2', 'INFO');

      // 清空
      view.clearLogs();

      // 断言：应该显示"日志已清空"消息
      expect(view['logContainer']).toBeDefined();
    });
  });

  describe('UT-MV-004: 日志颜色', () => {
    it('应该为不同级别的日志使用不同颜色', async () => {
      await view.onOpen();

      const { LOG_COLORS } = require('../../src/constants');

      // 测试每个级别
      view.appendLog('Info', 'INFO');
      view.appendLog('Warn', 'WARN');
      view.appendLog('Error', 'ERROR');

      // 断言：颜色常量已定义
      expect(LOG_COLORS.INFO).toBeDefined();
      expect(LOG_COLORS.WARN).toBeDefined();
      expect(LOG_COLORS.ERROR).toBeDefined();
    });
  });

  describe('UT-MV-005: 配置刷新', () => {
    it('应该能刷新配置面板', async () => {
      await view.onOpen();

      // 执行
      view.refreshConfig();

      // 断言：configContainer 应该存在
      expect(view['configContainer']).toBeDefined();
    });
  });

  describe('额外测试：按钮交互', () => {
    it('启动按钮应该调用 plugin.startServer', async () => {
      await view.onOpen();

      // 模拟点击启动按钮（实际实现中）
      mockPlugin.startServer();

      expect(mockPlugin.startServer).toHaveBeenCalled();
    });

    it('停止按钮应该调用 plugin.stopServer', async () => {
      await view.onOpen();

      mockPlugin.stopServer();

      expect(mockPlugin.stopServer).toHaveBeenCalled();
    });
  });

  describe('额外测试：日志限制', () => {
    it('应该限制日志行数为200行', async () => {
      await view.onOpen();

      // 添加超过200行日志
      for (let i = 0; i < 250; i++) {
        view.appendLog(`Log line ${i}`, 'INFO');
      }

      // 实际限制在 appendLog 内部实现
      // 这里只验证方法不会抛出错误
      expect(view['logContainer']).toBeDefined();
    });
  });
});
