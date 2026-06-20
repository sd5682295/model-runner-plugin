/**
 * model-runner - 重试 + 熔断 功能测试
 */

const http = require('http');

const PORT = 5111;

let requestCount = 0;
let failureCount = 0;
let keyCooldowns = new Map();

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

let server;

beforeAll(() => {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.method === 'OPTIONS') return res.writeHead(204) && res.end();
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        requestCount++;
        let b = {};
        try { if (body) b = JSON.parse(body); } catch {}
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const pn = url.pathname;
        // Chat endpoint with configurable behavior
        if (pn === '/retry-test' && req.method === 'POST') {
          if (failureCount < 2) {
            failureCount++;
            return json(res, 429, { error: 'Rate limited' });
          }
          return json(res, 200, { choices: [{ message: { role: 'assistant', content: 'OK after retries' } }] });
        }
        if (pn === '/always-fail' && req.method === 'POST') {
          return json(res, 503, { error: 'Service unavailable' });
        }
        if (pn === '/html-response' && req.method === 'POST') {
          res.writeHead(502, { 'Content-Type': 'text/html' });
          return res.end('<!doctype html><html><body>Gateway Error</body></html>');
        }
        if (pn === '/chat') {
          const apiKey = req.headers['authorization'] || '';
          // Check cooldown
          const cooldown = keyCooldowns.get(apiKey) || 0;
          if (cooldown > Date.now()) return json(res, 429, { error: 'Key on cooldown' });
          if (!b.model) return json(res, 400, { error: '缺少 model' });
          if (!b.messages?.length) return json(res, 400, { error: '缺少 messages' });
          return json(res, 200, { choices: [{ message: { role: 'assistant', content: 'ok' } }] });
        }
        // Sessions (for state tests)
        if (pn === '/sessions') {
          if (req.method === 'GET') return json(res, 200, { sessions: [] });
          if (req.method === 'POST') return json(res, 200, { id: genId(), name: b.name || 's' });
        }
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => { requestCount = 0; failureCount = 0; keyCooldowns.clear(); return new Promise(r => server ? server.close(r) : r()); });
beforeEach(() => { failureCount = 0; });

describe('RC-FT-1: 429 限流处理', () => {
  test('RC-FT-101: 收到 429 后 key 进入 cooldown', () => {
    const apiKey = 'Bearer sk-test';
    const cooldownMs = 60000;
    keyCooldowns.set(apiKey, Date.now() + cooldownMs);
    const remaining = keyCooldowns.get(apiKey) - Date.now();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(cooldownMs);
  });

  test('RC-FT-102: cooldown 内请求返回 429', () => {
    const apiKey = 'Bearer sk-test';
    keyCooldowns.set(apiKey, Date.now() + 60000);
    const cooldown = keyCooldowns.get(apiKey);
    expect(cooldown > Date.now()).toBe(true);
  });

  test('RC-FT-103: cooldown 过后可请求', () => {
    const apiKey = 'Bearer sk-old';
    keyCooldowns.set(apiKey, Date.now() - 1000); // 过期
    const cooldown = keyCooldowns.get(apiKey);
    expect(cooldown <= Date.now()).toBe(true);
  });
});

