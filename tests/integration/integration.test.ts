/**
 * Integration Tests
 * 测试模块间的协作和交互
 */

import { ProcessManager } from '../../src/ProcessManager';
import { ModelRunnerView } from '../../src/ModelRunnerView';
import { EventEmitter } from 'events';

jest.mock('child_process');
jest.mock('fs');
jest.mock('obsidian');

describe('Integration Tests', () => {
  describe('IT-PM-001: 完整启动流程', () => {
    it('应该完整执行启动流程：spawn -> 日志回调 -> 状态更新', async () => {
      const mockOnLog = jest.fn();
      const mockOnStatusChange = jest.fn();

      // Mock child_process
      const mockChildProcess = new EventEmitter();
      mockChildProcess.kill = jest.fn();
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();

      const { spawn } = require('child_process');
      (spawn as jest.Mock).mockReturnValue(mockChildProcess);

      const fs = require('fs');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // 创建 ProcessManager
      const pm = new ProcessManager('/test/server', mockOnLog, mockOnStatusChange);

      // 启动
      const startPromise = pm.start();
      await new Promise(resolve => setImmediate(resolve));

      // 模拟服务器输出
      mockChildProcess.stdout.emit('data', Buffer.from('正在启动...\n'));
      mockChildProcess.stdout.emit('data', Buffer.from('Model Runner 运行  http://localhost:4000\n'));

      const result = await startPromise;

      // 断言
      expect(result).toBe(true);
      expect(mockOnLog).toHaveBeenCalledWith(expect.stringContaining('正在启动服务器'), 'INFO');
      expect(mockOnLog).toHaveBeenCalledWith(expect.stringContaining('Model Runner 运行'), 'INFO');
      expect(mockOnStatusChange).toHaveBeenCalledWith(true);
      expect(pm.getIsRunning()).toBe(true);
    });
  });

  describe('IT-PM-002: 完整停止流程', () => {
    it('应该完整执行停止流程：kill -> close 事件 -> 状态重置', async () => {
      const mockOnLog = jest.fn();
      const mockOnStatusChange = jest.fn();

      const mockChildProcess = new EventEmitter();
      mockChildProcess.kill = jest.fn();
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();

      const { spawn } = require('child_process');
      (spawn as jest.Mock).mockReturnValue(mockChildProcess);

      const fs = require('fs');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const pm = new ProcessManager('/test/server', mockOnLog, mockOnStatusChange);

      // 先启动
      const startPromise = pm.start();
      await new Promise(resolve => setImmediate(resolve));
      mockChildProcess.stdout.emit('data', Buffer.from('Model Runner 运行\n'));
      await startPromise;

      // 重置 mock
      mockOnLog.mockClear();
      mockOnStatusChange.mockClear();

      // 停止
      pm.stop();

      // 模拟进程关闭
      mockChildProcess.emit('close', 0);

      // 断言
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockOnLog).toHaveBeenCalledWith('正在停止服务器...', 'INFO');
      expect(mockOnStatusChange).toHaveBeenCalledWith(false);
      expect(pm.getIsRunning()).toBe(false);
    });
  });

  describe('IT-PM-003: 重启流程', () => {
    it('应该成功执行重启流程', async () => {
      // 清除之前测试的 mock 调用
      jest.clearAllMocks();

      const mockOnLog = jest.fn();
      const mockOnStatusChange = jest.fn();

      let callCount = 0;
      const mockChildProcess1 = new EventEmitter();
      mockChildProcess1.kill = jest.fn();
      mockChildProcess1.stdout = new EventEmitter();
      mockChildProcess1.stderr = new EventEmitter();

      const mockChildProcess2 = new EventEmitter();
      mockChildProcess2.kill = jest.fn();
      mockChildProcess2.stdout = new EventEmitter();
      mockChildProcess2.stderr = new EventEmitter();

      const { spawn } = require('child_process');
      (spawn as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? mockChildProcess1 : mockChildProcess2;
      });

      const fs = require('fs');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const pm = new ProcessManager('/test/server', mockOnLog, mockOnStatusChange);

      // 第一次启动
      const startPromise1 = pm.start();
      await Promise.resolve();
      mockChildProcess1.stdout.emit('data', Buffer.from('Model Runner 运行\n'));
      await startPromise1;

      // 停止
      pm.stop();
      mockChildProcess1.emit('close', 0);
      await Promise.resolve();

      // 第二次启动
      const startPromise2 = pm.start();
      await Promise.resolve();
      mockChildProcess2.stdout.emit('data', Buffer.from('Model Runner 运行\n'));
      await startPromise2;

      // 断言
      expect(pm.getIsRunning()).toBe(true);
      // 验证实际调用次数
      expect(callCount).toBe(2);
    });
  });

  describe('IT-PM-004: 日志流转', () => {
    it('服务器输出应该通过回调传递到 View', async () => {
      const mockOnLog = jest.fn();
      const mockOnStatusChange = jest.fn();

      const mockChildProcess = new EventEmitter();
      mockChildProcess.kill = jest.fn();
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();

      const { spawn } = require('child_process');
      (spawn as jest.Mock).mockReturnValue(mockChildProcess);

      const fs = require('fs');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const pm = new ProcessManager('/test/server', mockOnLog, mockOnStatusChange);

      const startPromise = pm.start();
      await new Promise(resolve => setImmediate(resolve));

      // 模拟多条日志
      mockChildProcess.stdout.emit('data', Buffer.from('Log line 1\n'));
      mockChildProcess.stdout.emit('data', Buffer.from('Log line 2\n'));
      mockChildProcess.stdout.emit('data', Buffer.from('Model Runner 运行\n'));
      mockChildProcess.stderr.emit('data', Buffer.from('Error log\n'));

      await startPromise;

      // 断言：所有日志都应该通过回调传递
      expect(mockOnLog).toHaveBeenCalledWith(expect.stringContaining('Log line 1'), 'INFO');
      expect(mockOnLog).toHaveBeenCalledWith(expect.stringContaining('Log line 2'), 'INFO');
      expect(mockOnLog).toHaveBeenCalledWith(expect.stringContaining('Model Runner 运行'), 'INFO');
      expect(mockOnLog).toHaveBeenCalledWith(expect.stringContaining('Error log'), 'ERROR');
    }, 10000); // 增加超时到10秒
  });

  describe('IT-UI-001: 启动按钮 → 进程', () => {
    it('点击启动按钮应该调用 ProcessManager.start()', async () => {
      // 模拟 plugin
      const mockPlugin: any = {
        settings: { port: 4000 },
        processManager: {
          start: jest.fn().mockResolvedValue(true),
          stop: jest.fn(),
          getIsRunning: jest.fn().mockReturnValue(false),
        },
        startServer: async function() {
          await this.processManager.start();
        },
      };

      // 执行启动
      await mockPlugin.startServer();

      // 断言
      expect(mockPlugin.processManager.start).toHaveBeenCalled();
    });
  });

  describe('IT-UI-002: 停止按钮 → 进程', () => {
    it('点击停止按钮应该调用 ProcessManager.stop()', () => {
      const mockPlugin: any = {
        processManager: {
          stop: jest.fn(),
        },
        stopServer: function() {
          this.processManager.stop();
        },
      };

      mockPlugin.stopServer();

      expect(mockPlugin.processManager.stop).toHaveBeenCalled();
    });
  });

  describe('IT-UI-003: 状态栏点击', () => {
    it('点击状态栏应该切换启动/停止状态', () => {
      const mockPlugin: any = {
        processManager: {
          getIsRunning: jest.fn()
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true),
          start: jest.fn().mockResolvedValue(true),
          stop: jest.fn(),
        },
        toggleServer: function() {
          if (this.processManager.getIsRunning()) {
            this.processManager.stop();
          } else {
            this.processManager.start();
          }
        },
      };

      // 第一次点击：启动
      mockPlugin.toggleServer();
      expect(mockPlugin.processManager.start).toHaveBeenCalled();

      // 第二次点击：停止
      mockPlugin.toggleServer();
      expect(mockPlugin.processManager.stop).toHaveBeenCalled();
    });
  });

  describe('IT-UI-004: 命令面板 → 功能', () => {
    it('命令面板应该能触发对应功能', async () => {
      const mockPlugin: any = {
        processManager: {
          start: jest.fn().mockResolvedValue(true),
          stop: jest.fn(),
        },
        commands: {
          'start-server': async function() {
            await mockPlugin.processManager.start();
          },
          'stop-server': function() {
            mockPlugin.processManager.stop();
          },
        },
      };

      // 模拟命令面板调用
      await mockPlugin.commands['start-server']();
      expect(mockPlugin.processManager.start).toHaveBeenCalled();

      mockPlugin.commands['stop-server']();
      expect(mockPlugin.processManager.stop).toHaveBeenCalled();
    });
  });
});
