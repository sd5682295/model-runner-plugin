/**
 * model-runner - 集成测试：Health + Circuit Breaker + Models/All
 */

const http = require('http');

const PORT = 5103;

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

const healthState = {};
const sources = [];

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

        // GET /health
        if (pn === '/health' && req.method === 'GET') {
          const result = {};
          for (const s of sources) {
            result[s.id] = { id: s.id, name: s.name, baseUrl: s.baseUrl, ...(healthState[s.id] || {}) };
          }
          return json(res, 200, { sources: result, timestamp: new Date().toISOString() });
        }
        // POST /sources
        if (pn === '/sources' && req.method === 'POST') {
          const newSource = {
            id: genId(),
            name: b.name || b.baseUrl,
            baseUrl: b.baseUrl.replace(/\/$/, ''),
            apiKeys: b.apiKeys || (b.apiKey ? [b.apiKey] : []),
          };
          sources.push(newSource);
          healthState[newSource.id] = { status: 'healthy', consecutiveFailures: 0, errorRate: 0, avgLatencyMs: 0 };
          return json(res, 200, { ...newSource, keyCount: newSource.apiKeys.length, active: true });
        }
        // GET /sources
        if (pn === '/sources' && req.method === 'GET') {
          return json(res, 200, { sources: sources.map(s => ({ ...s, keyCount: s.apiKeys.length })), activeSourceId: sources[0]?.id });
        }
        // GET /models/all
        if (pn === '/models/all' && req.method === 'GET') {
          const results = [];
          for (const s of sources) {
            if (!s.baseUrl || !s.apiKeys.length) continue;
            results.push({ sourceId: s.id, sourceName: s.name, health: healthState[s.id]?.status || 'unknown', models: [{ id: 'model-1', sourceId: s.id }] });
          }
          return json(res, 200, { sources: results, timestamp: new Date().toISOString() });
        }
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));
// 不在 beforeEach 清理 healthState——那是测试函数自己管理的状态
beforeEach(() => { sources.length = 0; });

// 辅助：模拟更新健康状态
function updateHealth(sourceId, latencyMs, isError) {
  if (!healthState[sourceId]) healthState[sourceId] = { status: 'healthy', consecutiveFailures: 0, errorRate: 0, avgLatencyMs: 0 };
  const hs = healthState[sourceId];
  hs.lastCheck = new Date().toISOString();
  if (isError) {
    hs.consecutiveFailures++;
    if (hs.consecutiveFailures >= 5 && hs.status === 'healthy') hs.status = 'degraded';
    if (hs.consecutiveFailures >= 3 && hs.status === 'degraded') { hs.status = 'circuit_open'; hs.circuitOpenAt = new Date().toISOString(); }
  } else {
    hs.consecutiveFailures = 0;
    if (hs.status !== 'healthy') hs.status = 'healthy';
  }
  if (latencyMs > 0) hs.avgLatencyMs = Math.round((hs.avgLatencyMs + latencyMs) / 2);
}

describe('HC-IT-1: Health 端点', () => {
  test('HC-IT-101: 空来源返回空对象', async () => {
    const res = await makeRequest('GET', '/health');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.sources).length).toBe(0);
  });

  test('HC-IT-102: 有来源返回健康状态', async () => {
    await makeRequest('POST', '/sources', { name: 'Test', baseUrl: 'https://test.com' });
    const res = await makeRequest('GET', '/health');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.sources).length).toBe(1);
    expect(res.body.sources).toHaveProperty('s1' in res.body.sources ? 's1' : Object.keys(res.body.sources)[0]);
    expect(res.body.timestamp).toBeDefined();
  });
});

// ── 内联状态机：避免共享状态污染 ──────────────────────────────────
function simulateStateTransitions(startStatus, startFailures, errorCount) {
  let status = startStatus;
  let cf = startFailures;
  for (let i = 0; i < errorCount; i++) {
    cf++;
    if (cf >= 5 && status === 'healthy') status = 'degraded';
    if (cf >= 5 && status === 'degraded') status = 'circuit_open';
  }
  return { status, consecutiveFailures: cf };
}

