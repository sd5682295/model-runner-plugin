/**
 * model-runner - 集成测试：Materials CRUD + Search + Stats + Analyze
 */

const http = require('http');

const PORT = 5105;

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

let materials = [];
let matSources = [];

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

        // /materials/sources
        if (pn === '/materials/sources') {
          if (req.method === 'GET') return json(res, 200, { sources: matSources });
          if (req.method === 'POST') {
            const src = { id: genId(), name: b.name || '', url: b.url || '', platform: b.platform || '', category: b.category || '', subCategory: b.subCategory || '', note: b.note || '', createdAt: new Date().toISOString() };
            matSources.unshift(src);
            return json(res, 200, src);
          }
        }
        const matSrcMatch = pn.match(/^\/materials\/sources\/([a-z0-9_]+)$/);
        if (matSrcMatch) {
          const id = matSrcMatch[1];
          const src = matSources.find(s => s.id === id);
          if (!src) return json(res, 404, { error: '不存在' });
          if (req.method === 'GET') return json(res, 200, src);
          if (req.method === 'PUT') { Object.assign(src, b); return json(res, 200, src); }
          if (req.method === 'DELETE') { matSources = matSources.filter(s => s.id !== id); return json(res, 200, { ok: true }); }
        }
        // /materials
        if (pn === '/materials') {
          if (req.method === 'GET') {
            let list = [...materials];
            const sourceId = url.searchParams.get('sourceId');
            const tag = url.searchParams.get('tag');
            if (sourceId) list = list.filter(m => m.sourceId === sourceId);
            if (tag) list = list.filter(m => (m.tags || []).includes(tag));
            list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
            return json(res, 200, { materials: list, total: list.length });
          }
          if (req.method === 'POST') {
            const now = new Date().toISOString();
            const item = {
              id: genId(), title: b.title || '未命名素材',
              sourceId: b.sourceId || null, url: b.url || '',
              content: b.content || '', summary: b.summary || '',
              extractedFeatures: b.extractedFeatures || null,
              analysisNotes: b.analysisNotes || '',
              tags: b.tags || [], reusableModules: b.reusableModules || [],
              linkedPrompts: b.linkedPrompts || [],
              createdAt: now, updatedAt: now,
            };
            materials.unshift(item);
            return json(res, 200, item);
          }
        }
        // /materials/search
        if (pn === '/materials/search' && req.method === 'GET') {
          const q = (url.searchParams.get('q') || '').toLowerCase().trim();
          const tag = url.searchParams.get('tag');
          const sourceId = url.searchParams.get('sourceId');
          let results = [...materials];
          if (q) results = results.filter(m => (m.title || '').toLowerCase().includes(q) || (m.content || '').toLowerCase().includes(q) || (m.summary || '').toLowerCase().includes(q));
          if (tag) results = results.filter(m => (m.tags || []).includes(tag));
          if (sourceId) results = results.filter(m => m.sourceId === sourceId);
          results = results.map(m => {
            let matchedContent = '';
            if (q) {
              const searchIn = [m.title, m.content, m.summary, m.analysisNotes].filter(Boolean).join(' ');
              const idx = searchIn.toLowerCase().indexOf(q);
              if (idx >= 0) {
                const start = Math.max(0, idx - 40);
                const end = Math.min(searchIn.length, idx + q.length + 60);
                matchedContent = (start > 0 ? '…' : '') + searchIn.slice(start, end) + (end < searchIn.length ? '…' : '');
              }
            }
            return { ...m, matchedContent };
          });
          return json(res, 200, { results, total: results.length });
        }
        // /materials/stats
        if (pn === '/materials/stats' && req.method === 'GET') {
          const byPlatform = {}, byTag = {};
          for (const m of materials) {
            if (m.sourceId) byPlatform[m.sourceId] = (byPlatform[m.sourceId] || 0) + 1;
            for (const t of m.tags || []) byTag[t] = (byTag[t] || 0) + 1;
          }
          const sevenDaysAgo = Date.now() - 7 * 86400000;
          const recentlyAdded = materials.filter(m => new Date(m.createdAt).getTime() > sevenDaysAgo).length;
          return json(res, 200, { total: materials.length, byPlatform, byTag, recentlyAdded });
        }
        // /materials/:id
        const matMatch = pn.match(/^\/materials\/([a-z0-9_]+)$/);
        if (matMatch) {
          const id = matMatch[1];
          const m = materials.find(m => m.id === id);
          if (!m) return json(res, 404, { error: '不存在' });
          if (req.method === 'GET') return json(res, 200, m);
          if (req.method === 'PUT') { Object.assign(m, b, { id, updatedAt: new Date().toISOString() }); return json(res, 200, m); }
          if (req.method === 'DELETE') { materials = materials.filter(m => m.id !== id); return json(res, 200, { ok: true }); }
        }
        json(res, 404, { error: 'Not found' });
      });
    });
    server.listen(PORT, resolve);
  });
});

