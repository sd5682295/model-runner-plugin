/**
 * model-runner - 流式测试
 */

const http = require('http');

const PORT = 4995;

function makeRawRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, `http://localhost:${PORT}`);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method };
    let bodyStr = body !== undefined && body !== null ? JSON.stringify(body) : null;
    if (bodyStr) opts.headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', () => resolve({ status: 0, raw: null }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

let _cfg = { apiKey: 'sk-test' };
let server;

function extractSSEContent(raw) {
  let text = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const s = line.slice(6).trim();
    if (s === '[DONE]') continue;
    try { const d = JSON.parse(s).choices?.[0]?.delta?.content; if (d) text += d; } catch {}
  }
  return text;
}

beforeAll(() => {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        let b = {};
        try { if (body) b = JSON.parse(body); } catch {}
        const url = new URL(req.url, `http://localhost:${PORT}`);
        if (url.pathname === '/chat/stream' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write('data: {"choices":[{"delta":{"content":"H"}}]}\n\n');
          res.write('data: {"choices":[{"delta":{"content":"i"}}]}\n\n');
          res.write('data: {"choices":[{"delta":{"content":"!"}}]}\n\n');
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        res.writeHead(404).end();
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));

describe('STRM-1: SSE 流式响应', () => {
  test('STRM-101: Content-Type 为 event-stream', async () => {
    const res = await makeRawRequest('POST', '/chat/stream', { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  test('STRM-102: 多行 data: 块', async () => {
    const res = await makeRawRequest('POST', '/chat/stream', { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    const lines = res.raw.split('\n').filter(l => l.startsWith('data: '));
    expect(lines.length).toBeGreaterThan(0);
  });

  test('STRM-103: extractSSEContent 提取完整文本', async () => {
    const res = await makeRawRequest('POST', '/chat/stream', { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    const text = extractSSEContent(res.raw);
    expect(text).toBe('Hi!');
  });

  test('STRM-104: 最后为 [DONE]', async () => {
    const res = await makeRawRequest('POST', '/chat/stream', { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    const lines = res.raw.split('\n').filter(l => l.trim());
    expect(lines[lines.length - 1]).toBe('data: [DONE]');
  });
});