/**
 * model-runner - 冒烟测试
 * 冒烟测试直连真实服务器 (http://localhost:4000)
 * 服务器必须先启动：cd D:\work\model-runner && node server.js
 */

const http = require('http');

const REAL_SERVER = 'http://localhost:4000';

function makeRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, REAL_SERVER);
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

describe('SMOKE-1: 服务可用性', () => {
  test('SMOKE-101: 服务器响应', async () => {
    const res = await makeRequest('GET', '/config');
    expect(res.status).toBeGreaterThan(0);
  }, 10000);
});

describe('SMOKE-2: 配置 API', () => {
  test('SMOKE-201: GET /config 返回配置', async () => {
    const res = await makeRequest('GET', '/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hasKey');
  }, 10000);

  test('SMOKE-202: POST /config 保存配置', async () => {
    const res = await makeRequest('POST', '/config', { timeout: 30000 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  }, 10000);
});

describe('SMOKE-3: 会话 API', () => {
  test('SMOKE-301: POST /sessions 创建会话', async () => {
    const res = await makeRequest('POST', '/sessions', { name: '冒烟测试' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
  }, 10000);

  test('SMOKE-302: GET /sessions 列出会话', async () => {
    await makeRequest('POST', '/sessions', { name: 'S1' });
    const res = await makeRequest('GET', '/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  }, 10000);
});

describe('SMOKE-4: 聊天 API', () => {
  test('SMOKE-401: POST /chat 缺少参数返回400', async () => {
    const res = await makeRequest('POST', '/chat', {});
    expect(res.status).toBe(400);
  }, 10000);
});

describe('SMOKE-5: 前端', () => {
  test('SMOKE-501: GET / 返回HTML', async () => {
    const res = await makeRequest('GET', '/');
    expect(res.status).toBe(200);
  }, 10000);
});
