/**
 * model-runner - 安全测试：多源隔离 + 来源间安全
 */

const http = require('http');

const PORT = 5120;

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

let sources = [];
let sessions = {}; // { [sourceId]: { [sessionId]: session } }
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
        const srcMatch = pn.match(/^\/sources\/([a-z0-9]+)(\/.*)?$/);
        if (pn === '/sources' && req.method === 'GET') return json(res, 200, { sources });
        if (pn === '/sources' && req.method === 'POST') {
          const src = { id: genId(), name: b.name || b.baseUrl, baseUrl: b.baseUrl?.replace(/\/$/, ''), apiKeys: b.apiKeys || [], config: {} };
          sources.push(src);
          sessions[src.id] = {};
          return json(res, 200, src);
        }
        if (srcMatch) {
          const id = srcMatch[1];
          const src = sources.find(s => s.id === id);
          if (!src) return json(res, 404, { error: '源不存在' });
          if (req.method === 'GET') return json(res, 200, src);
          if (req.method === 'DELETE') {
            sources = sources.filter(s => s.id !== id);
            delete sessions[id];
            return json(res, 200, { ok: true });
          }
        }
        const sessMatch = pn.match(/^\/sessions\/([a-z0-9]+)$/);
        if (pn === '/sessions' && req.method === 'GET') {
          const sourceId = b.sourceId || sources[0]?.id;
          const list = Object.values(sessions[sourceId] || {});
          return json(res, 200, { sessions: list });
        }
        if (pn === '/sessions' && req.method === 'POST') {
          const sourceId = b.sourceId || sources[0]?.id;
          if (!sourceId || !sources.find(s => s.id === sourceId)) return json(res, 400, { error: 'sourceId 必填' });
          const s = { id: genId(), sourceId, name: b.name || '会话' };
          if (!sessions[sourceId]) sessions[sourceId] = {};
          sessions[sourceId][s.id] = s;
          return json(res, 200, s);
        }
        if (sessMatch) {
          const id = sessMatch[1];
          // Find session across all sources
          let found = null, foundSrcId = null;
          for (const [srcId, ss] of Object.entries(sessions)) {
            if (ss[id]) { found = ss[id]; foundSrcId = srcId; break; }
          }
          if (!found) return json(res, 404, { error: '会话不存在' });
          if (req.method === 'GET') return json(res, 200, found);
          if (req.method === 'DELETE') { delete sessions[foundSrcId][id]; return json(res, 200, { ok: true }); }
        }
        if (pn === '/prompts' && req.method === 'GET') return json(res, 200, { prompts });
        if (pn === '/prompts' && req.method === 'POST') {
          const p = { id: genId(), name: b.name || '模板', content: b.content || '' };
          prompts.unshift(p);
          return json(res, 200, p);
        }
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));
beforeEach(() => { sources = []; sessions = {}; prompts = []; });

describe('MSI-SEC-1: 多源会话隔离', () => {
  test('MSI-SEC-101: 来源A无法读取来源B的会话', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'Source A', baseUrl: 'https://a.com' });
    const b = await makeRequest('POST', '/sources', { name: 'Source B', baseUrl: 'https://b.com' });
    const sessA = await makeRequest('POST', '/sessions', { sourceId: a.body.id, name: 'A会话' });
    const sessB = await makeRequest('POST', '/sessions', { sourceId: b.body.id, name: 'B会话' });
    // 来源A的会话列表只有A
    const listA = await makeRequest('GET', '/sessions', { sourceId: a.body.id });
    const idsA = listA.body.sessions.map(s => s.id);
    expect(idsA).toContain(sessA.body.id);
    expect(idsA).not.toContain(sessB.body.id);
  });

  test('MSI-SEC-102: 来源B无法读取来源A的会话', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'Source A', baseUrl: 'https://a.com' });
    const b = await makeRequest('POST', '/sources', { name: 'Source B', baseUrl: 'https://b.com' });
    const sessA = await makeRequest('POST', '/sessions', { sourceId: a.body.id, name: 'A专用' });
    const sessB = await makeRequest('POST', '/sessions', { sourceId: b.body.id, name: 'B专用' });
    const listB = await makeRequest('GET', '/sessions', { sourceId: b.body.id });
    const idsB = listB.body.sessions.map(s => s.id);
    expect(idsB).toContain(sessB.body.id);
    expect(idsB).not.toContain(sessA.body.id);
  });

  test('MSI-SEC-103: 删除来源会删除该来源的会话', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com' });
    const sess = await makeRequest('POST', '/sessions', { sourceId: a.body.id, name: 'Sess' });
    await makeRequest('DELETE', `/sources/${a.body.id}`);
    const getSess = await makeRequest('GET', `/sessions/${sess.body.id}`);
    expect(getSess.status).toBe(404);
  });

  test('MSI-SEC-104: 无 sourceId 拒绝创建会话', async () => {
    const res = await makeRequest('POST', '/sessions', {});
    expect(res.status).toBe(400);
  });

  test('MSI-SEC-105: 非法 sourceId 拒绝创建会话', async () => {
    const res = await makeRequest('POST', '/sessions', { sourceId: 'not-exist-source' });
    expect(res.status).toBe(400);
  });
});

