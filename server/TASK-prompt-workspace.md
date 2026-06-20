# Task: 写作 Prompt 工作台

## 背景

幽灵有大量写作专用的 prompt（爆款小说/文章/编辑偏好等），需要一个高效管理和持续迭代的 prompt 工作台，**不是简单列表，是能循环优化的系统**。

## 核心原则

- 不做整体工作流（每个 prompt 独立管理）
- 只有关键 prompt 完善后才考虑组合工作流
- 优先做：分类管理、版本历史、变量插槽、循环优化

## 数据结构设计

### prompt.json（Prompt 存储）

```json
[
  {
    "id": "p_001",
    "name": "断亲爽文-开局模板",
    "category": ["小说", "爽文", "开局"],
    "variables": [
      {"key": "{{主角关系}}", "desc": "如：母亲/父亲/婆婆", "required": true},
      {"key": "{{背叛事件}}", "desc": "具体背叛行为", "required": true},
      {"key": "{{反击方式}}", "desc": "主角如何反击", "default": "打脸"},
      {"key": "{{字数要求}}", "desc": "目标字数", "default": "2000"}
    ],
    "content": "你是一个擅长写网络爽文的作者...",
    "version": 3,
    "versions": [
      {"v": 1, "content": "原始版本...", "updatedAt": "2026-04-01", "note": "初始创建"},
      {"v": 2, "content": "加入节奏控制...", "updatedAt": "2026-04-15", "note": "增加冲突递进"},
      {"v": 3, "content": "当前版本", "updatedAt": "2026-05-01", "note": "优化开头钩子"}
    ],
    "stats": {
      "useCount": 47,
      "avgScore": 4.2,
      "lastUsed": "2026-05-06"
    },
    "tags": ["断亲", "打脸", "家庭爽文"],
    "createdAt": "2026-04-01",
    "updatedAt": "2026-05-01"
  }
]
```

### iteration.json（优化迭代记录）

```json
[
  {
    "id": "iter_001",
    "promptId": "p_001",
    "status": "completed",  // running | completed | stopped
    "goal": "提升开篇钩子的吸引力",
    "references": [
      {"type": "good", "content": "爆款文A的开头..."},
      {"type": "bad", "content": "效果不好的开头..."}
    ],
    "rounds": [
      {
        "round": 1,
        "prompt": "上一版本的prompt内容...",
        "output": "模型生成的内容...",
        "scores": {"开篇": 3, "冲突": 4, "节奏": 3.5},
        "modification": "增加了'前3秒必须制造悬念'的要求",
        "timestamp": "2026-05-07T10:00:00Z"
      },
      {
        "round": 2,
        "prompt": "修改后的prompt...",
        "output": "模型生成的内容...",
        "scores": {"开篇": 4, "冲突": 4.5, "节奏": 4},
        "modification": "进一步强调情感冲突",
        "timestamp": "2026-05-07T10:05:00Z"
      }
    ],
    "finalPrompt": "最终优化后的prompt内容...",
    "finalScores": {"开篇": 4.5, "冲突": 4.5, "节奏": 4},
    "converged": true,
    "createdAt": "2026-05-07T10:00:00Z",
    "completedAt": "2026-05-07T10:10:00Z"
  }
]
```

## 功能模块

### 1. Prompt CRUD（基础管理）

**API 端点**：
```
GET    /prompts           # 列表，支持分类/标签筛选
GET    /prompts/:id      # 详情
POST   /prompts           # 创建
PUT    /prompts/:id       # 更新（自动创建新版本）
DELETE /prompts/:id       # 删除
GET    /prompts/:id/versions  # 版本历史
GET    /prompts/:id/iterations # 优化迭代记录
```

**列表页字段**：id、name、category、tags、useCount、avgScore、lastUsed、updatedAt

### 2. 变量插槽系统

- 模板内容支持 `{{变量名}}` 语法
- 创建 prompt 时定义变量列表（key、描述、是否必填、默认值）
- 变量填充 UI：表单渲染，输入值，注入后发送请求

### 3. Prompt 循环优化工作流

**触发方式**：用户选中一个 prompt → 点击「优化」→ 填写优化目标 + 上传参考资料

**优化流程（单轮）**：
```
用户输入：
  - 优化目标：如"让开篇更有冲击力"
  - 参考资料（好/差示例）
  - 评估维度：如 开篇/冲突/节奏

系统执行：
  1. 调用 model-runner，用当前 prompt 生成输出
  2. 对比参考材料，自动评分
  3. 输出：Prompt v2 + 评分 + 修改说明

用户确认：
  - 接受 → 更新 prompt 版本
  - 不满意 → 继续下一轮
  - 停止 → 保存记录，退出
```

**收敛条件**：
- 用户手动确认
- 连续 2 轮评分无提升（Δ < 0.1）
- 超限 5 轮

### 4. Prompt 组合（不急于做）

> **注意**：这个功能暂时不做。只有当所有关键 prompt 完善后，才考虑做「组合多个 prompt 成工作流」。

### 5. 导入/导出

```json
// 导出格式
{
  "version": 1,
  "exportedAt": "2026-05-07T15:00:00Z",
  "prompts": [...]
}
```

## 技术实现要求

- 存储：`D:\work\model-runner\prompts.json` 和 `D:\work\model-runner\iterations.json`
- 使用 Node.js 内置 `fs` 模块读写 JSON 文件
- 与 model-runner 的 `/chat` 接口联动（通过 `127.0.0.1:4000` 调用）
- 不需要数据库，纯文件存储

## 交付物

1. `prompts.json` 数据结构 + 初始示例数据（3-5 个真实 prompt 示例）
2. `iterations.json` 数据结构
3. 完整的 API 端点（server.js 中新增 `/prompts` 和 `/iterations` 路由）
4. 一个简单的 HTML 页面用于 Prompt 管理（和 model-runner 主页面集成或独立）
5. Prompt 优化单轮执行的完整逻辑

## 页面设计方向（非强制，实现够用即可）

- 左侧：分类树 + 搜索
- 右侧：Prompt 详情 + 变量填充表单 + 版本历史
- 顶部：「优化」按钮触发循环优化流程
- 不需要花哨 UI，重点是功能完整

## 测试用例

1. 创建一条新 prompt，带 3 个变量，使用时正确替换
2. 更新 prompt，自动保存为新版本，版本历史正确
3. 运行一轮优化，系统正确调用 model-runner 并保存记录
4. 导出所有 prompt 为 JSON，再导入恢复