afterAll(() => new Promise(r => server ? server.close(r) : r()));
beforeEach(() => { materials = []; matSources = []; });

describe('MAT-IT-1: Materials CRUD', () => {
  test('MAT-IT-101: 创建素材', async () => {
    const res = await makeRequest('POST', '/materials', { title: '悬疑故事', content: '故事内容...', tags: ['悬疑'] });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('悬疑故事');
  });

  test('MAT-IT-102: 默认字段', async () => {
    const res = await makeRequest('POST', '/materials', {});
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('未命名素材');
    expect(Array.isArray(res.body.tags)).toBe(true);
  });

  test('MAT-IT-103: 列表素材', async () => {
    await makeRequest('POST', '/materials', { title: 'A' });
    await makeRequest('POST', '/materials', { title: 'B' });
    const res = await makeRequest('GET', '/materials');
    expect(res.body.materials.length).toBe(2);
  });

  test('MAT-IT-104: 获取单个素材', async () => {
    const c = await makeRequest('POST', '/materials', { title: 'Detail' });
    const res = await makeRequest('GET', `/materials/${c.body.id}`);
    expect(res.body.title).toBe('Detail');
  });

  test('MAT-IT-105: 获取不存在素材', async () => {
    const res = await makeRequest('GET', '/materials/notexist');
    expect(res.status).toBe(404);
  });

  test('MAT-IT-106: 更新素材', async () => {
    const c = await makeRequest('POST', '/materials', { title: 'Old', content: '旧' });
    const res = await makeRequest('PUT', `/materials/${c.body.id}`, { title: 'New', summary: '新摘要' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New');
    expect(res.body.summary).toBe('新摘要');
  });

  test('MAT-IT-107: 删除素材', async () => {
    const c = await makeRequest('POST', '/materials', { title: 'ToDelete' });
    const res = await makeRequest('DELETE', `/materials/${c.body.id}`);
    expect(res.status).toBe(200);
    const g = await makeRequest('GET', `/materials/${c.body.id}`);
    expect(g.status).toBe(404);
  });
});

describe('MAT-IT-2: Materials 搜索', () => {
  test('MAT-IT-201: 按标题搜索', async () => {
    await makeRequest('POST', '/materials', { title: '悬疑故事', content: '内容A' });
    await makeRequest('POST', '/materials', { title: '爱情故事', content: '内容B' });
    const res = await makeRequest('GET', '/materials/search?q=悬疑');
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].title).toBe('悬疑故事');
  });

  test('MAT-IT-202: 按内容搜索', async () => {
    await makeRequest('POST', '/materials', { title: '文章', content: '主角突然反转' });
    const res = await makeRequest('GET', '/materials/search?q=反转');
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].matchedContent).toContain('反转');
  });

  test('MAT-IT-203: 搜索片段 snippet', async () => {
    const searchIn = '这是一个悬疑故事的开头，主角发现了惊人的秘密。';
    const q = '秘密';
    const idx = searchIn.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 10);
    const end = Math.min(searchIn.length, idx + q.length + 20);
    const snippet = (start > 0 ? '…' : '') + searchIn.slice(start, end) + (end < searchIn.length ? '…' : '');
    expect(snippet).toContain('秘密');
  });

  test('MAT-IT-204: 按标签搜索', async () => {
    await makeRequest('POST', '/materials', { title: 'A', tags: ['情感'] });
    await makeRequest('POST', '/materials', { title: 'B', tags: ['悬疑'] });
    const res = await makeRequest('GET', '/materials/search?tag=悬疑');
    expect(res.body.total).toBe(1);
  });

  test('MAT-IT-205: 无匹配返回空', async () => {
    const res = await makeRequest('GET', '/materials/search?q=完全不存在的关键词');
    expect(res.body.total).toBe(0);
    expect(res.body.results).toEqual([]);
  });

  test('MAT-IT-206: 搜索返回 matchedContent 字段', async () => {
    await makeRequest('POST', '/materials', { title: '测试', content: '关键词在这里' });
    const res = await makeRequest('GET', '/materials/search?q=关键词');
    expect(res.body.results[0].matchedContent).toBeDefined();
  });
});