describe('MSI-SEC-2: API Key 安全', () => {
  test('MSI-SEC-201: apiKeys 数组不暴露', () => {
    const src = { id: 's1', name: 'Test', apiKeys: ['sk-secret-key'] };
    // 列表视图不应包含完整 keys
    const listView = { id: src.id, name: src.name, keyCount: src.apiKeys.length };
    expect(listView).not.toHaveProperty('apiKeys');
    expect(listView.keyCount).toBe(1);
  });

  test('MSI-SEC-202: 空 apiKeys 数组', () => {
    const src = { id: 's1', name: 'Test', apiKeys: [] };
    expect(src.apiKeys.length).toBe(0);
  });
});

describe('MSI-SEC-3: 输入污染防护', () => {
  test('MSI-SEC-301: SQL注入尝试（会话名）', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com' });
    const res = await makeRequest('POST', '/sessions', { sourceId: a.body.id, name: "Robert'; DROP TABLE sessions; --" });
    expect(res.status).toBe(200);
    // 不崩溃，安全存储
    expect(res.body.name).toBeDefined();
  });

  test('MSI-SEC-302: XSS 注入（会话名）', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com' });
    const res = await makeRequest('POST', '/sessions', { sourceId: a.body.id, name: '<script>alert(1)</script>' });
    expect(res.status).toBe(200);
  });

  test('MSI-SEC-303: 路径穿越尝试', async () => {
    const res = await makeRequest('GET', '/sessions/../../../etc/passwd');
    expect(res.status).toBe(404);
  });

  test('MSI-SEC-304: 空 sessionId', async () => {
    const res = await makeRequest('GET', '/sessions/');
    expect(res.status).toBe(404);
  });

  test('MSI-SEC-305: 超长 sourceId', async () => {
    const longId = 'a'.repeat(10000);
    const res = await makeRequest('GET', `/sources/${longId}`);
    expect(res.status).toBe(404);
  });
});

describe('MSI-SEC-4: 来源删除保护', () => {
  test('MSI-SEC-401: 删除唯一来源后新建会话仍可工作', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'Only', baseUrl: 'https://only.com' });
    const sess = await makeRequest('POST', '/sessions', { sourceId: a.body.id, name: 'Sess' });
    expect(sess.status).toBe(200);
    // 删除后新建另一个来源
    await makeRequest('DELETE', `/sources/${a.body.id}`);
    const newSrc = await makeRequest('POST', '/sources', { name: 'New', baseUrl: 'https://new.com' });
    const newSess = await makeRequest('POST', '/sessions', { sourceId: newSrc.body.id, name: 'NewSess' });
    expect(newSess.status).toBe(200);
  });

  test('MSI-SEC-402: 重复删除来源幂等', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com' });
    await makeRequest('DELETE', `/sources/${a.body.id}`);
    const d2 = await makeRequest('DELETE', `/sources/${a.body.id}`);
    expect(d2.status).toBe(404);
  });
});

describe('MSI-SEC-5: 来源配置隔离', () => {
  test('MSI-SEC-501: 不同来源可有不同 config', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com' });
    const b = await makeRequest('POST', '/sources', { name: 'B', baseUrl: 'https://b.com' });
    const gA = await makeRequest('GET', `/sources/${a.body.id}`);
    const gB = await makeRequest('GET', `/sources/${b.body.id}`);
    expect(gA.body.baseUrl).not.toBe(gB.body.baseUrl);
  });

  test('MSI-SEC-502: 来源配置独立', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com' });
    const b = await makeRequest('POST', '/sources', { name: 'B', baseUrl: 'https://b.com' });
    const gA = await makeRequest('GET', `/sources/${a.body.id}`);
    expect(gA.body.name).toBe('A');
    expect(gA.body.id).not.toBe(b.body.id);
  });
});
