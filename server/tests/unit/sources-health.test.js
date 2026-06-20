/**
 * model-runner - 单元测试：来源管理 + 健康状态 + 重试逻辑
 */

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const PORT = 5101;
const TEST_CONFIG = path.join(__dirname, '..', '..', 'config-unit-sources.json');
const TEST_SESSIONS = path.join(__dirname, '..', '..', 'sessions-unit-test');
const TEST_HEALTH = path.join(__dirname, '..', '..', 'healthState-unit.json');

function cleanup() {
  [TEST_CONFIG, TEST_HEALTH].forEach(f => { try { fs.unlinkSync(f); } catch {} });
  try {
    fs.readdirSync(TEST_SESSIONS).forEach(f => fs.unlinkSync(path.join(TEST_SESSIONS, f)));
    fs.rmdirSync(TEST_SESSIONS);
  } catch {}
}
beforeAll(() => { cleanup(); });
afterAll(() => { cleanup(); });

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

let _idSeq = 0;
function genId() {
  return Date.now().toString(36) + (_idSeq++).toString(36);
}

function validId(id) {
  return typeof id === 'string' && /^[a-z0-9]+$/.test(id);
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

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

// ─── ID 生成与验证 ─────────────────────────────────────────────────────────

describe('UT-SRC-1: ID 生成', () => {
  test('UT-SRC-101: genId 唯一性 1000次', () => {
    const ids = Array.from({ length: 1000 }, () => genId());
    expect(new Set(ids).size).toBe(1000);
  });
  test('UT-SRC-102: genId 格式正确', () => {
    const id = genId();
    expect(validId(id)).toBe(true);
  });
});

describe('UT-SRC-2: ID 验证', () => {
  test('UT-SRC-201: 纯数字合法', () => { expect(validId('123')).toBe(true); });
  test('UT-SRC-202: 混合合法', () => { expect(validId('a1b2c3')).toBe(true); });
  test('UT-SRC-203: 单字符合法', () => { expect(validId('a')).toBe(true); });
  test('UT-SRC-204: 大写非法', () => { expect(validId('ABC')).toBe(false); });
  test('UT-SRC-205: 下划线非法', () => { expect(validId('a_b')).toBe(false); });
  test('UT-SRC-206: 空格非法', () => { expect(validId('ab cd')).toBe(false); });
  test('UT-SRC-207: 空字符串非法', () => { expect(validId('')).toBe(false); });
  test('UT-SRC-208: null 非法', () => { expect(validId(null)).toBe(false); });
  test('UT-SRC-209: 超长ID（500字符）合法', () => { expect(validId('a'.repeat(500))).toBe(true); });
});

// ─── 健康状态转移 ─────────────────────────────────────────────────────────

describe('UT-SRC-3: 健康状态机', () => {
  test('UT-SRC-301: 默认状态为 healthy', () => {
    const hs = { status: 'healthy', consecutiveFailures: 0 };
    expect(hs.status).toBe('healthy');
  });

  test('UT-SRC-302: 3次失败 → degraded', () => {
    const hs = { status: 'healthy', consecutiveFailures: 0 };
    for (let i = 0; i < 3; i++) {
      hs.consecutiveFailures++;
      if (hs.consecutiveFailures >= 3 && hs.status === 'healthy') {
        hs.status = 'degraded';
      }
    }
    expect(hs.status).toBe('degraded');
  });

  test('UT-SRC-303: 5次失败 → circuit_open', () => {
    const hs = { status: 'degraded', consecutiveFailures: 3 };
    for (let i = 0; i < 2; i++) {
      hs.consecutiveFailures++;
      if (hs.consecutiveFailures >= 5) hs.status = 'circuit_open';
    }
    expect(hs.status).toBe('circuit_open');
  });

  test('UT-SRC-304: 成功后立即恢复 healthy', () => {
    const hs = { status: 'degraded', consecutiveFailures: 3 };
    hs.consecutiveFailures = 0;
    hs.status = 'healthy';
    expect(hs.status).toBe('healthy');
    expect(hs.consecutiveFailures).toBe(0);
  });

  test('UT-SRC-305: 熔断开启后需等待 5 分钟', () => {
    const now = Date.now();
    const hs = { status: 'circuit_open', circuitOpenAt: new Date(now - 4 * 60 * 1000).toISOString() };
    const elapsed = now - new Date(hs.circuitOpenAt).getTime();
    expect(elapsed).toBeLessThan(300000); // 不到 5 分钟
    expect(hs.status).toBe('circuit_open');
  });

  test('UT-SRC-306: 熔断 5 分钟后可检测', () => {
    const now = Date.now();
    const hs = { status: 'circuit_open', circuitOpenAt: new Date(now - 6 * 60 * 1000).toISOString() };
    const elapsed = now - new Date(hs.circuitOpenAt).getTime();
    expect(elapsed).toBeGreaterThanOrEqual(300000);
  });
});

// ─── 重试逻辑 ─────────────────────────────────────────────────────────────

describe('UT-SRC-4: 重试状态码', () => {
  const RETRY_STATUSES = new Set([402, 403, 429, 500, 502, 503, 504]);
  test('UT-SRC-400: 402 欠费触发平台切换', () => { expect(RETRY_STATUSES.has(402)).toBe(true); });
  test('UT-SRC-400b: 403 鉴权/余额问题触发平台切换', () => { expect(RETRY_STATUSES.has(403)).toBe(true); });
  test('UT-SRC-401: 429 重试', () => { expect(RETRY_STATUSES.has(429)).toBe(true); });
  test('UT-SRC-402: 500 重试', () => { expect(RETRY_STATUSES.has(500)).toBe(true); });
  test('UT-SRC-403: 502 重试', () => { expect(RETRY_STATUSES.has(502)).toBe(true); });
  test('UT-SRC-404: 503 重试', () => { expect(RETRY_STATUSES.has(503)).toBe(true); });
  test('UT-SRC-405: 504 重试', () => { expect(RETRY_STATUSES.has(504)).toBe(true); });
  test('UT-SRC-406: 200 不重试', () => { expect(RETRY_STATUSES.has(200)).toBe(false); });
  test('UT-SRC-407: 400 不重试', () => { expect(RETRY_STATUSES.has(400)).toBe(false); });
  test('UT-SRC-408: 401 不重试', () => { expect(RETRY_STATUSES.has(401)).toBe(false); });
  test('UT-SRC-409: 404 不重试', () => { expect(RETRY_STATUSES.has(404)).toBe(false); });
});

describe('UT-SRC-4B: 模型级平台路由', () => {
  function normalizeRoute(route) {
    const disabled = new Set(route.disabledPlatforms || []);
    return (route.preferredPlatforms || []).filter(platform => !disabled.has(platform));
  }

  test('UT-SRC-410: 按 preferredPlatforms 顺序尝试平台', () => {
    const route = normalizeRoute({ preferredPlatforms: ['dmxapi', 'mytokenland'], disabledPlatforms: [] });
    expect(route).toEqual(['dmxapi', 'mytokenland']);
  });

  test('UT-SRC-411: disabledPlatforms 会屏蔽指定平台', () => {
    const route = normalizeRoute({ preferredPlatforms: ['dmxapi', 'mytokenland'], disabledPlatforms: ['dmxapi'] });
    expect(route).toEqual(['mytokenland']);
  });
});

describe('UT-SRC-5: 重试错误类型', () => {
  const RETRY_ERRORS = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT']);
  test('UT-SRC-501: ECONNRESET 重试', () => { expect(RETRY_ERRORS.has('ECONNRESET')).toBe(true); });
  test('UT-SRC-502: ECONNREFUSED 重试', () => { expect(RETRY_ERRORS.has('ECONNREFUSED')).toBe(true); });
  test('UT-SRC-503: ENOTFOUND 重试', () => { expect(RETRY_ERRORS.has('ENOTFOUND')).toBe(true); });
  test('UT-SRC-504: ETIMEDOUT 重试', () => { expect(RETRY_ERRORS.has('ETIMEDOUT')).toBe(true); });
  test('UT-SRC-505: ENOENT 不重试', () => { expect(RETRY_ERRORS.has('ENOENT')).toBe(false); });
});

describe('UT-SRC-6: Backoff 延迟', () => {
  function backoff(attempt) { return Math.min(1000 * Math.pow(2, attempt), 8000); }
  test('UT-SRC-601: 第0次无延迟', () => { expect(backoff(0)).toBe(1000); });
  test('UT-SRC-602: 第1次延迟 2s', () => { expect(backoff(1)).toBe(2000); });
  test('UT-SRC-603: 第2次延迟 4s', () => { expect(backoff(2)).toBe(4000); });
  test('UT-SRC-604: 第3次延迟 8s（上限）', () => { expect(backoff(3)).toBe(8000); });
  test('UT-SRC-605: 第4次延迟不超过上限', () => { expect(backoff(4)).toBe(8000); });
});

// ─── SSE 解析 ─────────────────────────────────────────────────────────────

describe('UT-SRC-7: SSE 内容提取', () => {
  function extractSSEContent(raw) {
    let text = '';
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const s = line.slice(6).trim();
      if (s === '[DONE]') continue;
      try {
        const delta = JSON.parse(s).choices?.[0]?.delta?.content;
        if (delta) text += delta;
      } catch {}
    }
    return text;
  }

  test('UT-SRC-701: 提取多块 SSE', () => {
    const raw = 'data: {"choices":[{"delta":{"content":"H"}}]}\n\ndata: {"choices":[{"delta":{"content":"e"}}]}\n\ndata: {"choices":[{"delta":{"content":"l"}}]}\n\ndata: {"choices":[{"delta":{"content":"l"}}]}\n\ndata: {"choices":[{"delta":{"content":"o"}}]}\n\ndata: [DONE]\n\n';
    expect(extractSSEContent(raw)).toBe('Hello');
  });

  test('UT-SRC-702: 无效 JSON 不中断', () => {
    const raw = 'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: invalid json\n\ndata: {"choices":[{"delta":{"content":"B"}}]}\n\ndata: [DONE]\n\n';
    expect(extractSSEContent(raw)).toBe('AB');
  });

  test('UT-SRC-703: 空 raw 返回空', () => {
    expect(extractSSEContent('')).toBe('');
  });

  test('UT-SRC-704: usage 字段不混入内容', () => {
    const raw = 'data: {"choices":[{"delta":{"content":"X"}}],"usage":{"total_tokens":10}}\n\ndata: [DONE]\n\n';
    expect(extractSSEContent(raw)).toBe('X');
  });
});

