# Task: Model-Runner 多平台容错升级

## 背景

Model-Runner 是幽灵的本地 AI 模型中间件（Node.js，端口 4000），已有功能：API 配置、流式/非流式聊天、会话管理、Prompt 模板、多 API 源后端、请求日志后端、成本统计后端。

## 需求

### 1. 多平台配置结构（config.json 改造）

**目标**：这里的“多平台”指多组中间商平台配置，一组 `baseUrl + apiKeys` 就是一个平台；每个平台下面有多个模型。同一个模型可以配置优先平台、备用平台，以及坚决不用的平台。

**config.json 改造示例**：
```json
{
  "sources": [
    {
      "id": "mytokenland",
      "name": "api.mytokenland.com",
      "baseUrl": "https://api.mytokenland.com/v1",
      "apiKeys": ["key1", "key2"]
    },
    {
      "id": "dmxapi",
      "name": "api.dmxapi.cn",
      "baseUrl": "https://api.dmxapi.cn/v1",
      "apiKeys": ["key3"]
    }
  ],
  "modelRoutes": {
    "gpt-5.5": {
      "preferredPlatforms": ["mytokenland", "dmxapi"],
      "disabledPlatforms": []
    },
    "claude-opus-4-7": {
      "preferredPlatforms": ["dmxapi", "mytokenland"],
      "disabledPlatforms": ["bad-platform"]
    },
    "kimi-2.5": {
      "preferredPlatforms": ["dmxapi"],
      "disabledPlatforms": ["mytokenland"]
    }
  }
}
```

**路由逻辑**：
- 请求来时，根据 `model` 名查 `modelRoutes`
- 按 `preferredPlatforms` 顺序尝试平台，不做随机权重
- 如果优先平台欠费、限流、500/502/503/504、超时或网络错误，则切换到下一个备用平台
- `disabledPlatforms` 是模型级黑名单：这个模型坚决不用这些平台，宁愿返回错误或由调用方换模型
- 某个平台没有写在某个模型的 `preferredPlatforms` 里，就不会用于这个模型
- source 的 key 限速或欠费时进入冷却，并尝试同平台其他 key 或备用平台

### 2. 健康检查子系统

**目标**：每 60 秒探测各 source 的可用性，记录状态。

**实现要求**：
- 新增 `healthState.json`：记录每个 source 的健康状态
  ```json
  {
    "mytokenland": {
      "status": "healthy",  // healthy | degraded | circuit_open
      "lastCheck": "2026-05-07T15:00:00Z",
      "errorRate": 0.02,
      "avgLatencyMs": 1500,
      "consecutiveFailures": 0,
      "circuitOpenAt": null
    }
  }
  ```
- `/health` 端点返回所有 source 状态
- 探测方式：发 `/models` 请求，记录延迟和成功率
- 启动时运行一次探测，填充初始状态

### 3. 熔断 + 自动故障转移

**熔断规则**：
- 连续 5 次失败 → 标记 source 为 `degraded`，降低权重到 1/10
- `degraded` 状态下再失败 3 次 → 标记为 `circuit_open`，摘除 5 分钟
- 每 5 分钟探测一次 `circuit_open` 的 source，连续 3 次成功则恢复

**cascade_chat.js 改造**：
- 原有 cascade 是「模型链」级联重试
- 新增「平台链」：同一模型按 `modelRoutes` 顺序尝试不同 source
- 当一个 source 返回 5xx/超时时，自动切换到下一个 source
- 切换 source 时 log 明确告知：`[gpt-5.5@mytokenland] 失败，切换到 [gpt-5.5@dmxapi]`

### 4. /sources API 端点

```
GET  /sources          # 返回所有 source 及其健康状态
POST /sources          # 添加新 source
PUT  /sources/:id     # 更新 source 配置
DELETE /sources/:id    # 删除 source
POST /sources/:id/activate  # 切换活跃 source
```

## 技术要求

- **纯 Node.js**：继续零 npm 依赖，只用内置模块
- **向后兼容**：现有 config.json 的单 source 配置必须兼容
- **持久化**：`healthState.json` 每分钟写一次磁盘
- **性能**：健康检查异步执行，不阻塞正常请求

## 交付物

1. 改造后的 `config.json` 结构（向后兼容）
2. 改造后的 `server.js`（新增路由、健康检查、熔断逻辑）
3. 新增 `healthState.json` 状态文件
4. 新增 `/health` 和 `/sources` 端点
5. 改造后的 `cascade_chat.js`
6. 更新 `DEVELOPMENT.md` 记录新架构

## 测试用例

1. 模拟 mytokenland 返回 500，观察是否自动切换到 dmxapi
2. 模拟两个 source 都失败，确认返回友好错误
3. 恢复后，确认 source 状态变回 healthy
4. 不带 modelRoutes 的旧 config.json 仍然正常工作
