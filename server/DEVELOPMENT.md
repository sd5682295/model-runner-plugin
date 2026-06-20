# Model Runner 开发文档

## 项目概览

本地 AI 模型测试中间件，通过 OpenAI 兼容 API 访问各类模型。
提供对话界面、多会话管理、Markdown 渲染等功能，同时对外暴露 HTTP 接口供 OpenClaw 等系统调用。

## 架构

### 目录结构

```
model-runner/
├── server.js          # Node.js HTTP 服务器（无第三方依赖）
├── index.html         # 单页前端（Vanilla JS）
├── config.json        # API 配置，自动生成
├── sessions/          # 会话数据（JSON 文件），自动生成
├── start.bat          # Windows 快速启动脚本
├── CLAUDE.md          # AI 助手行为规范
└── DEVELOPMENT.md     # 本文档
```

### 服务端架构

纯 Node.js（http/https 内置模块），**零 npm 依赖**，直接 `node server.js` 启动。

**API 端点总览：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 前端页面 |
| GET | `/config` | 读取 API 配置（不含 key） |
| POST | `/config` | 保存 API 配置 |
| GET | `/models` | 获取上游模型列表（代理） |
| POST | `/chat` | 非流式聊天完成 |
| POST | `/chat/stream` | 流式聊天完成（SSE） |
| GET | `/sessions` | 会话列表 |
| POST | `/sessions` | 创建会话 |
| GET | `/sessions/:id` | 读取会话完整数据 |
| PUT | `/sessions/:id` | 更新会话（消息/名称/模型） |
| DELETE | `/sessions/:id` | 删除会话 |

### 前端架构

单 HTML 文件，Vanilla JS + CDN：
- **marked.js** — Markdown 解析
- **highlight.js** — 代码语法高亮（atom-one-dark 主题）

## 数据格式

### config.json

```json
{
  "sources": [
    {
      "id": "mytokenland",
      "name": "api.mytokenland.com",
      "baseUrl": "https://api.mytokenland.com/v1",
      "apiKeys": ["sk-xxx"]
    },
    {
      "id": "dmxapi",
      "name": "api.dmxapi.cn",
      "baseUrl": "https://api.dmxapi.cn/v1",
      "apiKeys": ["sk-yyy"]
    }
  ],
  "activeSourceId": "mytokenland",
  "modelRoutes": {
    "gpt-5.5": {
      "preferredPlatforms": ["mytokenland", "dmxapi"],
      "disabledPlatforms": []
    }
  },
  "timeout": 120000,
  "retries": 1
}
```

`modelRoutes` 是模型级平台策略：`preferredPlatforms` 按顺序尝试，`disabledPlatforms` 是这个模型坚决不用的平台。遇到欠费、限流、5xx、超时或网络错误时，服务端会切到下一个备用平台。

### sessions/{id}.json

```json
{
  "id": "lz3k8abcd",
  "name": "会话名称（取自首条用户消息前30字）",
  "model": "gpt-4o",
  "system": "系统提示词",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### 聊天 API 请求（外部调用格式）

```
POST /chat
POST /chat/stream

