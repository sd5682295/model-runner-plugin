import { App, Modal, Notice } from 'obsidian';
import type ModelRunnerPlugin from './main';

export class ApiDocModal extends Modal {
  constructor(app: App, private plugin: ModelRunnerPlugin) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('api-doc-modal');

    // 标题
    contentEl.createEl('h2', { text: '📡 Model Runner API' });

    // 标签页切换
    const tabContainer = contentEl.createDiv({ cls: 'api-tabs' });
    const docTab = tabContainer.createEl('button', { text: '📖 文档', cls: 'api-tab active' });
    const testTab = tabContainer.createEl('button', { text: '🧪 测试', cls: 'api-tab' });

    // 内容区域
    const docContent = contentEl.createDiv({ cls: 'api-content' });
    const testContent = contentEl.createDiv({ cls: 'api-content', attr: { style: 'display: none;' } });

    // 标签切换逻辑
    docTab.onclick = () => {
      docTab.addClass('active');
      testTab.removeClass('active');
      docContent.style.display = 'block';
      testContent.style.display = 'none';
    };

    testTab.onclick = () => {
      testTab.addClass('active');
      docTab.removeClass('active');
      testContent.style.display = 'block';
      docContent.style.display = 'none';
    };

    // 渲染文档
    this.renderDocumentation(docContent);

