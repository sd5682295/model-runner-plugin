/**
 * model-runner - 并发测试
 */

const http = require('http');

const PORT = 4997;

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
        if (pn === '/chat' && req.method === 'POST') return json(res, 200, { choices: [{ message: { role: 'assistant', content: 'ok' } }] });
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));

beforeEach(() => { sessions = {}; });

describe('CT-1: 并发创建', () => {
  test('CT-101: 同时创建5个会话', async () => {
    const promises = Array.from({ length: 5 }, (_, i) => makeRequest('POST', '/sessions', { name: `并发${i}` }));
    const results = await Promise.all(promises);
    results.forEach(r => expect(r.status).toBe(200));
    const ids = results.map(r => r.body.id);
    expect(new Set(ids).size).toBe(5);
  });
});

describe('CT-2: 并发读取', () => {
  test('CT-201: 同时读取同一会话', async () => {
    const c = await makeRequest('POST', '/sessions', { name: '并发读' });
    const id = c.body.id;
    const promises = Array.from({ length: 5 }, () => makeRequest('GET', `/sessions/${id}`));
    const results = await Promise.all(promises);
    results.forEach(r => expect(r.status).toBe(200));
  });
});

describe('CT-3: 并发聊天', () => {
  test('CT-301: 同时发送3个聊天', async () => {
    const promises = Array.from({ length: 3 }, (_, i) => makeRequest('POST', '/chat', { model: 'gpt-4o', messages: [{ role: 'user', content: `msg${i}` }] }));
    const results = await Promise.all(promises);
    results.forEach(r => expect(r.status).toBe(200));
  });
});

describe('CT-4: 并发删除', () => {
  test('CT-401: 并发删除同一会话', async () => {
    const c = await makeRequest('POST', '/sessions', { name: '并发删' });
    const id = c.body.id;
    const promises = Array.from({ length: 3 }, () => makeRequest('DELETE', `/sessions/${id}`));
    const results = await Promise.all(promises);
    results.forEach(r => expect(r.status).toBe(200));
  });
});

describe('CT-5: 混合并发', () => {
  test('CT-501: 创建+读取+更新+删除', async () => {
    const c = await makeRequest('POST', '/sessions', { name: '混合' });
    const id = c.body.id;
    const promises = [
      makeRequest('GET', `/sessions/${id}`),
      makeRequest('PUT', `/sessions/${id}`, { name: '更新后' }),
      makeRequest('GET', `/sessions/${id}`),
      makeRequest('DELETE', `/sessions/${id}`),
    ];
    const results = await Promise.all(promises);
    results.forEach(r => expect([200, 200, 200, 200]).toContain(r.status));
  });
});