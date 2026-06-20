# Model-Runner 升级总览

## 项目目标

将 model-runner 从「单一模型调用层」升级为「AI 写作基础设施平台」。

## 三个子任务

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | **多平台容错升级** | P0 | 健康检查、熔断、多 source 路由 |
| 2 | **写作 Prompt 工作台** | P1 | Prompt 管理、版本历史、循环优化 |
| 3 | **爆款素材搜集系统** | P1 | 素材入库、分析、检索 |

## 任务依赖关系

```
Task 1（多平台容错）
    ├── 是 Task 2 和 Task 3 的基础
    └── 健康检查 → 素材分析时需要知道平台是否可用

Task 2（Prompt 工作台）
    └── 独立进行，不需要等 Task 1 完成

Task 3（素材搜集系统）
    └── 独立进行，不需要等 Task 1 完成
```

## 执行顺序建议

**并行执行**：
- Task 2 和 Task 3 可以同时开始（功能独立）
- Task 1 是基础设施，可以在 Task 2/3 开发期间同步进行

**单个 Task 完成后再做下一个**：
- 建议顺序：Task 1 → Task 2 → Task 3
- 或者：Task 2 和 Task 3 并行，最后做 Task 1

## 文件清单

```
D:\work\model-runner\
    ├── TASK-multi-platform.md      # 任务1：多平台容错
    ├── TASK-prompt-workspace.md    # 任务2：Prompt 工作台
    ├── TASK-viral-collector.md     # 任务3：素材搜集系统
    ├── config.json                 # [改造] 多平台配置
    ├── healthState.json            # [新增] 健康状态
    ├── prompts.json                # [新增] Prompt 存储
    ├── iterations.json             # [新增] 优化迭代记录
    ├── sources.json                # [新增] 素材来源
    ├── materials.json              # [新增] 素材存储
    ├── server.js                   # [改造] 整合所有 API
    ├── index.html                  # [改造] 整合所有页面
    ├── cascade_chat.js             # [改造] 多平台感知
    └── DEVELOPMENT.md              # [更新] 记录新架构
```

## 关键约束

1. **纯 Node.js**：继续零 npm 依赖
2. **向后兼容**：现有 config.json 必须能正常工作
3. **独立存储**：每个子模块用自己的 JSON 文件，不混在一起
4. **不做整体工作流**：只有单独的 prompt 优化和素材搜集，没有跨模块自动化流程
5. **不过度设计**：先跑起来，后续迭代