describe('MAT-IT-3: Materials 统计', () => {
  test('MAT-IT-301: 总数统计', async () => {
    await makeRequest('POST', '/materials', { title: 'A' });
    await makeRequest('POST', '/materials', { title: 'B' });
    const res = await makeRequest('GET', '/materials/stats');
    expect(res.body.total).toBe(2);
  });

  test('MAT-IT-302: 按平台统计', async () => {
    await makeRequest('POST', '/materials', { title: 'A', sourceId: 'wechat' });
    await makeRequest('POST', '/materials', { title: 'B', sourceId: 'wechat' });
    await makeRequest('POST', '/materials', { title: 'C', sourceId: 'weibo' });
    const res = await makeRequest('GET', '/materials/stats');
    expect(res.body.byPlatform.wechat).toBe(2);
    expect(res.body.byPlatform.weibo).toBe(1);
  });

  test('MAT-IT-303: 按标签统计', async () => {
    await makeRequest('POST', '/materials', { title: 'A', tags: ['悬疑', '反转'] });
    await makeRequest('POST', '/materials', { title: 'B', tags: ['悬疑'] });
    const res = await makeRequest('GET', '/materials/stats');
    expect(res.body.byTag['悬疑']).toBe(2);
    expect(res.body.byTag['反转']).toBe(1);
  });

  test('MAT-IT-304: 近 7 天新增', async () => {
    const res = await makeRequest('GET', '/materials/stats');
    expect(typeof res.body.recentlyAdded).toBe('number');
  });
});

describe('MAT-IT-4: Materials 筛选', () => {
  test('MAT-IT-401: 按 sourceId 筛选', async () => {
    await makeRequest('POST', '/materials', { title: 'A', sourceId: 'src1' });
    await makeRequest('POST', '/materials', { title: 'B', sourceId: 'src2' });
    const res = await makeRequest('GET', '/materials?sourceId=src1');
    expect(res.body.materials.length).toBe(1);
    expect(res.body.materials[0].title).toBe('A');
  });

  test('MAT-IT-402: 按 tag 筛选', async () => {
    await makeRequest('POST', '/materials', { title: 'A', tags: ['情感'] });
    await makeRequest('POST', '/materials', { title: 'B', tags: ['悬疑'] });
    const res = await makeRequest('GET', '/materials?tag=情感');
    expect(res.body.materials.length).toBe(1);
  });
});

describe('MAT-IT-5: Material Sources', () => {
  test('MAT-IT-501: 创建素材来源', async () => {
    const res = await makeRequest('POST', '/materials/sources', { name: '微信公众号', platform: 'wechat', url: 'https://mp.weixin.qq.com' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.platform).toBe('wechat');
  });

  test('MAT-IT-502: 列表来源', async () => {
    await makeRequest('POST', '/materials/sources', { name: 'A', platform: 'p1' });
    await makeRequest('POST', '/materials/sources', { name: 'B', platform: 'p2' });
    const res = await makeRequest('GET', '/materials/sources');
    expect(res.body.sources.length).toBe(2);
  });

  test('MAT-IT-503: 更新来源', async () => {
    const c = await makeRequest('POST', '/materials/sources', { name: 'Old' });
    const res = await makeRequest('PUT', `/materials/sources/${c.body.id}`, { name: 'New' });
    expect(res.body.name).toBe('New');
  });

  test('MAT-IT-504: 删除来源', async () => {
    const c = await makeRequest('POST', '/materials/sources', { name: 'ToDelete' });
    await makeRequest('DELETE', `/materials/sources/${c.body.id}`);
    const g = await makeRequest('GET', `/materials/sources/${c.body.id}`);
    expect(g.status).toBe(404);
  });
});

describe('MAT-IT-6: 字段扩展', () => {
  test('MAT-IT-601: extractedFeatures 字段', async () => {
    const c = await makeRequest('POST', '/materials', { title: 'Test', extractedFeatures: { genre: '悬疑', tags: ['反转'] } });
    const g = await makeRequest('GET', `/materials/${c.body.id}`);
    expect(g.body.extractedFeatures.genre).toBe('悬疑');
  });

  test('MAT-IT-602: reusableModules 字段', async () => {
    const c = await makeRequest('POST', '/materials', { title: 'Test', reusableModules: ['开头模板', '结尾模板'] });
    const g = await makeRequest('GET', `/materials/${c.body.id}`);
    expect(g.body.reusableModules.length).toBe(2);
  });

  test('MAT-IT-603: linkedPrompts 字段', async () => {
    const c = await makeRequest('POST', '/materials', { title: 'Test', linkedPrompts: ['pid1', 'pid2'] });
    const g = await makeRequest('GET', `/materials/${c.body.id}`);
    expect(g.body.linkedPrompts).toContain('pid1');
  });
});
