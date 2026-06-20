/**
 * model-runner - 集成测试：Sources API
 */

const http = require('http');

const PORT = 5102;

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

function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

let sources = [];
let activeSourceId = null;

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

        // GET /sources
        if (pn === '/sources' && req.method === 'GET') {
          const list = sources.map(s => ({
            id: s.id, name: s.name, baseUrl: s.baseUrl,
            keyCount: (s.apiKeys || []).length,
            active: s.id === activeSourceId,
          }));
          return json(res, 200, { sources: list, activeSourceId });
        }
        // POST /sources
        if (pn === '/sources' && req.method === 'POST') {
          if (!b.baseUrl) return json(res, 400, { error: '缺少 baseUrl' });
          const newSource = {
            id: genId(),
            name: b.name || b.baseUrl,
            baseUrl: b.baseUrl.replace(/\/$/, ''),
            apiKeys: b.apiKeys || (b.apiKey ? [b.apiKey] : []),
          };
          sources.push(newSource);
          if (!activeSourceId) activeSourceId = newSource.id;
          return json(res, 200, { ...newSource, keyCount: newSource.apiKeys.length, active: newSource.id === activeSourceId });
        }
        // GET /sources/:id
        const srcMatch = pn.match(/^\/sources\/([a-z0-9]+)$/);
        if (srcMatch) {
          const id = srcMatch[1];
          if (req.method === 'GET') {
            const s = sources.find(s => s.id === id);
            return s ? json(res, 200, { ...s, active: s.id === activeSourceId }) : json(res, 404, { error: '源不存在' });
          }
          if (req.method === 'PUT') {
            const idx = sources.findIndex(s => s.id === id);
            if (idx === -1) return json(res, 404, { error: '源不存在' });
            if (b.name !== undefined) sources[idx].name = b.name;
            if (b.baseUrl !== undefined) sources[idx].baseUrl = b.baseUrl.replace(/\/$/, '');
            if (b.apiKeys !== undefined) sources[idx].apiKeys = b.apiKeys;
            return json(res, 200, { ok: true });
          }
          if (req.method === 'DELETE') {
            const idx = sources.findIndex(s => s.id === id);
            if (idx === -1) return json(res, 404, { error: '源不存在' });
            sources.splice(idx, 1);
            if (activeSourceId === id) activeSourceId = sources[0]?.id || null;
            return json(res, 200, { ok: true });
          }
        }
        // POST /sources/:id/activate
        const activateMatch = pn.match(/^\/sources\/([a-z0-9]+)\/activate$/);
        if (activateMatch && req.method === 'POST') {
          const id = activateMatch[1];
          if (!sources.find(s => s.id === id)) return json(res, 404, { error: '源不存在' });
          activeSourceId = id;
          return json(res, 200, { ok: true, activeSourceId: id });
        }
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));
beforeEach(() => { sources = []; activeSourceId = null; });

