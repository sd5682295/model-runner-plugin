/**
 * model-runner - 集成测试
 * 内嵌 mock 服务器，覆盖所有 API 路由
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = 4001;
const SESSIONS_DIR = path.join(__dirname, '..', '..', 'sessions-mr-test');
const CONFIG_FILE = path.join(__dirname, '..', '..', 'config-mr-test.json');

function rmdir(dir) {
  try { if (fs.existsSync(dir)) { fs.readdirSync(dir).forEach(f => fs.unlinkSync(path.join(dir, f))); fs.rmdirSync(dir); } } catch {}
}

function makeRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, `http://localhost:${PORT}`);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + (url.search || ''), method };
    let bodyStr = null;
    if (body !== undefined && body !== null) {
      bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) };
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, headers: res.headers, body: data }); } });
    });
    req.on('error', () => resolve({ status: 0, body: null }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

let sessions = {};
let prompts = [];
let _cfg = {
  sources: [
    { id: 's1', name: 'DMXAPI', baseUrl: 'https://api.dmxapi.cn/v1', apiKeys: ['test-key'] },
    { id: 's2', name: 'Backup', baseUrl: 'https://backup.test/v1', apiKeys: ['backup-key'] },
  ],
  activeSourceId: 's1',
  timeout: 60000,
  retries: 3,
  modelRoutes: { 'gpt-4o': { preferredPlatforms: ['s2', 's1'], disabledPlatforms: [] } },
};
let server;

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)); }

beforeAll((done) => {
  rmdir(SESSIONS_DIR);
  try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch {}
  server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }) && res.end();
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let jsonBody = {};
      try { if (body) jsonBody = JSON.parse(body); } catch {}
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const pn = url.pathname;

      if (pn === '/') return res.writeHead(200, { 'Content-Type': 'text/html' }) && res.end('<html>Model Runner</html>');
      if (pn === '/config' && req.method === 'GET') return json(res, 200, { baseUrl: _cfg.sources[0].baseUrl, hasKey: _cfg.sources[0].apiKeys.length > 0, timeout: _cfg.timeout, retries: _cfg.retries });
      if (pn === '/config' && req.method === 'POST') {
        if (!body || body.trim() === '') return json(res, 400, { error: 'Empty body' });
        try { JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
        try { _cfg = { ..._cfg, ...jsonBody }; json(res, 200, { ok: true, baseUrl: _cfg.sources[0].baseUrl, hasKey: _cfg.sources[0].apiKeys.length > 0 }); } catch (e) { json(res, 400, { error: e.message }); }
        return;
      }
      if (pn === '/models' && req.method === 'GET') return json(res, 200, { data: [{ id: 'gpt-4o' }, { id: 'claude-3' }] });
      if (pn === '/models/catalog' && req.method === 'GET') return json(res, 200, {
        models: [
          { id: 'claude-3', displayName: 'claude-3', platformCount: 1, preferredSourceName: 'DMXAPI', routeSummary: 'DMXAPI', health: 'healthy', platforms: [{ sourceId: 's1', sourceName: 'DMXAPI', health: 'healthy' }] },
          { id: 'gpt-4o', displayName: 'gpt-4o', platformCount: 2, preferredSourceName: 'Backup', routeSummary: 'Backup → DMXAPI', health: 'healthy', platforms: [{ sourceId: 's1', sourceName: 'DMXAPI', health: 'healthy' }, { sourceId: 's2', sourceName: 'Backup', health: 'healthy' }] },
        ],
        timestamp: new Date().toISOString(),
      });
      if (pn === '/v1/chat/completions' && req.method === 'POST') {
        if (!jsonBody.model) return json(res, 400, { error: '缺少 model 参数' });
        if (!jsonBody.messages?.length) return json(res, 400, { error: '缺少 messages 参数' });
        return json(res, 200, { choices: [{ message: { role: 'assistant', content: 'Mock: ' + jsonBody.messages[0].content } }] });
      }
      if (pn === '/v1/chat/completions') return json(res, 405, { error: 'Method not allowed' });
      // 非JSON上游响应测试（复刻真实bug：api.dmxapi.cn证书过期时返回HTML）
      if (pn === '/models-html' && req.method === 'GET') return res.writeHead(200, { 'Content-Type': 'text/html' }) && res.end('<!doctype html><html><body>Error</body></html>');
      if (pn === '/chat' && req.method === 'POST') {
        if (!jsonBody.model) return json(res, 400, { error: '缺少 model 参数' });
        if (!jsonBody.messages?.length) return json(res, 400, { error: '缺少 messages 参数' });
        return json(res, 200, { choices: [{ message: { role: 'assitant', content: 'Mock: ' + jsonBody.messages[0].content } }] });
      }
      if (pn === '/chat/stream' && req.method === 'POST') {
        if (!_cfg.sources[0].baseUrl || !_cfg.sources[0].apiKeys.length) return json(res, 400, { error: '未配置 API' });
        if (!jsonBody.model || !jsonBody.messages?.length) return json(res, 400, { error: '参数错误' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        res.write('data: {"choices":[{"delta":{"content":"Mock"}}]}\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      if (pn === '/sessions' && req.method === 'GET') return json(res, 200, { sessions: Object.values(sessions).map(s => ({ id: s.id, name: s.name, model: s.model, updatedAt: s.updatedAt })) });
      if (pn === '/sessions' && req.method === 'POST') {
        const now = new Date().toISOString();
        const s = { id: genId(), name: jsonBody.name || '新会话', model: jsonBody.model || '', system: jsonBody.system || '', createdAt: now, updatedAt: now, messages: jsonBody.messages || [] };
        sessions[s.id] = s;
        return json(res, 200, s);
      }
      if (pn === '/sessions' && (req.method === 'DELETE' || req.method === 'PUT')) return json(res, 405, { error: 'Method not allowed' });
      const m = pn.match(/^\/sessions\/([a-z0-9]+)$/);
      if (m) {
        const id = m[1];
        if (req.method === 'GET') return sessions[id] ? json(res, 200, sessions[id]) : json(res, 404, { error: '会话不存在' });
        if (req.method === 'PUT') { if (!sessions[id]) return json(res, 404, { error: '会话不存在' }); sessions[id] = { ...sessions[id], ...jsonBody, id, updatedAt: new Date().toISOString() }; return json(res, 200, { ok: true }); }
        if (req.method === 'DELETE') { delete sessions[id]; return json(res, 200, { ok: true }); }
      }
      // /prompts routes
      if (pn === '/prompts' && req.method === 'GET') return json(res, 200, { prompts });
      if (pn === '/prompts' && req.method === 'POST') {
        const item = { id: genId(), name: jsonBody.name || '未命名模板', content: jsonBody.content || '' };
        prompts.unshift(item);
        return json(res, 200, item);
      }
      const pr = pn.match(/^\/prompts\/([a-z0-9]+)$/);
      if (pr && req.method === 'DELETE') { prompts = prompts.filter(p => p.id !== pr[1]); return json(res, 200, { ok: true }); }
      json(res, 404, { error: 'Not found' });
    });
  });
  server.listen(PORT, done);
});

afterAll((done) => { rmdir(SESSIONS_DIR); try { fs.unlinkSync(CONFIG_FILE); } catch {}; if (server) server.close(done); else done(); });
beforeEach(() => { sessions = {}; prompts = []; });

describe('IT-1: 配置 API', () => {
  test('IT-101: GET /config 返回配置（不含key）', async () => {
    const res = await makeRequest('GET', '/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('baseUrl');
    expect(res.body).toHaveProperty('hasKey');
    expect(res.body).not.toHaveProperty('apiKey');
  });
  test('IT-102: POST /config 保存配置', async () => {
    const res = await makeRequest('POST', '/config', { baseUrl: 'https://api.test.com', timeout: 30000 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
  test('IT-103: POST /config 无效JSON返回400', async () => {
    const res = await makeRequest('POST', '/config', 'not json');
    expect(res.status).toBe(400);
  });
});

describe('IT-2: 模型列表', () => {
  test('IT-201: GET /models 返回模型数组', async () => {
    const res = await makeRequest('GET', '/models');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('IT-202: GET /models/catalog 返回只读模型目录', async () => {
    const res = await makeRequest('GET', '/models/catalog');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.models)).toBe(true);
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body.models[0]).toHaveProperty('id');
    expect(res.body.models[0]).toHaveProperty('platformCount');
    expect(res.body.models[0]).not.toHaveProperty('preferredPlatforms');
    expect(res.body.models[0]).not.toHaveProperty('disabledPlatforms');
  });
});

describe('IT-3: 聊天 API', () => {
  test('IT-301: POST /chat 正常对话', async () => {
    const res = await makeRequest('POST', '/chat', { model: 'gpt-4o', messages: [{ role: 'user', content: '你好' }] });
    expect(res.status).toBe(200);
    expect(res.body.choices).toBeDefined();
  });
  test('IT-302: POST /chat 缺少model返回400', async () => {
    const res = await makeRequest('POST', '/chat', { messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('model');
  });
  test('IT-303: POST /chat 缺少messages返回400', async () => {
    const res = await makeRequest('POST', '/chat', { model: 'gpt-4o' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('messages');
  });
  test('IT-304: POST /chat 非JSON返回400', async () => {
    const res = await makeRequest('POST', '/chat', 'plain text');
    expect(res.status).toBe(400);
  });
  test('IT-305: POST /chat/stream 流式响应', async () => {
    const res = await makeRequest('POST', '/chat/stream', { model: 'gpt-4o', messages: [{ role: 'user', content: 'hello' }] });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  test('IT-306: POST /v1/chat/completions 兼容 OpenAI 路径', async () => {
    const res = await makeRequest('POST', '/v1/chat/completions', { model: 'gpt-4o', messages: [{ role: 'user', content: '你好' }] });
    expect(res.status).toBe(200);
    expect(res.body.choices).toBeDefined();
  });

  test('IT-307: GET /v1/chat/completions 返回405', async () => {
    const res = await makeRequest('GET', '/v1/chat/completions');
    expect(res.status).toBe(405);
  });
});

describe('IT-4: 会话 CRUD', () => {
  test('IT-401: POST /sessions 创建会话', async () => {
    const res = await makeRequest('POST', '/sessions', { name: '测试会话', model: 'gpt-4o' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('测试会话');
  });
  test('IT-402: GET /sessions 列出所有会话', async () => {
    await makeRequest('POST', '/sessions', { name: 'S1' });
    await makeRequest('POST', '/sessions', { name: 'S2' });
    const res = await makeRequest('GET', '/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBe(2);
  });
  test('IT-403: GET /sessions/:id 读取会话', async () => {
    const c = await makeRequest('POST', '/sessions', { name: '详情会话', model: 'claude-3' });
    const id = c.body.id;
    const res = await makeRequest('GET', `/sessions/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('详情会话');
  });
  test('IT-404: GET /sessions/:id 不存在返回404', async () => {
    const res = await makeRequest('GET', '/sessions/nonexistentid');
    expect(res.status).toBe(404);
  });
  test('IT-405: PUT /sessions/:id 更新会话', async () => {
    const c = await makeRequest('POST', '/sessions', { name: '旧名称' });
    const id = c.body.id;
    await makeRequest('PUT', `/sessions/${id}`, { name: '新名称', model: 'gpt-4o-mini' });
    const g = await makeRequest('GET', `/sessions/${id}`);
    expect(g.body.name).toBe('新名称');
  });
  test('IT-406: PUT /sessions/:id 不存在返回404', async () => {
    const res = await makeRequest('PUT', '/sessions/badid', { name: 'x' });
    expect(res.status).toBe(404);
  });
  test('IT-407: DELETE /sessions/:id 删除会话', async () => {
    const c = await makeRequest('POST', '/sessions', { name: '待删除' });
    const id = c.body.id;
    await makeRequest('DELETE', `/sessions/${id}`);
    const g = await makeRequest('GET', `/sessions/${id}`);
    expect(g.status).toBe(404);
  });
  test('IT-408: DELETE /sessions/:id 不存在返回200（幂等）', async () => {
    const res = await makeRequest('DELETE', '/sessions/nonexistentid');
    expect(res.status).toBe(200);
  });
  test('IT-409: 会话ID只允许小写字母数字', async () => {
    const res = await makeRequest('GET', '/sessions/ABC123');
    expect(res.status).toBe(404);
  });
  test('IT-410: 会话支持system字段', async () => {
    const c = await makeRequest('POST', '/sessions', { name: 'Sys', system: '你是一个诗人' });
    const g = await makeRequest('GET', `/sessions/${c.body.id}`);
    expect(g.body.system).toBe('你是一个诗人');
  });
  test('IT-411: 会话支持messages字段', async () => {
    const c = await makeRequest('POST', '/sessions', { name: 'Msgs', messages: [{ role: 'user', content: 'hi' }] });
    const g = await makeRequest('GET', `/sessions/${c.body.id}`);
    expect(Array.isArray(g.body.messages)).toBe(true);
    expect(g.body.messages[0].content).toBe('hi');
  });
});

describe('IT-5: 错误处理', () => {
  test('IT-501: 未知路由返回404', async () => {
    const res = await makeRequest('GET', '/api/unknown');
    expect(res.status).toBe(404);
  });
  test('IT-502: 不支持的HTTP方法返回405', async () => {
    const res = await makeRequest('DELETE', '/sessions');
    expect(res.status).toBe(405);
  });
  test('IT-503: CORS预检请求返回204', async () => {
    const res = await makeRequest('OPTIONS', '/config');
    expect(res.status).toBe(204);
  });

  test('IT-504: favicon.ico 返回404', async () => {
    const res = await makeRequest('GET', '/favicon.ico');
    expect(res.status).toBe(404);
  });
});

describe('IT-6: Prompts API', () => {
  test('IT-601: GET /prompts 返回空数组', async () => {
    const res = await makeRequest('GET', '/prompts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.prompts)).toBe(true);
    expect(res.body.prompts.length).toBe(0);
  });

  test('IT-602: POST /prompts 创建模板', async () => {
    const res = await makeRequest('POST', '/prompts', { name: '诗人模式', content: '你是一个诗人' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('诗人模式');
    expect(res.body.content).toBe('你是一个诗人');
    expect(res.body.id).toBeDefined();
  });

  test('IT-603: POST /prompts 缺字段用默认值', async () => {
    const res = await makeRequest('POST', '/prompts', {});
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('未命名模板');
    expect(res.body.content).toBe('');
  });

  test('IT-604: DELETE /prompts/:id 删除模板', async () => {
    const c = await makeRequest('POST', '/prompts', { name: 'T', content: 'C' });
    const id = c.body.id;
    const res = await makeRequest('DELETE', `/prompts/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('IT-605: DELETE /prompts/:id 不存在返回200（幂等）', async () => {
    const res = await makeRequest('DELETE', '/prompts/nonexistent');
    expect(res.status).toBe(200);
  });

  test('IT-606: GET /prompts 包含已创建的模板', async () => {
    await makeRequest('POST', '/prompts', { name: '列表验证', content: '内容' });
    const res = await makeRequest('GET', '/prompts');
    expect(res.status).toBe(200);
    expect(res.body.prompts.length).toBeGreaterThan(0);
    expect(res.body.prompts.find(p => p.name === '列表验证')).toBeDefined();
  });
});