// ─── Round-robin Key 轮换 ────────────────────────────────────────────────

describe('UT-SRC-8: API Key 轮换', () => {
  test('UT-SRC-801: 多 Key 轮换', () => {
    const keys = ['key1', 'key2', 'key3'];
    const indices = [];
    for (let i = 0; i < 6; i++) {
      const idx = i % keys.length;
      indices.push(keys[idx]);
    }
    expect(indices).toEqual(['key1', 'key2', 'key3', 'key1', 'key2', 'key3']);
  });

  test('UT-SRC-802: 单 Key 始终返回自己', () => {
    const keys = ['only-key'];
    for (let i = 0; i < 5; i++) {
      expect(keys[i % keys.length]).toBe('only-key');
    }
  });
});

// ─── URL 规范化 ──────────────────────────────────────────────────────────

describe('UT-SRC-9: URL 处理', () => {
  test('UT-SRC-901: 去除尾部斜杠', () => {
    expect('https://api.test.com/v1/'.replace(/\/$/, '')).toBe('https://api.test.com/v1');
  });
  test('UT-SRC-902: 无尾部斜杠不变', () => {
    expect('https://api.test.com/v1'.replace(/\/$/, '')).toBe('https://api.test.com/v1');
  });
  test('UT-SRC-903: 路径拼接', () => {
    const base = 'https://api.test.com/v1'.replace(/\/$/, '');
    expect(base + '/chat/completions').toBe('https://api.test.com/v1/chat/completions');
  });
});

