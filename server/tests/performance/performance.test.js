/**
 * model-runner - 性能测试
 */

const http = require('http');

const PORT = 5110;

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

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }

let sessions = {};
let sources = [];
let prompts = [];

let server;

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
        }
        const m = pn.match(/^\/sessions\/([a-z0-9]+)$/);
        if (m) {
          const id = m[1];
          if (req.method === 'GET') return sessions[id] ? json(res, 200, sessions[id]) : json(res, 404, { error: 'Not found' });
          if (req.method === 'PUT') { sessions[id] = { ...sessions[id], ...b }; return json(res, 200, { ok: true }); }
          if (req.method === 'DELETE') { delete sessions[id]; return json(res, 200, { ok: true }); }
        }
        if (pn === '/sources') {
          if (req.method === 'GET') return json(res, 200, { sources });
          if (req.method === 'POST') { const s = { id: genId(), name: b.name || b.baseUrl, baseUrl: b.baseUrl, apiKeys: b.apiKeys || [] }; sources.push(s); return json(res, 200, s); }
        }
        if (pn === '/prompts') {
          if (req.method === 'GET') return json(res, 200, { prompts });
          if (req.method === 'POST') { const p = { id: genId(), name: b.name || '模板', content: b.content || '' }; prompts.unshift(p); return json(res, 200, p); }
        }
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));
beforeEach(() => { sessions = {}; sources = []; prompts = []; });

describe('PERF-1: 会话批量创建', () => {
  test('PERF-101: 100 个会话创建 < 2s', async () => {
    const count = 100;
    const t0 = Date.now();
    const promises = Array.from({ length: count }, (_, i) => makeRequest('POST', '/sessions', { name: `Perf${i}` }));
    const results = await Promise.all(promises);
    const elapsed = Date.now() - t0;
    results.forEach(r => expect(r.status).toBe(200));
    expect(elapsed).toBeLessThan(2000);
  });

  test('PERF-102: 100 个会话 ID 唯一', async () => {
    const promises = Array.from({ length: 100 }, (_, i) => makeRequest('POST', '/sessions', { name: `U${i}` }));
    const results = await Promise.all(promises);
    const ids = results.map(r => r.body.id);
    expect(new Set(ids).size).toBe(100);
  });
});

describe('PERF-2: 会话列表读取', () => {
  test('PERF-201: 100 个会话列表 < 500ms', async () => {
    const promises = Array.from({ length: 100 }, (_, i) => makeRequest('POST', '/sessions', { name: `L${i}` }));
    await Promise.all(promises);
    const t0 = Date.now();
    const res = await makeRequest('GET', '/sessions');
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBe(100);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('PERF-3: 会话并发读写', () => {
  test('PERF-301: 50 并发读写 < 2s', async () => {
    const promises = Array.from({ length: 50 }, async (_, i) => {
      const c = await makeRequest('POST', '/sessions', { name: `RW${i}` });
      const id = c.body.id;
      await makeRequest('PUT', `/sessions/${id}`, { name: `Updated${i}` });
      return makeRequest('GET', `/sessions/${id}`);
    });
    const t0 = Date.now();
    const results = await Promise.all(promises);
    const elapsed = Date.now() - t0;
    results.forEach(r => expect(r.status).toBe(200));
    expect(elapsed).toBeLessThan(2000);
  });

  test('PERF-302: 50 并发删除 < 1s', async () => {
    const promises = Array.from({ length: 50 }, (_, i) => makeRequest('POST', '/sessions', { name: `Del${i}` }));
    const created = await Promise.all(promises);
    const ids = created.map(r => r.body.id);
    const t0 = Date.now();
    const delPromises = ids.map(id => makeRequest('DELETE', `/sessions/${id}`));
    const results = await Promise.all(delPromises);
    const elapsed = Date.now() - t0;
    results.forEach(r => expect(r.status).toBe(200));
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('PERF-4: Prompt 模板', () => {
  test('PERF-401: 100 个模板创建 < 1s', async () => {
    const t0 = Date.now();
    const promises = Array.from({ length: 100 }, (_, i) => makeRequest('POST', '/prompts', { name: `P${i}`, content: `内容${i}` }));
    const results = await Promise.all(promises);
    const elapsed = Date.now() - t0;
    results.forEach(r => expect(r.status).toBe(200));
    expect(elapsed).toBeLessThan(1000);
  });

  test('PERF-402: 100 个模板列表 < 200ms', async () => {
    const promises = Array.from({ length: 100 }, (_, i) => makeRequest('POST', '/prompts', { name: `List${i}` }));
    await Promise.all(promises);
    const t0 = Date.now();
    const res = await makeRequest('GET', '/prompts');
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(res.body.prompts.length).toBe(100);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('PERF-5: Sources 管理', () => {
  test('PERF-501: 50 个来源创建 < 1s', async () => {
    const t0 = Date.now();
    const promises = Array.from({ length: 50 }, (_, i) => makeRequest('POST', '/sources', { name: `S${i}`, baseUrl: `https://api${i}.com` }));
    const results = await Promise.all(promises);
    const elapsed = Date.now() - t0;
    results.forEach(r => expect(r.status).toBe(200));
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('PERF-6: 并发混合操作', () => {
  test('PERF-601: 30 并发混合操作 < 3s', async () => {
    const t0 = Date.now();
    const promises = Array.from({ length: 30 }, async (_, i) => {
      const ops = [];
      ops.push(makeRequest('POST', '/sessions', { name: `S${i}` }));
      ops.push(makeRequest('POST', '/prompts', { name: `P${i}` }));
      ops.push(makeRequest('POST', '/sources', { name: `Src${i}`, baseUrl: `https://s${i}.com` }));
      return Promise.all(ops);
    });
    const results = await Promise.all(promises);
    const elapsed = Date.now() - t0;
    results.flat().forEach(r => expect(r.status).toBe(200));
    expect(elapsed).toBeLessThan(3000);
  });
});
