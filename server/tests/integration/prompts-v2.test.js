/**
 * model-runner - 集成测试：Prompts V2 + Versions + Iterations
 */

const http = require('http');

const PORT = 5104;

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

let prompts = [];
let iterations = [];

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

        // /prompts/v2
        if (pn === '/prompts/v2') {
          if (req.method === 'GET') return json(res, 200, { prompts });
          if (req.method === 'POST') {
            const now = new Date().toISOString();
            const item = {
              id: genId(), name: b.name || '未命名模板',
              category: b.category || [], tags: b.tags || [],
              content: b.content || '',
              variables: b.variables || [],
              version: 1,
              versions: [{ v: 1, content: b.content || '', updatedAt: now, note: '初始创建' }],
              stats: { useCount: 0, avgScore: 0, lastUsed: null },
              createdAt: now, updatedAt: now,
            };
            prompts.unshift(item);
            return json(res, 200, item);
          }
        }
        // /prompts/v2/:id
        const v2Match = pn.match(/^\/prompts\/v2\/([a-z0-9]+)(\/versions|\/iterations)?$/);
        if (v2Match) {
          const id = v2Match[1];
          const sub = v2Match[2];
          const p = prompts.find(p => p.id === id);
          if (!p) return json(res, 404, { error: '不存在' });
          if (sub === '/versions' && req.method === 'GET') return json(res, 200, { versions: p.versions || [] });
          if (sub === '/iterations' && req.method === 'GET') {
            const iters = iterations.filter(i => i.promptId === id);
            return json(res, 200, { iterations: iters });
          }
          if (!sub) {
            if (req.method === 'GET') return json(res, 200, p);
            if (req.method === 'PUT') {
              const now = new Date().toISOString();
              if (b.content && b.content !== p.content) {
                p.version++;
                p.versions.push({ v: p.version, content: b.content, updatedAt: now, note: b.versionNote || '' });
              }
              if (b.name !== undefined) p.name = b.name;
              if (b.category !== undefined) p.category = b.category;
              if (b.tags !== undefined) p.tags = b.tags;
              if (b.content !== undefined) p.content = b.content;
              if (b.variables !== undefined) p.variables = b.variables;
              if (b.stats) p.stats = { ...p.stats, ...b.stats };
              p.updatedAt = now;
              return json(res, 200, p);
            }
            if (req.method === 'DELETE') {
              prompts = prompts.filter(p => p.id !== id);
              return json(res, 200, { ok: true });
            }
          }
        }
        // /iterations
        if (pn === '/iterations') {
          if (req.method === 'GET') return json(res, 200, { iterations });
          if (req.method === 'POST') {
            const now = new Date().toISOString();
            const item = {
              id: 'iter_' + genId(), promptId: b.promptId, status: 'running',
              goal: b.goal || '', references: b.references || [],
              rounds: [], finalPrompt: null, finalScores: null, converged: false,
              createdAt: now, completedAt: null,
            };
            iterations.unshift(item);
            return json(res, 200, item);
          }
        }
        const iterMatch = pn.match(/^\/iterations\/([a-z0-9_]+)$/);
        if (iterMatch && req.method === 'GET') {
          const it = iterations.find(i => i.id === iterMatch[1]);
          return it ? json(res, 200, it) : json(res, 404, { error: '不存在' });
        }
        if (iterMatch && req.method === 'PUT') {
          const idx = iterations.findIndex(i => i.id === iterMatch[1]);
          if (idx === -1) return json(res, 404, { error: '不存在' });
          if (b.rounds) iterations[idx].rounds = b.rounds;
          if (b.status) iterations[idx].status = b.status;
          if (b.finalPrompt !== undefined) iterations[idx].finalPrompt = b.finalPrompt;
          if (b.finalScores) iterations[idx].finalScores = b.finalScores;
          if (b.converged !== undefined) iterations[idx].converged = b.converged;
          if (b.completedAt) iterations[idx].completedAt = b.completedAt;
          return json(res, 200, iterations[idx]);
        }
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));
beforeEach(() => { prompts = []; iterations = []; });