{
  "model": "gpt-4o",
  "messages": [{ "role": "user", "content": "Hello" }],
  "system": "...",            // 可选
  "temperature": 0.7,
  "max_tokens": 4096,
  "callback_url": "http://..." // 可选，完成后 POST 回调
}
```

## 功能开发路线图

### Phase 1 — 核心体验 ✅（当前版本）

- [x] API 配置（baseUrl + key + timeout + retries）
- [x] 模型列表获取与选择
- [x] 流式 / 非流式聊天
- [x] 自动重试与超时
- [x] callback_url 异步回调
- [x] **Markdown 渲染 + 代码语法高亮**
- [x] **流式输出停止按钮**
- [x] **消息复制按钮**
- [x] **多会话管理（本地 JSON 持久化）**

### Phase 2 — 效率工具 ✅（已完成）

- [x] Prompt 模板库（保存/加载常用 system prompt）
- [x] 消息导出（Markdown / JSON）
- [x] Token 用量显示（流式 + 非流式）
- [x] 会话双击重命名

### Phase 3 — 高级功能（开发中）

> 计划开始：2026-05-04  预计完成：2026-05-11

#### 3-A：多 API 源配置 + 多 Key 轮换（优先级：最高）

**目标**：支持多套 API 源（不同厂商/baseUrl），每源可配多个 Key，自动轮换避免限频。

- [ ] `config.json` 结构升级：`{ sources:[{id,name,baseUrl,apiKeys[]}], activeSourceId, timeout, retries }`
- [ ] 服务端新增端点：`GET/POST /sources`、`PUT/DELETE /sources/:id`、`POST /sources/:id/activate`
- [ ] Key 轮换逻辑：round-robin + 429 冷却标记（`Map<key, cooldownUntil>`）
- [ ] 向后兼容旧版 `config.json`（单源迁移）
- [ ] 前端：顶栏显示当前源名 + 下拉快速切换，配置弹窗改为多源管理

#### 3-B：图片上传（多模态模型支持）（优先级：高）

**目标**：输入框支持粘贴/选择图片，消息以 OpenAI vision 格式发送。

- [ ] 输入栏添加图片按钮，支持 `<input type=file>` 选择 + `paste` 粘贴
- [ ] 预览缩略图 + 删除按钮
- [ ] 图片转 base64 data URL
- [ ] 发送时 `content` 改为 `[{type:'text',text:...},{type:'image_url',image_url:{url:base64}}]`
- [ ] 服务端 `handleChat` 已透传 messages，无需改动
- [ ] 会话存储中 base64 压缩策略（图片大时需警告/截断）

#### 3-C：请求日志与统计面板（优先级：中）

**目标**：记录每次请求的模型/token/延迟/状态，前端展示统计图表。

- [ ] 服务端：`logs/` 目录，每次请求追加 `{ts,model,source,promptTokens,completionTokens,latencyMs,status}` 到 `logs/YYYY-MM.jsonl`
- [ ] 新端点：`GET /logs?limit=N`、`GET /stats`（聚合：按模型/按天/总计）
- [ ] 前端：侧边统计面板（仿 sessions panel 设计），饼图/柱状图（用 SVG 手绘，不引入图表库）
- [ ] 显示：今日请求数、总 token 消耗、按模型分布、估算费用

#### 3-D：模型对比（同消息多模型并排）（优先级：中）

**目标**：一键把同一条消息发给 2-4 个模型，并排展示回复。

- [ ] 顶栏「对比模式」开关
- [ ] 对比模式下：模型选择变为多选 checkbox（最多 4 个）
- [ ] 聊天区改为水平分列布局（每模型一列）
- [ ] 并发发起多个 `/chat/stream`，各列独立显示流式输出
- [ ] 对比结果保存为会话（特殊格式：`{type:'compare', models:[], results:[]}`）

#### 开发顺序 & 依赖关系

```
3-A（多源配置）
  └─ 基础设施，先做，其他功能均可受益

3-B（图片上传）
  └─ 独立功能，不依赖 3-A，可并行

3-C（日志统计）
  └─ 依赖 3-A（需记录 source），建议在 3-A 后

3-D（模型对比）
  └─ 独立功能，UI 最复杂，最后做
```

#### 各功能进度

| 功能 | 状态 | 备注 |
|------|------|------|
| 3-A 多 API 源配置（后端） | ✅ 完成 | server.js：migrateLegacyConfig, handleSources, /sources 路由 |
| 3-A 模型级平台路由 | ✅ 完成 | modelRoutes：preferredPlatforms 顺序优先，disabledPlatforms 黑名单，失败自动切备用 |
| 3-A 多 Key 轮换（后端） | ✅ 完成 | server.js：getNextApiKey, cooldownKey, round-robin |
| 3-A 多源配置（前端） | 🔄 下一步 | index.html：源选择器 + 配置弹窗改造 |
| 3-B 图片上传 | 🔲 待开发 | index.html：🖼按钮 + paste + vision 格式 |
| 3-C 请求日志（后端） | ✅ 完成 | server.js：appendLog, logs/YYYY-MM.jsonl, /logs, /stats |
| 3-C 统计面板（前端） | 🔲 待开发 | index.html：SVG 图表弹窗 |
| 3-D 模型对比 | 🔲 待开发 | |

## 技术说明

### Markdown 渲染策略

| 消息类型 | 处理方式 | 原因 |
|----------|----------|------|
| 用户消息 | `textContent`（纯文本） | 避免 XSS，用户输入不可信 |
| 助手消息（非流式） | `marked.parse()` 直接渲染 | 输出可信，完整内容 |
| 助手消息（流式中） | 纯文本实时追加 | 避免 Markdown 半解析问题 |
| 助手消息（流式完成） | `marked.parse()` 补渲染 | 流式结束后统一渲染 |

### 会话 ID 格式

`Date.now().toString(36) + Math.random().toString(36).slice(2,6)` — 约 11 位小写字母数字，唯一性足够。

### 自动保存时机

每次助手回复完成后（流式/非流式均触发），fire-and-forget 方式调用 `PUT /sessions/:id`，不阻塞 UI。

### 停止生成实现

使用 `AbortController`，`fetch` 时传入 `signal`。中止后将已接收内容保存到对话历史，不丢弃已生成部分。
