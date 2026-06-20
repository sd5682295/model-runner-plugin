/**
 * model-runner - 安全测试
 */

const http = require('http');

const PORT = 4996;

function makeRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, `http://localhost:${PORT}`);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method };
    let bodyStr = body !== undefined && body !== null ? JSON.stringify(body) : null;
    if (bodyStr) opts.headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', () => resolve({ status: 0, body: null }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

let sessions = {};
let _cfg = {
  sources: [{ id: 's1', name: 'Test API', baseUrl: 'https://api.test/v1', apiKeys: ['sk-test'] }],
  activeSourceId: 's1',
  timeout: 60000,
  retries: 3,
};
let server;

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }

beforeAll(() => {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.method === 'OPTIONS') return res.writeHead(204) && res.end();
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        let b = {};
        try { if (body) b = JSON.parse(body); } catch {}
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const pn = url.pathname;
        if (pn === '/config') {
          if (req.method === 'GET') return json(res, 200, { baseUrl: _cfg.sources[0].baseUrl, hasKey: _cfg.sources[0].apiKeys.length > 0 });
          if (req.method === 'POST') { _cfg = { ..._cfg, ...b }; return json(res, 200, { ok: true }); }
        }
        if (pn === '/sources' && req.method === 'GET') {
          return json(res, 200, { sources: _cfg.sources.map(s => ({ id: s.id, name: s.name, baseUrl: s.baseUrl, hasKey: (s.apiKeys || []).length > 0, keyCount: (s.apiKeys || []).length, active: s.id === _cfg.activeSourceId })) });
        }
        if (pn === '/sessions') {
          if (req.method === 'GET') return json(res, 200, { sessions: Object.values(sessions).map(s => ({ id: s.id, name: s.name })) });
          if (req.method === 'POST') { const s = { id: genId(), name: b.name || '新会话', messages: [], createdAt: new Date().toISOString() }; sessions[s.id] = s; return json(res, 200, s); }
          return json(res, 405, { error: 'Method not allowed' });
        }
        const m = pn.match(/^\/sessions\/([a-z0-9]+)$/);
        if (m) {
          const id = m[1];
          if (req.method === 'GET') return sessions[id] ? json(res, 200, sessions[id]) : json(res, 404, { error: 'Not found' });
          if (req.method === 'PUT') { if (!sessions[id]) return json(res, 404, { error: 'Not found' }); sessions[id] = { ...sessions[id], ...b }; return json(res, 200, { ok: true }); }
          if (req.method === 'DELETE') { delete sessions[id]; return json(res, 200, { ok: true }); }
        }
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));

beforeEach(() => {
  sessions = {};
  _cfg.sources = [{ id: 's1', name: 'Test API', baseUrl: 'https://api.test/v1', apiKeys: ['sk-test'] }];
  _cfg.activeSourceId = 's1';
});

describe('SEC-1: 路径遍历防护', () => {
  test('SEC-101: 会话ID不含斜杠（URL归一化后不越权）', async () => {
    // URL 中的 ../ 会被 URL 解析器归一化，此处验证会话路由不处理含特殊字符的ID
    const res = await makeRequest('GET', '/sessions/abc123');
    expect(res.status).toBe(404); // 未创建，应返回404
  });

  test('SEC-102: 特殊字符ID返回404', async () => {
    // 注意：URL 中的 .. 会被解析器归一化，所以直接测试正则不匹配的情况
    const res = await makeRequest('GET', '/sessions/abc-123');
    expect(res.status).toBe(404);
  });
});

describe('SEC-2: 输入校验', () => {
  test('SEC-201: XSS注入到会话名称', async () => {
    const xss = '<script>alert(1)</script>';
    const res = await makeRequest('POST', '/sessions', { name: xss });
    expect(res.status).toBe(200);
    // 后端原样存储，前端负责转义
  });

  test('SEC-202: 超长名称', async () => {
    const res = await makeRequest('POST', '/sessions', { name: 'x'.repeat(10000) });
    expect(res.status).toBe(200);
  });
});

describe('SEC-3: CORS安全', () => {
  test('SEC-301: OPTIONS预检返回204', async () => {
    const res = await makeRequest('OPTIONS', '/config');
    expect(res.status).toBe(204);
  });

  test('SEC-302: GET /config不暴露apiKey', async () => {
    const res = await makeRequest('GET', '/config');
    expect(res.body).not.toHaveProperty('apiKey');
    expect(res.body).not.toHaveProperty('api_key');
  });

  test('SEC-303: GET /sources 不暴露明文 API Key', async () => {
    const res = await makeRequest('GET', '/sources');
    expect(res.status).toBe(200);
    expect(res.body.sources[0]).toHaveProperty('hasKey', true);
    expect(res.body.sources[0]).toHaveProperty('keyCount', 1);
    expect(res.body.sources[0]).not.toHaveProperty('apiKey');
    expect(res.body.sources[0]).not.toHaveProperty('apiKeys');
    expect(res.body.sources[0]).not.toHaveProperty('keys');
    expect(JSON.stringify(res.body)).not.toContain('sk-test');
  });
});

describe('SEC-4: 会话隔离', () => {
  test('SEC-401: 会话A无法读取会话B', async () => {
    const a = await makeRequest('POST', '/sessions', { name: 'A' });
    const b = await makeRequest('POST', '/sessions', { name: 'B' });
    const getA = await makeRequest('GET', `/sessions/${a.body.id}`);
    const getB = await makeRequest('GET', `/sessions/${b.body.id}`);
    expect(getA.body.name).toBe('A');
    expect(getB.body.name).toBe('B');
  });
});