describe('SRC-IT-1: Sources CRUD', () => {
  test('SRC-IT-101: 创建来源', async () => {
    const res = await makeRequest('POST', '/sources', { name: 'Test Source', baseUrl: 'https://api.test.com/v1' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.baseUrl).toBe('https://api.test.com/v1');
    expect(res.body.active).toBe(true);
  });

  test('SRC-IT-102: 创建来源（无 name）', async () => {
    const res = await makeRequest('POST', '/sources', { baseUrl: 'https://api2.com' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('https://api2.com');
  });

  test('SRC-IT-103: 创建来源缺少 baseUrl', async () => {
    const res = await makeRequest('POST', '/sources', { name: 'No URL' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('baseUrl');
  });

  test('SRC-IT-104: 列表来源', async () => {
    await makeRequest('POST', '/sources', { baseUrl: 'https://a.com' });
    await makeRequest('POST', '/sources', { baseUrl: 'https://b.com' });
    const res = await makeRequest('GET', '/sources');
    expect(res.status).toBe(200);
    expect(res.body.sources.length).toBe(2);
  });

  test('SRC-IT-105: 获取单个来源', async () => {
    const c = await makeRequest('POST', '/sources', { name: 'Single', baseUrl: 'https://single.com' });
    const res = await makeRequest('GET', `/sources/${c.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Single');
  });

  test('SRC-IT-106: 获取不存在来源', async () => {
    const res = await makeRequest('GET', '/sources/notexist');
    expect(res.status).toBe(404);
  });

  test('SRC-IT-107: 更新来源名称', async () => {
    const c = await makeRequest('POST', '/sources', { baseUrl: 'https://upd.com' });
    const res = await makeRequest('PUT', `/sources/${c.body.id}`, { name: 'Updated Name' });
    expect(res.status).toBe(200);
    const g = await makeRequest('GET', `/sources/${c.body.id}`);
    expect(g.body.name).toBe('Updated Name');
  });

  test('SRC-IT-108: 更新来源 baseUrl（去除尾部斜杠）', async () => {
    const c = await makeRequest('POST', '/sources', { baseUrl: 'https://old.com/v1/' });
    await makeRequest('PUT', `/sources/${c.body.id}`, { baseUrl: 'https://new.com/v1/' });
    const g = await makeRequest('GET', `/sources/${c.body.id}`);
    expect(g.body.baseUrl).toBe('https://new.com/v1');
  });

  test('SRC-IT-109: 删除来源', async () => {
    const c = await makeRequest('POST', '/sources', { baseUrl: 'https://todel.com' });
    const res = await makeRequest('DELETE', `/sources/${c.body.id}`);
    expect(res.status).toBe(200);
    const g = await makeRequest('GET', `/sources/${c.body.id}`);
    expect(g.status).toBe(404);
  });

  test('SRC-IT-110: 删除不存在来源', async () => {
    const res = await makeRequest('DELETE', '/sources/notexist');
    expect(res.status).toBe(404);
  });
});

describe('SRC-IT-2: 来源激活', () => {
  test('SRC-IT-201: 激活来源', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com' });
    await makeRequest('POST', '/sources', { name: 'B', baseUrl: 'https://b.com' });
    const res = await makeRequest('POST', `/sources/${a.body.id}/activate`);
    expect(res.status).toBe(200);
    expect(res.body.activeSourceId).toBe(a.body.id);
    const g = await makeRequest('GET', `/sources/${a.body.id}`);
    expect(g.body.active).toBe(true);
  });

  test('SRC-IT-202: 激活不存在来源', async () => {
    const res = await makeRequest('POST', '/sources/notexist/activate');
    expect(res.status).toBe(404);
  });
});

describe('SRC-IT-3: 多来源管理', () => {
  test('SRC-IT-301: 多个来源独立存在', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'Source A', baseUrl: 'https://a.com', apiKey: 'key-a' });
    const b = await makeRequest('POST', '/sources', { name: 'Source B', baseUrl: 'https://b.com', apiKey: 'key-b' });
    const list = await makeRequest('GET', '/sources');
    expect(list.body.sources.length).toBe(2);
    expect(list.body.sources.find(s => s.name === 'Source A')).toBeDefined();
    expect(list.body.sources.find(s => s.name === 'Source B')).toBeDefined();
  });

  test('SRC-IT-302: keyCount 正确', async () => {
    const c = await makeRequest('POST', '/sources', { baseUrl: 'https://k.com', apiKeys: ['key1', 'key2', 'key3'] });
    expect(c.body.keyCount).toBe(3);
  });

  test('SRC-IT-303: 删除活跃源后自动切换', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com' });
    await makeRequest('POST', '/sources', { name: 'B', baseUrl: 'https://b.com' });
    await makeRequest('POST', `/sources/${a.body.id}/activate`);
    await makeRequest('DELETE', `/sources/${a.body.id}`);
    const list = await makeRequest('GET', '/sources');
    expect(list.body.sources.find(s => s.active)?.name).toBe('B');
  });

  test('SRC-IT-304: API Key 数组传入', async () => {
    const c = await makeRequest('POST', '/sources', { baseUrl: 'https://keys.com', apiKeys: ['k1', 'k2'] });
    expect(c.body.keyCount).toBe(2);
  });
});

describe('SRC-IT-4: 边界条件', () => {
  test('SRC-IT-401: 重复名称允许', async () => {
    const a = await makeRequest('POST', '/sources', { name: 'Same', baseUrl: 'https://a.com' });
    const b = await makeRequest('POST', '/sources', { name: 'Same', baseUrl: 'https://b.com' });
    expect(a.body.id).not.toBe(b.body.id);
  });

  test('SRC-IT-405: 未知路由 404', async () => {
    const res = await makeRequest('GET', '/sources/unknown/extra');
    expect(res.status).toBe(404);
  });

  test('SRC-IT-406: 方法不允许', async () => {
    const res = await makeRequest('DELETE', '/sources');
    expect(res.status).toBe(404); // 405 会被 404 路由捕获
  });
});