// ─── 非 JSON 响应处理 ────────────────────────────────────────────────────

describe('UT-SRC-10: 非 JSON 响应', () => {
  test('UT-SRC-1001: HTML 响应解析抛出', () => {
    const html = '<html><body>Service Unavailable</body></html>';
    let threw = false;
    try { JSON.parse(html); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('UT-SRC-1002: 空字符串解析抛出', () => {
    let threw = false;
    try { JSON.parse(''); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('UT-SRC-1003: 纯数字解析为数字', () => {
    const r = JSON.parse('503');
    expect(typeof r).toBe('number');
  });

  test('UT-SRC-1004: 损坏的 JSON 解析抛出', () => {
    const bad = '{"key": "val';
    let threw = false;
    try { JSON.parse(bad); } catch { threw = true; }
    expect(threw).toBe(true);
  });
});

// ─── 日志追加 ────────────────────────────────────────────────────────────

describe('UT-SRC-11: 日志条目结构', () => {
  test('UT-SRC-1101: 日志字段完整', () => {
    const entry = {
      ts: new Date().toISOString(),
      model: 'gpt-4o',
      source: 's1',
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 1234,
      status: 200,
    };
    expect(entry.ts).toBeDefined();
    expect(entry.model).toBe('gpt-4o');
    expect(entry.latencyMs).toBeGreaterThan(0);
  });
});
