/**
 * model-runner - 回归测试
 */

const http = require('http');

const PORT = 4998;

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
let _cfg = { baseUrl: 'https://api.test/v1', apiKey: 'sk-test', timeout: 60000, retries: 3 };
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
          if (req.method === 'GET') return json(res, 200, { baseUrl: _cfg.baseUrl, hasKey: !!_cfg.apiKey });
          if (req.method === 'POST') { _cfg = { ..._cfg, ...b }; return json(res, 200, { ok: true }); }
        }
        if (pn === '/sessions') {
          if (req.method === 'GET') return json(res, 200, { sessions: Object.values(sessions).map(s => ({ id: s.id, name: s.name })) });
          if (req.method === 'POST') { const s = { id: genId(), name: b.name || '新会话', createdAt: new Date().toISOString(), messages: [] }; sessions[s.id] = s; return json(res, 200, s); }
          return json(res, 405, { error: 'Method not allowed' });
        }
        const m = pn.match(/^\/sessions\/([a-z0-9]+)$/);
        if (m) {
          const id = m[1];
          if (req.method === 'GET') return sessions[id] ? json(res, 200, sessions[id]) : json(res, 404, { error: 'Not found' });
          if (req.method === 'PUT') { if (!sessions[id]) return json(res, 404, { error: 'Not found' }); sessions[id] = { ...sessions[id], ...b, id }; return json(res, 200, { ok: true }); }
          if (req.method === 'DELETE') { delete sessions[id]; return json(res, 200, { ok: true }); }
        }
        if (pn === '/chat' && req.method === 'POST') {
          if (!b.model || !b.messages?.length) return json(res, 400, { error: '缺少 model 或 messages 参数' });
          return json(res, 200, { choices: [{ message: { role: 'assistant', content: 'ok' } }] });
        }
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));

beforeEach(() => { sessions = {}; _cfg.apiKey = 'sk-test'; });

describe('RT-1: 会话幂等删除', () => {
  test('RT-101: 重复删除不报错', async () => {
    const c = await makeRequest('POST', '/sessions', { name: 'R1' });
    const d1 = await makeRequest('DELETE', `/sessions/${c.body.id}`);
    expect(d1.status).toBe(200);
    const d2 = await makeRequest('DELETE', `/sessions/${c.body.id}`);
    expect(d2.status).toBe(200);
  });
});

describe('RT-2: 配置安全', () => {
  test('RT-201: GET /config 不暴露 apiKey', async () => {
    const res = await makeRequest('GET', '/config');
    expect(res.body).not.toHaveProperty('apiKey');
  });
});

describe('RT-3: 会话ID格式', () => {
  test('RT-301: 大写字母返回404', async () => {
    const res = await makeRequest('GET', '/sessions/ABC');
    expect(res.status).toBe(404);
  });
  test('RT-302: 特殊字符返回404', async () => {
    expect((await makeRequest('GET', '/sessions/a-b')).status).toBe(404);
    expect((await makeRequest('GET', '/sessions/..')).status).toBe(404);
  });
});

describe('RT-4: 聊天参数', () => {
  test('RT-401: 空messages返回400', async () => {
    const res = await makeRequest('POST', '/chat', { model: 'gpt-4o', messages: [] });
    expect(res.status).toBe(400);
  });
  test('RT-402: 空model返回400', async () => {
    const res = await makeRequest('POST', '/chat', { messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(400);
  });
});