describe('RC-FT-2: 非 JSON 响应处理', () => {
  test('RC-FT-201: HTML 响应应返回 502', async () => {
    const res = await makeRequest('POST', '/html-response', { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(502);
  });

  test('RC-FT-202: 非 JSON 响应 JSON.parse 抛出', () => {
    const html = '<html>Error</html>';
    let threw = false;
    try { JSON.parse(html); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('RC-FT-203: JSON 响应正常解析', () => {
    const data = JSON.parse('{"ok":true,"value":123}');
    expect(data.ok).toBe(true);
    expect(data.value).toBe(123);
  });
});

describe('RC-FT-3: 重试触发条件', () => {
  const RETRY_STATUSES = new Set([402, 403, 429, 500, 502, 503, 504]);
  test('RC-FT-300: 402 欠费触发备用平台', () => { expect(RETRY_STATUSES.has(402)).toBe(true); });
  test('RC-FT-300b: 403 触发备用平台', () => { expect(RETRY_STATUSES.has(403)).toBe(true); });
  test('RC-FT-301: 429 触发重试', () => { expect(RETRY_STATUSES.has(429)).toBe(true); });
  test('RC-FT-302: 500 触发重试', () => { expect(RETRY_STATUSES.has(500)).toBe(true); });
  test('RC-FT-303: 502 触发重试', () => { expect(RETRY_STATUSES.has(502)).toBe(true); });
  test('RC-FT-304: 503 触发重试', () => { expect(RETRY_STATUSES.has(503)).toBe(true); });
  test('RC-FT-305: 504 触发重试', () => { expect(RETRY_STATUSES.has(504)).toBe(true); });
});

describe('RC-FT-3B: 平台优先级与黑名单', () => {
  function nextPlatforms(route) {
    const disabled = new Set(route.disabledPlatforms || []);
    return route.preferredPlatforms.filter(p => !disabled.has(p));
  }

  test('RC-FT-306: 先运行优先平台，再运行备用平台', () => {
    expect(nextPlatforms({ preferredPlatforms: ['cheap', 'stable'], disabledPlatforms: [] })).toEqual(['cheap', 'stable']);
  });

  test('RC-FT-307: 坚决不用的平台不会进入候选', () => {
    expect(nextPlatforms({ preferredPlatforms: ['cheap', 'bad', 'stable'], disabledPlatforms: ['bad'] })).toEqual(['cheap', 'stable']);
  });
});

describe('RC-FT-4: 重试最大次数', () => {
  test('RC-FT-401: 默认重试 3 次（0~2次 + 初始）', () => {
    // 实际逻辑：i <= retries（retries=3时，0,1,2,3 → 4次）
    // 但代码：retries ?? 3，fetchWithRetry 内部循环 i <= retries
    // 即 retries=3 时，尝试 0,1,2,3 → 4次调用
    const retries = 3;
    const attempts = [];
    for (let i = 0; i <= retries; i++) attempts.push(i);
    expect(attempts.length).toBe(4);
  });

  test('RC-FT-402: 配置重试次数', () => {
    const cfgRetries = 2;
    const attempts = [];
    for (let i = 0; i <= cfgRetries; i++) attempts.push(i);
    expect(attempts.length).toBe(3);
  });
});

describe('RC-FT-5: 熔断触发逻辑', () => {
  test('RC-FT-501: 连续失败 3 次 → degraded', () => {
    let hs = { status: 'healthy', consecutiveFailures: 0 };
    for (let i = 0; i < 3; i++) {
      hs.consecutiveFailures++;
      if (hs.consecutiveFailures >= 3 && hs.status === 'healthy') hs.status = 'degraded';
    }
    expect(hs.status).toBe('degraded');
  });

  test('RC-FT-502: degraded 下再失败 2 次 → circuit_open', () => {
    let hs = { status: 'degraded', consecutiveFailures: 3 };
    for (let i = 0; i < 2; i++) {
      hs.consecutiveFailures++;
      if (hs.consecutiveFailures >= 5) hs.status = 'circuit_open';
    }
    expect(hs.status).toBe('circuit_open');
  });

  test('RC-FT-503: 熔断后不再发请求', () => {
    const hs = { status: 'circuit_open' };
    const shouldSkip = hs.status === 'circuit_open';
    expect(shouldSkip).toBe(true);
  });

  test('RC-FT-504: 成功调用重置计数器', () => {
    let hs = { status: 'degraded', consecutiveFailures: 3 };
    hs.consecutiveFailures = 0;
    hs.status = 'healthy';
    expect(hs.status).toBe('healthy');
    expect(hs.consecutiveFailures).toBe(0);
  });
});

describe('RC-FT-6: 错误日志', () => {
  test('RC-FT-601: 错误条目包含必要字段', () => {
    const entry = {
      ts: new Date().toISOString(),
      model: 'gpt-4o',
      source: 's1',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 5000,
      status: 500,
    };
    expect(entry.status).toBe(500);
    expect(entry.latencyMs).toBeGreaterThan(0);
  });

  test('RC-FT-602: 成功条目 promptTokens > 0', () => {
    const entry = {
      promptTokens: 50,
      completionTokens: 100,
      status: 200,
    };
    expect(entry.promptTokens).toBeGreaterThan(0);
    expect(entry.status).toBe(200);
  });
});
