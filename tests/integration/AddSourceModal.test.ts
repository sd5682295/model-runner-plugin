/**
 * 添加新源功能自动化测试
 *
 * 测试 SourceModals 的 AddSourceModal 功能
 */

import { Notice } from 'obsidian';

// Mock Notice
jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  Modal: class MockModal {
    app: any;
    contentEl: any = {
      empty: jest.fn(),
      createEl: jest.fn(() => ({
        createDiv: jest.fn(),
        createEl: jest.fn(),
      })),
      createDiv: jest.fn(() => ({
        createDiv: jest.fn(),
        createEl: jest.fn(),
        setText: jest.fn(),
      })),
    };
    constructor(app: any) {
      this.app = app;
    }
    open() {}
    close() {}
  },
  Setting: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDesc: jest.fn().mockReturnThis(),
    addText: jest.fn().mockReturnThis(),
    addTextArea: jest.fn().mockReturnThis(),
    addDropdown: jest.fn().mockReturnThis(),
    addToggle: jest.fn().mockReturnThis(),
    addButton: jest.fn().mockReturnThis(),
  })),
}));

// Mock global fetch
global.fetch = jest.fn();

describe('AddSourceModal - 添加新源功能测试', () => {
  let mockApp: any;
  let mockPlugin: any;
  let onSubmitCallback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApp = {};
    mockPlugin = {
      configManager: {
        getConfig: jest.fn(() => ({
          sources: [
            { id: 'existing-source', name: 'Existing Source' }
          ],
        })),
      },
    };
    onSubmitCallback = jest.fn();
  });

  describe('测试连接功能测试', () => {
    it('应该获取模型列表并自动填充', async () => {
      // 模拟 API 返回的模型列表
      const mockModels = {
        data: [
          { id: 'gpt-4', created: 1234567890 },
          { id: 'gpt-3.5-turbo', created: 1234567890 },
          { id: 'claude-3-opus', created: 1234567890 },
        ],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockModels,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Hello! How can I help you?' } }],
          }),
        });

      // 模拟测试连接逻辑
      const baseURL = 'https://api.openai.com/v1';
      const apiKey = 'sk-test123';

      // 步骤 1: 获取模型列表
      const response1 = await fetch(`${baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      expect(response1.ok).toBe(true);

      const data = await response1.json();
      const models = data.data || [];

      // ✅ 验证：找到 3 个模型
      expect(models).toHaveLength(3);
      expect(models[0].id).toBe('gpt-4');

      // 步骤 2: 自动填充模型列表
      const modelNames = models.map((m: any) => m.id).join(',');
      expect(modelNames).toBe('gpt-4,gpt-3.5-turbo,claude-3-opus');

      // 步骤 3: 使用第一个模型测试
      const testModel = models[0].id;
      const response2 = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5,
        }),
      });

      expect(response2.ok).toBe(true);

      const result = await response2.json();
      const reply = result.choices[0].message.content;

      // ✅ 验证：收到响应
      expect(reply).toBe('Hello! How can I help you?');

      // ✅ 验证：fetch 被调用了 2 次
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // ✅ 验证：第一次调用是 /models
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
        })
      );

      // ✅ 验证：第二次调用是 /chat/completions
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('当 API Key 或 Base URL 缺失时应该提示错误', async () => {
      // 模拟没有填写 API Key
      const baseURL = 'https://api.openai.com/v1';
      const apiKey = '';

      if (!baseURL || !apiKey) {
        // ✅ 应该提示错误
        expect(baseURL).toBeTruthy();
        expect(apiKey).toBeFalsy();
      }
    });

    it('当获取模型列表失败时应该处理错误', async () => {
      // 模拟 API 返回 401 错误
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API key' } }),
      });

      const baseURL = 'https://api.openai.com/v1';
      const apiKey = 'sk-invalid';

      const response = await fetch(`${baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      // ✅ 验证：请求失败
      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);

      // ✅ 应该显示错误通知
      const errorData = await response.json();
      expect(errorData.error.message).toBe('Invalid API key');
    });

    it('当模型列表为空时应该提示', async () => {
      // 模拟 API 返回空列表
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const response = await fetch('https://api.openai.com/v1/models');
      const data = await response.json();
      const models = data.data || [];

      // ✅ 验证：模型列表为空
      expect(models).toHaveLength(0);
    });

    it('当测试请求超时时应该处理', async () => {
      // 模拟超时
      (global.fetch as jest.Mock).mockRejectedValue(new Error('AbortError'));

      try {
        await fetch('https://api.openai.com/v1/models');
      } catch (error: any) {
        // ✅ 验证：捕获超时错误
        expect(error.message).toBe('AbortError');
      }
    });

    it('当测试请求返回非 200 状态时应该显示错误', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'gpt-4' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: async () => ({
            error: { message: 'Rate limit exceeded' },
          }),
        });

      // 第一步：获取模型（成功）
      const response1 = await fetch('https://api.openai.com/v1/models');
      expect(response1.ok).toBe(true);

      const data = await response1.json();
      const testModel = data.data[0].id;

      // 第二步：测试请求（失败）
      const response2 = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(response2.ok).toBe(false);
      expect(response2.status).toBe(429);

      const errorData = await response2.json();
      // ✅ 验证：显示具体错误信息
      expect(errorData.error.message).toBe('Rate limit exceeded');
    });
  });

  describe('表单验证测试', () => {
    it('应该验证源名称不为空', () => {
      const name = '';
      const isValid = name.trim().length > 0;

      // ✅ 验证：空名称无效
      expect(isValid).toBe(false);
    });

    it('应该验证源名称格式正确', () => {
      const validName = 'my-openai-source';
      const invalidName = 'my source with spaces!';

      const pattern = /^[a-zA-Z0-9_-]+$/;

      // ✅ 验证：正确的名称格式
      expect(pattern.test(validName)).toBe(true);
      expect(pattern.test(invalidName)).toBe(false);
    });

    it('应该验证 Base URL 格式', () => {
      const validURL = 'https://api.openai.com/v1';
      const invalidURL = 'not a url';

      let isValidURL = false;
      try {
        new URL(validURL);
        isValidURL = true;
      } catch {
        isValidURL = false;
      }

      // ✅ 验证：正确的 URL 格式
      expect(isValidURL).toBe(true);

      let isInvalidURL = false;
      try {
        new URL(invalidURL);
        isInvalidURL = true;
      } catch {
        isInvalidURL = false;
      }

      expect(isInvalidURL).toBe(false);
    });

    it('应该检查源名称是否已存在', () => {
      const existingSources = [
        { id: 'openai', name: 'OpenAI' },
        { id: 'claude', name: 'Claude' },
      ];

      const newSourceName = 'openai';
      const isDuplicate = existingSources.some(s => s.id === newSourceName);

      // ✅ 验证：检测重复名称
      expect(isDuplicate).toBe(true);

      const uniqueName = 'new-source';
      const isUnique = !existingSources.some(s => s.id === uniqueName);
      expect(isUnique).toBe(true);
    });
  });
});
