# model-runner 测试计划

> 生成时间：2026-05-09
> 范围：server.js 全端点 + 前端 index.html

---

## 一、项目架构概览

**技术栈：** 纯 Node.js HTTP 服务器，无 Express，无 npm 依赖
**核心文件：** server.js（约 1400 行）+ index.html（单页前端）

**功能模块：**
1. AI 聊天代理（/chat, /chat/stream）
2. 多源 API 管理（sources, key 轮换）
3. 会话管理（sessions CRUD）
4. Prompt 模板库（prompts v1 + v2）
5. 素材库（materials + sources）
6. 迭代追踪（iterations）
7. 健康检查 + 熔断器
8. 统计日志（logs, stats）
9. 配置管理（config）

---

## 二、现有测试审计

### 已有测试（8 个文件）

| 文件 | 方法 | 测试数 | 状态 |
|------|------|--------|------|
| `tests/unit/index.test.js` | 单元测试 | 17 | 完整 |
| `tests/integration/index.test.js` | 集成测试 | 27 | 完整 |
| `tests/external/functional.test.js` | 功能测试 | 48 | 完整 |
| `tests/smoke/smoke.test.js` | 冒烟测试 | 6 | ⚠️ 需真服务器 |
| `tests/regression.test.js` | 回归测试 | 9 | 完整 |
| `tests/security.test.js` | 安全测试 | 9 | 基础 |
| `tests/streaming.test.js` | 流式测试 | 4 | 基础 |
| `tests/concurrency.test.js` | 并发测试 | 5 | 基础 |

### 已有测试的端点覆盖

| 端点 | 单元 | 集成 | 功能 | 回归 | 安全 | 流式 | 并发 | 冒烟 |
|------|------|------|------|------|------|------|------|------|
| GET /config | ✅ | ✅ | ✅ | ✅ | ✅ | | | ✅ |
| POST /config | | ✅ | ✅ | | | | | ✅ |
| GET /models | | ✅ | ✅ | | | | | |
| POST /chat | | ✅ | ✅ | ✅ | | | ✅ | |
| POST /chat/stream | | ✅ | ✅ | | | ✅ | | |
| GET /sessions | | ✅ | ✅ | | | | | ✅ |
| POST /sessions | | ✅ | ✅ | | | | ✅ | ✅ |
| GET /sessions/:id | | ✅ | ✅ | ✅ | ✅ | | | |
| PUT /sessions/:id | | ✅ | ✅ | | | | | |
| DELETE /sessions/:id | | ✅ | ✅ | ✅ | | | ✅ | |
| GET /prompts | | ✅ | ✅ | | | | | |
| POST /prompts | | ✅ | ✅ | | | | | |
| DELETE /prompts/:id | | ✅ | ✅ | | | | | |
| GET /sources | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST /sources | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| PUT /sources/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE /sources/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST /sources/:id/activate | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /health | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /models/all | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /logs | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /stats | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /prompts/v2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST /prompts/v2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /prompts/v2/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| PUT /prompts/v2/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE /prompts/v2/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /prompts/v2/:id/versions | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /prompts/v2/:id/iterations | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /iterations | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST /iterations | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /iterations/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| PUT /iterations/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /materials | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST /materials | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /materials/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| PUT /materials/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE /materials/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /materials/search | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /materials/stats | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST /materials/:id/analyze | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /materials/:id/features | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /materials/sources | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST /materials/sources | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /materials/sources/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| PUT /materials/sources/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE /materials/sources/:id | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET /prompts/export | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST /prompts/import | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**结论：** 大量端点完全没有测试覆盖。

---

## 三、测试用例规划

### 8 种测试方法

| # | 方法 | 已有覆盖 | 需补充 |
|---|------|----------|--------|
| 1 | 单元测试 | 17 | +Sources/Health/Retry 逻辑 |
| 2 | 边界测试 | 部分 | +多源/熔断/超长输入 |
| 3 | 错误处理 | 部分 | +全部端点 |
| 4 | 逆向测试 | 部分 | +非法路径 |
| 5 | 性能测试 | ❌ | +全部端点 |
| 6 | 安全测试 | 基础 | +多源隔离/污染 |
| 7 | 并发测试 | 5 | +多源 + API Key |
| 8 | 集成测试 | 27 | +新端点 |

---

## 四、待创建测试文件

### 4.1 tests/unit/sources-health.test.js
- 来源管理 CRUD（来源创建/读取/更新/删除/激活）
- 健康状态查询（/health）
- 熔断器状态转移（healthy → degraded → circuit_open）
- Key 轮换逻辑（Round-robin，cooldown）
- 模型路由（getRouteForModel, resolveSourceForModel）

### 4.2 tests/unit/chat-logic.test.js
- fetchWithRetry 重试逻辑
- backoff 延迟
- streamRequest 错误处理
- callback_url 调用
- 非 JSON 响应处理（502）

### 4.3 tests/integration/sources-crud.test.js
- /sources 端点集成测试（POST/GET/PUT/DELETE/activate）

### 4.4 tests/integration/health-circuit.test.js
- /health 端点
- 熔断器自动恢复（5 分钟后检测）
- /models/all 多源并行查询

### 4.5 tests/integration/prompts-v2.test.js
- /prompts/v2 CRUD
- 版本历史（/prompts/v2/:id/versions）
- 迭代关联（/prompts/v2/:id/iterations）

### 4.6 tests/integration/materials.test.js
- /materials CRUD + 搜索 + 统计 + 分析

### 4.7 tests/integration/iterations.test.js
- /iterations CRUD

### 4.8 tests/external/retry-circuit.test.js
- 重试机制：429/5xx 重试
- 熔断机制：连续失败触发
- Key cooldown：429 后 key 进入冷却

### 4.9 tests/performance/performance.test.js
- 并发会话创建 100 个
- 会话列表读取（N=100）
- 并发聊天 10 个请求

### 4.10 tests/security/multi-source-isolation.test.js
- 多源配置隔离
- 来源间会话不互通
- 越权访问防护

---

## 五、执行顺序

```
第一波：单元测试（不依赖服务器进程）
第二波：集成测试（每个文件自建 mock 服务器）
第三波：功能测试
第四波：安全/并发
第五波：性能测试
最后：冒烟测试（需要真服务器运行）
```

---

## 六、通过标准

- 单元测试：100% 通过
- 集成测试：100% 通过
- 功能测试：100% 通过
- 性能测试：所有操作 < 500ms（含 mock 延迟）
- 安全测试：无越权访问