    // 渲染测试工具
    this.renderTestTool(testContent);
  }

  private renderDocumentation(container: HTMLElement): void {
    const port = this.plugin.settings.port;
    const baseUrl = `http://localhost:${port}`;

    // 基本信息
    const infoSection = container.createDiv({ cls: 'api-section' });
    infoSection.createEl('h3', { text: '基本信息' });

    const infoTable = infoSection.createEl('table', { cls: 'api-table' });
    infoTable.innerHTML = `
      <tr><td><strong>基础 URL</strong></td><td><code>${baseUrl}</code></td></tr>
      <tr><td><strong>协议</strong></td><td>HTTP</td></tr>
      <tr><td><strong>格式</strong></td><td>JSON</td></tr>
      <tr><td><strong>兼容性</strong></td><td>OpenAI API 格式</td></tr>
    `;

    // 端点列表
    const endpointsSection = container.createDiv({ cls: 'api-section' });
    endpointsSection.createEl('h3', { text: 'API 端点' });

    // 1. POST /chat
    this.renderEndpoint(endpointsSection, {
      method: 'POST',
      path: '/chat',
      description: '非流式聊天补全',
      request: {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: '你好' }
        ],
        temperature: 0.7,
        max_tokens: 1000
      },
      response: {
        id: 'msg_123',
        model: 'claude-3-5-sonnet-20241022',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '你好！有什么我可以帮助你的吗？'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      }
    });

    // 2. POST /chat/stream
    this.renderEndpoint(endpointsSection, {
      method: 'POST',
      path: '/chat/stream',
      description: '流式聊天补全（SSE）',
      request: {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: '讲个笑话' }
        ],
        stream: true
      },
      response: 'data: {"choices":[{"delta":{"content":"为什么"}}]}\ndata: {"choices":[{"delta":{"content":"程序员"}}]}\ndata: [DONE]'
    });

    // 3. GET /models
    this.renderEndpoint(endpointsSection, {
      method: 'GET',
      path: '/models',
      description: '获取可用模型列表',
      response: {
        data: [
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
        ]
      }
    });

    // 使用示例
    const examplesSection = container.createDiv({ cls: 'api-section' });
    examplesSection.createEl('h3', { text: '使用示例' });

    // cURL 示例
    const curlExample = examplesSection.createDiv({ cls: 'code-example' });
    curlExample.createEl('h4', { text: 'cURL' });
    curlExample.createEl('pre').createEl('code', {
      text: `curl -X POST ${baseUrl}/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "你好"}]
  }'`
    });

    // JavaScript 示例
    const jsExample = examplesSection.createDiv({ cls: 'code-example' });
    jsExample.createEl('h4', { text: 'JavaScript' });
    jsExample.createEl('pre').createEl('code', {
      text: `const response = await fetch('${baseUrl}/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: '你好' }]
  })
});
const data = await response.json();
console.log(data.choices[0].message.content);`
    });

    // Python 示例
    const pythonExample = examplesSection.createDiv({ cls: 'code-example' });
    pythonExample.createEl('h4', { text: 'Python' });
    pythonExample.createEl('pre').createEl('code', {
      text: `import requests

response = requests.post('${baseUrl}/chat', json={
    'model': 'claude-3-5-sonnet-20241022',
    'messages': [{'role': 'user', 'content': '你好'}]
})
data = response.json()
print(data['choices'][0]['message']['content'])`
    });
  }

  private renderEndpoint(container: HTMLElement, config: any): void {
    const endpoint = container.createDiv({ cls: 'api-endpoint' });

    // 方法和路径
    const header = endpoint.createDiv({ cls: 'endpoint-header' });
    header.createEl('span', { text: config.method, cls: `method-badge method-${config.method.toLowerCase()}` });
    header.createEl('code', { text: config.path, cls: 'endpoint-path' });

    // 描述
    endpoint.createEl('p', { text: config.description, cls: 'endpoint-description' });

    // 请求示例
    if (config.request) {
      endpoint.createEl('h5', { text: '请求' });
      endpoint.createEl('pre').createEl('code', {
        text: JSON.stringify(config.request, null, 2)
      });
    }

    // 响应示例
    endpoint.createEl('h5', { text: '响应' });
    const responseText = typeof config.response === 'string'
      ? config.response
      : JSON.stringify(config.response, null, 2);
    endpoint.createEl('pre').createEl('code', { text: responseText });
  }

  private renderTestTool(container: HTMLElement): void {
    const port = this.plugin.settings.port;
    const baseUrl = `http://localhost:${port}`;

    container.createEl('h3', { text: 'API 测试工具' });

    // 端点选择
    const endpointSelect = container.createEl('select', { cls: 'api-test-select' });
    endpointSelect.innerHTML = `
      <option value="/chat">POST /chat - 聊天补全</option>
      <option value="/chat/stream">POST /chat/stream - 流式补全</option>
      <option value="/models">GET /models - 模型列表</option>
    `;

    // 请求参数
    const paramsSection = container.createDiv({ cls: 'api-test-params' });
    paramsSection.createEl('h4', { text: '请求参数' });

    const textarea = paramsSection.createEl('textarea', {
      cls: 'api-test-textarea',
      attr: {
        rows: '12',
        placeholder: '输入 JSON 格式的请求参数...'
      }
    });

    // 默认参数
    textarea.value = JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: '你好，请介绍一下你自己' }
      ],
      temperature: 0.7,
      max_tokens: 500
    }, null, 2);

    // 发送按钮
    const sendBtn = container.createEl('button', {
      text: '📤 发送请求',
      cls: 'mod-cta api-test-button'
    });

    // 响应区域
    const responseSection = container.createDiv({ cls: 'api-test-response' });
    responseSection.createEl('h4', { text: '响应结果' });
    const responseBox = responseSection.createEl('pre', { cls: 'api-response-box' });
    responseBox.createEl('code', { text: '等待发送请求...' });

    // 发送请求
    sendBtn.onclick = async () => {
      const endpoint = endpointSelect.value;
      const fullUrl = `${baseUrl}${endpoint}`;

      try {
        sendBtn.disabled = true;
        sendBtn.setText('⏳ 发送中...');
        responseBox.empty();
        responseBox.createEl('code', { text: '正在请求...' });

        let response;
        const isGet = endpoint === '/models';

        if (isGet) {
          response = await fetch(fullUrl);
        } else {
          const params = JSON.parse(textarea.value);
          response = await fetch(fullUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
          });
        }

        const data = await response.json();

        // 显示响应
        responseBox.empty();
        const code = responseBox.createEl('code');

        if (response.ok) {
          code.setText(JSON.stringify(data, null, 2));
          code.addClass('success');
          new Notice('✅ 请求成功');
        } else {
          code.setText(JSON.stringify(data, null, 2));
          code.addClass('error');
          new Notice('❌ 请求失败');
        }

      } catch (error: any) {
        responseBox.empty();
        const code = responseBox.createEl('code', {
          text: `错误: ${error.message}`
        });
        code.addClass('error');
        new Notice(`❌ 请求失败: ${error.message}`);
      } finally {
        sendBtn.disabled = false;
        sendBtn.setText('📤 发送请求');
      }
    };

    // 端点切换时更新默认参数
    endpointSelect.onchange = () => {
      const endpoint = endpointSelect.value;

      if (endpoint === '/models') {
        textarea.value = '// GET 请求无需参数';
        textarea.disabled = true;
      } else if (endpoint === '/chat/stream') {
        textarea.disabled = false;
        textarea.value = JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [
            { role: 'user', content: '写一首关于编程的诗' }
          ],
          stream: true
        }, null, 2);
      } else {
        textarea.disabled = false;
        textarea.value = JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [
            { role: 'user', content: '你好，请介绍一下你自己' }
          ],
          temperature: 0.7,
          max_tokens: 500
        }, null, 2);
      }
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