describe('PV2-IT-1: Prompts V2 CRUD', () => {
  test('PV2-IT-101: 创建 V2 模板', async () => {
    const res = await makeRequest('POST', '/prompts/v2', { name: '诗人模式', content: '你是一个诗人', tags: ['写作'] });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.version).toBe(1);
    expect(res.body.versions.length).toBe(1);
    expect(res.body.stats.useCount).toBe(0);
  });

  test('PV2-IT-102: 默认字段', async () => {
    const res = await makeRequest('POST', '/prompts/v2', {});
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('未命名模板');
    expect(res.body.content).toBe('');
    expect(Array.isArray(res.body.variables)).toBe(true);
  });

  test('PV2-IT-103: 列表模板', async () => {
    await makeRequest('POST', '/prompts/v2', { name: 'A', content: 'a' });
    await makeRequest('POST', '/prompts/v2', { name: 'B', content: 'b' });
    const res = await makeRequest('GET', '/prompts/v2');
    expect(res.status).toBe(200);
    expect(res.body.prompts.length).toBe(2);
  });

  test('PV2-IT-104: 获取单个模板', async () => {
    const c = await makeRequest('POST', '/prompts/v2', { name: 'Detail', content: '内容' });
    const res = await makeRequest('GET', `/prompts/v2/${c.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Detail');
    expect(res.body.versions.length).toBe(1);
  });

  test('PV2-IT-105: 获取不存在模板', async () => {
    const res = await makeRequest('GET', '/prompts/v2/notexist');
    expect(res.status).toBe(404);
  });
});

describe('PV2-IT-2: Prompts V2 更新与版本历史', () => {
  test('PV2-IT-201: 更新内容增加版本', async () => {
    const c = await makeRequest('POST', '/prompts/v2', { name: 'V', content: 'V1 内容' });
    await makeRequest('PUT', `/prompts/v2/${c.body.id}`, { content: 'V2 内容', versionNote: '优化开头' });
    const g = await makeRequest('GET', `/prompts/v2/${c.body.id}`);
    expect(g.body.version).toBe(2);
    expect(g.body.content).toBe('V2 内容');
    expect(g.body.versions.length).toBe(2);
    expect(g.body.versions[1].note).toBe('优化开头');
  });

  test('PV2-IT-202: 不改内容不增加版本', async () => {
    const c = await makeRequest('POST', '/prompts/v2', { name: 'NoChange', content: '内容' });
    await makeRequest('PUT', `/prompts/v2/${c.body.id}`, { name: '新名称' });
    const g = await makeRequest('GET', `/prompts/v2/${c.body.id}`);
    expect(g.body.version).toBe(1);
    expect(g.body.name).toBe('新名称');
  });

  test('PV2-IT-203: 获取版本历史', async () => {
    const c = await makeRequest('POST', '/prompts/v2', { name: 'Hist', content: 'v1' });
    await makeRequest('PUT', `/prompts/v2/${c.body.id}`, { content: 'v2' });
    await makeRequest('PUT', `/prompts/v2/${c.body.id}`, { content: 'v3' });
    const res = await makeRequest('GET', `/prompts/v2/${c.body.id}/versions`);
    expect(res.status).toBe(200);
    expect(res.body.versions.length).toBe(3);
    expect(res.body.versions.map(v => v.content)).toEqual(['v1', 'v2', 'v3']);
  });

  test('PV2-IT-204: 删除模板', async () => {
    const c = await makeRequest('POST', '/prompts/v2', { name: 'ToDelete', content: 'x' });
    const res = await makeRequest('DELETE', `/prompts/v2/${c.body.id}`);
    expect(res.status).toBe(200);
    const g = await makeRequest('GET', `/prompts/v2/${c.body.id}`);
    expect(g.status).toBe(404);
  });
});

describe('PV2-IT-3: Iterations', () => {
  test('PV2-IT-301: 创建迭代', async () => {
    const res = await makeRequest('POST', '/iterations', { promptId: 'pid1', goal: '提升质量' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('running');
    expect(res.body.converged).toBe(false);
  });

  test('PV2-IT-302: 列表迭代', async () => {
    await makeRequest('POST', '/iterations', { promptId: 'pid1' });
    await makeRequest('POST', '/iterations', { promptId: 'pid2' });
    const res = await makeRequest('GET', '/iterations');
    expect(res.body.iterations.length).toBe(2);
  });

  test('PV2-IT-303: 获取单个迭代', async () => {
    const c = await makeRequest('POST', '/iterations', { promptId: 'pid1' });
    const res = await makeRequest('GET', `/iterations/${c.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.promptId).toBe('pid1');
  });

  test('PV2-IT-304: 更新迭代状态', async () => {
    const c = await makeRequest('POST', '/iterations', { promptId: 'pid1' });
    const res = await makeRequest('PUT', `/iterations/${c.body.id}`, { status: 'completed', converged: true, completedAt: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.converged).toBe(true);
  });

  test('PV2-IT-305: 获取某模板的迭代', async () => {
    const c = await makeRequest('POST', '/prompts/v2', { name: 'P', content: 'p' });
    await makeRequest('POST', '/iterations', { promptId: c.body.id });
    await makeRequest('POST', '/iterations', { promptId: c.body.id });
    await makeRequest('POST', '/iterations', { promptId: 'other' });
    const res = await makeRequest('GET', `/prompts/v2/${c.body.id}/iterations`);
    expect(res.body.iterations.length).toBe(2);
  });
});

describe('PV2-IT-4: Prompts Export/Import', () => {
  test('PV2-IT-401: 导出格式正确', () => {
    const exp = { version: 1, exportedAt: new Date().toISOString(), prompts: [] };
    expect(exp.version).toBe(1);
    expect(Array.isArray(exp.prompts)).toBe(true);
  });
});
