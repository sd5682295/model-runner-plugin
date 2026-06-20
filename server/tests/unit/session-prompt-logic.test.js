/**
 * model-runner - 单元测试：会话/Prompt/迭代/素材 逻辑
 */

const path = require('path');
const fs = require('fs');

const TEST_SESSIONS_DIR = path.join(__dirname, '..', '..', 'sessions-ut2-test');

function cleanup() {
  try {
    fs.readdirSync(TEST_SESSIONS_DIR).forEach(f => fs.unlinkSync(path.join(TEST_SESSIONS_DIR, f)));
    fs.rmdirSync(TEST_SESSIONS_DIR);
  } catch {}
}

beforeAll(() => cleanup());
afterAll(() => cleanup());

// ─── 会话文件操作 ─────────────────────────────────────────────────────────

describe('UT-SESS-1: 会话数据结构', () => {
  test('UT-SESS-101: 合法会话对象结构', () => {
    const s = {
      id: 'abc123',
      name: '测试会话',
      model: 'gpt-4o',
      system: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    expect(s.id).toBe('abc123');
    expect(Array.isArray(s.messages)).toBe(true);
    expect(s.createdAt).toBeDefined();
  });

  test('UT-SESS-102: 消息数组可添加', () => {
    const messages = [];
    messages.push({ role: 'user', content: 'hello' });
    messages.push({ role: 'assistant', content: 'hi' });
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
  });
});

// ─── Prompt 模板 ─────────────────────────────────────────────────────────

describe('UT-PROMPT-1: Prompt 模板结构', () => {
  test('UT-PROMPT-101: 合法模板对象', () => {
    const p = {
      id: 'pid1',
      name: '诗人模式',
      content: '你是一个诗人',
      createdAt: new Date().toISOString(),
    };
    expect(p.name).toBe('诗人模式');
    expect(p.content).toContain('诗人');
  });

  test('UT-PROMPT-102: 默认名称处理', () => {
    const p = { id: 'pid1', name: undefined, content: '' };
    const name = p.name || '未命名模板';
    expect(name).toBe('未命名模板');
  });
});

describe('UT-PROMPT-2: Prompt v2 结构', () => {
  test('UT-PROMPT-201: 含变量的模板', () => {
    const p = {
      id: 'pv2-1',
      name: '分析模板',
      content: '分析{{genre}}类型文章',
      variables: ['genre'],
      tags: ['分析'],
      createdAt: new Date().toISOString(),
    };
    expect(p.variables).toContain('genre');
  });

  test('UT-PROMPT-202: 变量替换逻辑', () => {
    const content = '写一个{{genre}}故事';
    const genre = '悬疑';
    const filled = content.replace(/\{\{genre\}\}/g, genre);
    expect(filled).toBe('写一个悬疑故事');
  });

  test('UT-PROMPT-203: 多变量替换', () => {
    const content = '{{role}}对{{target}}说{{action}}';
    const vars = { role: 'A', target: 'B', action: '你好' };
    let filled = content;
    for (const [k, v] of Object.entries(vars)) {
      filled = filled.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    }
    expect(filled).toBe('A对B说你好');
  });
});

// ─── 迭代记录 ─────────────────────────────────────────────────────────────

describe('UT-ITER-1: 迭代数据结构', () => {
  test('UT-ITER-101: 迭代对象结构', () => {
    const iter = {
      id: 'iter1',
      promptId: 'pid1',
      version: 1,
      content: '原始内容',
      result: '生成结果',
      feedback: '',
      metrics: { quality: 0.7, engagement: 0.5 },
      createdAt: new Date().toISOString(),
    };
    expect(iter.version).toBe(1);
    expect(iter.metrics.quality).toBeGreaterThan(0);
  });

  test('UT-ITER-102: 质量分数计算', () => {
    const m = { quality: 0.8, engagement: 0.6 };
    const score = (m.quality * 0.6 + m.engagement * 0.4);
    expect(score).toBe(0.72);
  });
});

// ─── 素材库 ─────────────────────────────────────────────────────────────

describe('UT-MAT-1: 素材数据结构', () => {
  test('UT-MAT-101: 完整素材对象', () => {
    const m = {
      id: 'mat1',
      title: '测试标题',
      sourceId: 's1',
      url: 'https://example.com/article',
      content: '正文内容...',
      summary: '摘要',
      extractedFeatures: { genre: '悬疑', tags: ['反转'] },
      analysisNotes: '分析笔记',
      tags: ['悬疑', '反转'],
      reusableModules: ['开头模板'],
      linkedPrompts: ['pid1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(m.tags).toContain('悬疑');
    expect(m.extractedFeatures.genre).toBe('悬疑');
  });

  test('UT-MAT-102: 素材标签去重合并', () => {
    const existing = ['悬疑', '反转'];
    const newTags = ['悬疑', '情感', '反转', '爽文'];
    const merged = [...new Set([...existing, ...newTags])];
    expect(merged).toEqual(['悬疑', '反转', '情感', '爽文']);
  });
});

describe('UT-MAT-2: 素材搜索匹配', () => {
  test('UT-MAT-201: 标题匹配', () => {
    const q = '悬疑';
    const mat = { title: '悬疑故事', content: '', summary: '' };
    const match = (mat.title || '').toLowerCase().includes(q);
    expect(match).toBe(true);
  });

  test('UT-MAT-202: 正文内容匹配', () => {
    const q = '反转';
    const mat = { title: '故事', content: '主角身份发生巨大反转', summary: '' };
    const match = (mat.content || '').toLowerCase().includes(q);
    expect(match).toBe(true);
  });

  test('UT-MAT-203: 标签匹配', () => {
    const tag = '悬疑';
    const mat = { tags: ['悬疑', '情感'] };
    expect(mat.tags.includes(tag)).toBe(true);
  });

  test('UT-MAT-204: 搜索片段提取', () => {
    const searchIn = '这是一个悬疑故事的开头。';
    const q = '悬疑';
    const idx = searchIn.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 10);
    const end = Math.min(searchIn.length, idx + q.length + 20);
    const snippet = (start > 0 ? '…' : '') + searchIn.slice(start, end) + (end < searchIn.length ? '…' : '');
    expect(snippet).toContain('悬疑');
  });
});

describe('UT-MAT-3: 素材统计', () => {
  test('UT-MAT-301: 按平台统计', () => {
    const materials = [
      { sourceId: 's1', tags: ['A'] },
      { sourceId: 's1', tags: ['B'] },
      { sourceId: 's2', tags: ['A'] },
    ];
    const byPlatform = {};
    for (const m of materials) {
      byPlatform[m.sourceId] = (byPlatform[m.sourceId] || 0) + 1;
    }
    expect(byPlatform.s1).toBe(2);
    expect(byPlatform.s2).toBe(1);
  });

  test('UT-MAT-302: 按标签统计', () => {
    const materials = [
      { tags: ['悬疑', '反转'] },
      { tags: ['悬疑'] },
      { tags: ['情感'] },
    ];
    const byTag = {};
    for (const m of materials) {
      for (const t of m.tags) byTag[t] = (byTag[t] || 0) + 1;
    }
    expect(byTag['悬疑']).toBe(2);
    expect(byTag['反转']).toBe(1);
    expect(byTag['情感']).toBe(1);
  });

  test('UT-MAT-303: 近 7 天新增', () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400000;
    const materials = [
      { createdAt: new Date(now - 1 * 86400000).toISOString() },
      { createdAt: new Date(now - 3 * 86400000).toISOString() },
      { createdAt: new Date(now - 10 * 86400000).toISOString() },
    ];
    const recent = materials.filter(m => new Date(m.createdAt).getTime() > sevenDaysAgo);
    expect(recent.length).toBe(2);
  });
});

// ─── 来源 ID 生成 ───────────────────────────────────────────────────────

describe('UT-SRC-ID-1: 来源 ID 生成', () => {
  let _idSeq = 0;
  function genSourceId() { return 'src_' + Date.now().toString(36) + (_idSeq++).toString(36); }
  function validSourceId(id) { return typeof id === 'string' && /^[a-z0-9_]+$/.test(id); }

  test('UT-SRC-ID-101: 生成的 ID 格式正确', () => {
    const id = genSourceId();
    expect(id.startsWith('src_')).toBe(true);
    expect(validSourceId(id)).toBe(true);
  });

  test('UT-SRC-ID-102: 唯一性（50次，碰撞概率 < 1e-10）', () => {
    const ids = Array.from({ length: 50 }, () => genSourceId());
    expect(new Set(ids).size).toBe(50);
  });
});

// ─── 素材来源 ────────────────────────────────────────────────────────────

describe('UT-MATSRC-1: 素材来源结构', () => {
  test('UT-MATSRC-101: 完整对象', () => {
    const src = {
      id: 'ms1',
      name: '微信公众号',
      platform: 'wechat',
      url: 'https://mp.weixin.qq.com',
      note: '备注',
      createdAt: new Date().toISOString(),
    };
    expect(src.platform).toBe('wechat');
  });
});

// ─── 聊天参数验证 ─────────────────────────────────────────────────────────

describe('UT-CHAT-1: 聊天参数校验', () => {
  function validPayload(payload) {
    return !!(payload.model && payload.messages && payload.messages.length > 0);
  }

  test('UT-CHAT-101: 合法 payload', () => {
    expect(validPayload({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] })).toBe(true);
  });
  test('UT-CHAT-102: 缺少 model', () => {
    expect(validPayload({ messages: [{ role: 'user', content: 'hi' }] })).toBe(false);
  });
  test('UT-CHAT-103: 空 messages', () => {
    expect(validPayload({ model: 'gpt-4o', messages: [] })).toBe(false);
  });
  test('UT-CHAT-104: messages 为 null', () => {
    expect(validPayload({ model: 'gpt-4o', messages: null })).toBe(false);
  });
  test('UT-CHAT-105: system 消息处理', () => {
    const payload = { model: 'gpt-4o', system: '你是助手', messages: [{ role: 'user', content: 'hi' }] };
    const msgs = payload.messages.slice();
    if (payload.system) msgs.unshift({ role: 'system', content: payload.system });
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
  });
});
