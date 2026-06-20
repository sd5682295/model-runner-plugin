# Model Runner 前端精简方案

> 目标：前端只保留「选模型 + 聊天 + 会话」，平台/Key/路由全部由 API 管理。

## 现状问题

1. 前端暴露了 `配置 API` 按钮 → 用户可以直接改 BaseURL/API Key/平台
2. 前端有模型路由编辑器 → 用户可以手动改优先级
3. `GET /sources` 返回明文 API Key → 安全风险
4. 前端直接操作 `modelRoutes` 数据结构 → 不该暴露这个复杂度

## 实施步骤

---

### 步骤 1：隐藏配置按钮（低风险）

**文件：** `index.html` 第 211 行

把：

```html
<button class="secondary" onclick="openCfg()">⚙ 配置 API</button>
```

改为：

```html
<button class="secondary" id="btn-api-managed" onclick="showApiManagedNotice()">🔒 API 由后台管理</button>
```

在 JS 区域加：

```js
function showApiManagedNotice() {
  alert('模型平台、BaseURL、API Key、路由优先级由 API / OpenClaw 管理。\n前端只负责选择模型和发起对话。');
}
```

---

### 步骤 2：隐藏路由编辑 UI（低风险）

**文件：** `index.html`

把以下 DOM 区块用 `hidden` class 隐藏（不删除，方便以后恢复）：

```html
<div id="route-editor" class="hidden">...</div>
<div id="batch-route-panel" class="hidden">...</div>
<div id="price-wizard" class="hidden">...</div>
```

把模型列表中的路由勾选框也隐藏：

```html
<!-- 找到 renderModels 里的这行： -->
<input type="checkbox" class="route-model-check" ...>

<!-- 删掉这行，整个 checkbox 不要了 -->
```

---

### 步骤 3：新增 `/models/catalog` API（后端）

**文件：** `server.js`

在路由注册处（第 1567 行附近）加：

```js
if (pathname === '/models/catalog' && req.method === 'GET') return handleModelCatalog(req, res);
```

添加函数：

```js
async function handleModelCatalog(req, res) {
  const cfg = loadConfig();
  const routes = listModelRoutes(cfg);
  const sources = sourceList(cfg);

  const byModel = new Map();
  for (const src of sources) {
    try {
      const models = await fetchModels(src).catch(() => []);
      for (const m of (models || [])) {
        if (!m.id) continue;
        const route = routes[m.id] || {};
        const preferred = route.preferredPlatforms || [];
        const disabled = route.disabledPlatforms || [];
        const prefSource = preferred[0] ? sources.find(s => s.id === preferred[0]) : null;
        const health = src.healthState?.[src.id]?.status || 'unknown';
        byModel.set(m.id, {
          id: m.id,
          displayName: m.displayName || m.id,
          platformCount: sources.filter(s => {
            const r = routes[m.id];
            if (!r) return true;
            return !(r.disabledPlatforms || []).includes(s.id);
          }).length,
          preferredSourceName: prefSource?.name || '',
          routeSummary: preferred.length ? preferred.map(id => sources.find(s => s.id === id)?.name || id).join(' → ') : '',
          health,
          preferredPlatforms: preferred,
          disabledPlatforms: disabled,
        });
      }
    } catch {}
  }

  return json(res, 200, {
    models: [...byModel.values()].sort((a, b) => a.id.localeCompare(b.id)),
    timestamp: new Date().toISOString(),
  });
}
```

---

### 步骤 4：修复 `/sources` 安全（必须）

**文件：** `server.js` 第 398 行附近，`handleSources` 的 GET 分支

把：

```js
const list = sources.map(s => ({
  id: s.id,
  name: s.name,
  baseUrl: s.baseUrl,
  apiKeys: s.apiKeys || s.keys || [],   // ← 危险
  keyCount: ((s.apiKeys || s.keys) || []).length,
}));
```

改为：

```js
const list = sources.map(s => {
  const keys = s.apiKeys || s.keys || [];
  return {
    id: s.id,
    name: s.name,
    baseUrl: s.baseUrl,
    hasKey: keys.length > 0,
    keyCount: keys.length,
    active: s.id === cfg.activeSourceId,
  };
});
```

如果需要查看 Key，只允许带参数时返回掩码：

```js
// GET /sources?includeSecrets=1
const includeSecrets = new URL(req.url, 'http://localhost').searchParams.get('includeSecrets') === '1';
if (includeSecrets) {
  // 返回 sk-****e274 格式
}
```

---

### 步骤 5：补 OpenAI 兼容端点 `/v1/chat/completions`

**文件：** `server.js`

路由注册处加：

```js
if (pathname === '/v1/chat/completions' && req.method === 'POST') return handleChat(req, res, false);
if (pathname === '/v1/chat/completions' && req.method === 'GET') return handleChat(req, res, false);
```

注意：OpenAI 的 `/v1/chat/completions` 只接受 POST，所以 GET 可以返回 405。

---

### 步骤 6：前端切到 `/models/catalog`

**文件：** `index.html`，`loadAllModels` 函数

把：

```js
const r = await fetch('/models/all');
const d = await r.json();
```

改为：

```js
const r = await fetch('/models/catalog');
const d = await r.json();
```

然后简化 `renderModels` 里对 `modelRoutes` 的依赖：

```js
// 删除 route-model-check 相关逻辑
// 删除 platforms 里的路由文字显示
// 只保留：模型名 + 健康状态 + 优先平台名（只读）
```

---

### 步骤 7：清理前端 JS 代码

删除或注释以下函数（保留但注释掉，不立即删）：

```js
// function openCfg() { ... }
// function closeCfg() { ... }
// function selectCfgSource() { ... }
// function newCfgSource() { ... }
// function deleteCfgSource() { ... }
// function saveConfig() { ... }
// function refreshCfgSources() { ... }
// function renderRouteEditor() { ... }
// function saveSelectedModelRoute() { ... }
// function saveBatchRoutes() { ... }
// function startPriceRouteWizard() { ... }
// function moveRouteOption() { ... }
// function syncBatchRouteOptions() { ... }
```

对应的 HTML DOM 节点也可以加 `hidden` class，而不是直接删除。

---

### 步骤 8：更新测试文件

新增测试覆盖：

```js
// tests/integration/model-catalog.test.js
// - GET /models/catalog 返回正确结构
// - 不返回 modelRoutes 内部细节

// tests/security.test.js 加：
// - GET /sources 不包含明文 apiKey
// - GET /sources 不包含 keys 数组
```

---

## 优先级

| 步骤 | 风险 | 优先级 |
|------|------|--------|
| 步骤 4 安全修复 | 低，逻辑清晰 | P0 必须做 |
| 步骤 5 OpenAI 兼容 | 低，纯追加 | P1 |
| 步骤 1 隐藏配置按钮 | 极低，只改文案 | P1 |
| 步骤 2 隐藏路由 UI | 极低，CSS 隐藏 | P1 |
| 步骤 3 新 catalog API | 中，需测试 | P2 |
| 步骤 6 前端切 catalog | 中，需联调 | P2 |
| 步骤 7 清理 JS | 低，注释即可 | P3 |
| 步骤 8 新测试 | 低，追加 | P3 |

---

## 验收标准

1. `GET /sources` 返回不包含 `apiKeys` 或 `keys` 字段
2. `POST /v1/chat/completions` 等价于 `POST /chat`
3. 前端页面无「配置 API」按钮
4. 前端模型列表不显示路由编辑控件
5. `GET /models/catalog` 返回 `{ models: [...], timestamp }` 结构
6. 现有 321 个自动化测试仍然全通过
7. 新增安全测试：验证 Key 不泄露