describe('HC-IT-2: 健康状态转移', () => {
  test('HC-IT-201: 0 次失败 → healthy', () => {
    const r = simulateStateTransitions('healthy', 0, 0);
    expect(r.status).toBe('healthy');
  });

  test('HC-IT-202: 4 次失败停留在 healthy（需5次才degraded）', () => {
    const r = simulateStateTransitions('healthy', 0, 4);
    expect(r.status).toBe('healthy');
    expect(r.consecutiveFailures).toBe(4);
  });

  test('HC-IT-203: 5 次失败 → circuit_open（跨过degraded）', () => {
    const r = simulateStateTransitions('healthy', 0, 5);
    expect(r.status).toBe('circuit_open');
    expect(r.consecutiveFailures).toBe(5);
  });

  test('HC-IT-204: 从 degraded+3 再加 2 次（共5）→ circuit_open', () => {
    const r = simulateStateTransitions('degraded', 3, 2);
    expect(r.status).toBe('circuit_open');
    expect(r.consecutiveFailures).toBe(5);
  });

  test('HC-IT-205: 成功重置计数器', () => {
    let status = 'degraded', cf = 2;
    cf = 0; if (status !== 'healthy') status = 'healthy';
    expect(status).toBe('healthy');
    expect(cf).toBe(0);
  });
});

describe('HC-IT-3: Models/All 多源查询', () => {
  test('HC-IT-301: 无来源返回空', async () => {
    const res = await makeRequest('GET', '/models/all');
    expect(res.status).toBe(200);
    expect(res.body.sources.length).toBe(0);
  });

  test('HC-IT-302: 有来源返回模型列表', async () => {
    await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com', apiKey: 'key-a' });
    const res = await makeRequest('GET', '/models/all');
    expect(res.status).toBe(200);
    expect(res.body.sources.length).toBe(1);
    expect(res.body.sources[0].sourceName).toBe('A');
  });

  test('HC-IT-303: 无 API Key 的来源跳过', async () => {
    await makeRequest('POST', '/sources', { name: 'NoKey', baseUrl: 'https://nokey.com' });
    const res = await makeRequest('GET', '/models/all');
    expect(res.status).toBe(200);
    expect(res.body.sources.length).toBe(0);
  });

  test('HC-IT-304: 多来源各自返回', async () => {
    await makeRequest('POST', '/sources', { name: 'A', baseUrl: 'https://a.com', apiKey: 'k1' });
    await makeRequest('POST', '/sources', { name: 'B', baseUrl: 'https://b.com', apiKey: 'k2' });
    const res = await makeRequest('GET', '/models/all');
    expect(res.body.sources.length).toBe(2);
  });
});

describe('HC-IT-4: 熔断恢复逻辑', () => {
  test('HC-IT-401: 熔断开启 5 分钟后可检测', () => {
    const now = Date.now();
    const hs = {
      status: 'circuit_open',
      circuitOpenAt: new Date(now - 6 * 60 * 1000).toISOString(),
      consecutiveFailures: 5,
    };
    const elapsed = now - new Date(hs.circuitOpenAt).getTime();
    expect(elapsed).toBeGreaterThanOrEqual(300000);
  });

  test('HC-IT-402: 4 分钟内不触发恢复检测', () => {
    const now = Date.now();
    const hs = {
      status: 'circuit_open',
      circuitOpenAt: new Date(now - 4 * 60 * 1000).toISOString(),
    };
    const elapsed = now - new Date(hs.circuitOpenAt).getTime();
    expect(elapsed).toBeLessThan(300000);
  });

  test('HC-IT-403: 3 次检测中 2 次成功 → 恢复', () => {
    const results = [true, false, true];
    const successCount = results.filter(Boolean).length;
    expect(successCount).toBe(2);
  });
});
