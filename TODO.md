# Model Runner Obsidian 插件 - 完整 TODO 清单

## 📋 Phase 1: MVP ✅ 已完成

- [x] 1.1 基础插件框架搭建
  - [x] 初始化项目（使用官方模板）
  - [x] 配置 TypeScript + 构建工具
  - [x] 设置 manifest.json（`isDesktopOnly: true`）

- [x] 1.2 进程管理核心
  - [x] `ProcessManager.ts`：实现 `spawn()` 启动 server.js
  - [x] 监听 stdout/stderr 并缓存日志
  - [x] 实现 `kill()` 停止进程
  - [x] 错误处理（进程崩溃、启动失败）

- [x] 1.3 基础 UI
  - [x] 状态栏指示器（🔴/🟢 + 点击切换）
  - [x] Ribbon 图标（侧边栏入口）
  - [x] 简单的侧边栏视图
    - [x] 启动按钮
    - [x] 停止按钮
    - [x] 重启按钮
    - [x] 打开界面按钮
    - [x] 日志滚动窗口（200行限制）
    - [x] 清空日志按钮

- [x] 1.4 测试
  - [x] TypeScript 编译通过
  - [x] 生成 main.js (7.2KB)
  - [ ] 在实际 Obsidian 中手动测试（待用户验证）

---

## 🎯 Phase 2: 配置管理 （下一步）

### 2.1 ConfigManager 封装
- [ ] 创建 `src/ConfigManager.ts` 文件
- [ ] 实现 `readConfig()` - 读取 `server/config.json`
- [ ] 实现 `writeConfig()` - 写入配置（带原子性保证）
- [ ] 实现 `switchSource(sourceId)` - 切换活跃源
- [ ] 实现 `addSource(source)` - 添加新源
- [ ] 实现 `removeSource(sourceId)` - 删除源
- [ ] 实现 `updateSource(sourceId, data)` - 更新源信息
- [ ] 配置校验（JSON Schema）
- [ ] 错误恢复（损坏时恢复默认配置）

**估计代码量**：~120行

**示例代码结构**：
```typescript
export class ConfigManager {
  constructor(private configPath: string) {}
  
  async readConfig(): Promise<ServerConfig>
  async writeConfig(config: Partial<ServerConfig>): Promise<void>
  async switchSource(sourceId: string): Promise<void>
  async addSource(source: Source): Promise<void>
  async removeSource(sourceId: string): Promise<void>
  async updateSource(sourceId: string, updates: Partial<Source>): Promise<void>
  
  private validateConfig(config: any): boolean
  private getDefaultConfig(): ServerConfig
}
```

### 2.2 侧边栏快速配置
- [ ] 更新 `ModelRunnerView.refreshConfig()` 方法
- [ ] 添加当前源下拉框
  - [ ] 读取所有源列表
  - [ ] 显示当前活跃源
  - [ ] onChange 事件切换源
  - [ ] 提示是否重启服务器
- [ ] 显示当前源信息卡片
  - [ ] 源名称
  - [ ] baseUrl
  - [ ] API Key 数量（不显示实际 key）
  - [ ] 健康状态（Phase 3 实现）
- [ ] 添加"编辑配置"按钮
  - [ ] 点击打开设置页

**估计代码量**：~80行

### 2.3 设置页（PluginSettingTab）
- [ ] 创建 `src/SettingsTab.ts` 文件
- [ ] 基础设置区
  - [ ] 自动启动开关
  - [ ] 端口配置（数字输入，默认 4000）
  - [ ] 超时设置（默认 120000ms）
  - [ ] 重试次数（默认 3）
- [ ] 源管理区
  - [ ] 源列表表格展示
    - [ ] 列：名称 | baseUrl | Key数量 | 状态 | 操作
  - [ ] "添加源"按钮
    - [ ] 打开模态框
    - [ ] 表单：名称、baseUrl、API Key（多个）
    - [ ] 验证输入
    - [ ] 保存到 config.json
  - [ ] "编辑"按钮（每行）
    - [ ] 打开模态框
    - [ ] 预填充现有数据
    - [ ] 保存更新
  - [ ] "删除"按钮（每行）
    - [ ] 确认对话框
    - [ ] 删除源
    - [ ] 如果是活跃源，切换到第一个源
- [ ] 模型路由管理（高级功能，可选）
  - [ ] 展开/折叠区域
  - [ ] 模型列表
  - [ ] 为每个模型配置优先平台

**估计代码量**：~200行

**示例代码结构**：
```typescript
export class ModelRunnerSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: ModelRunnerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    this.renderBasicSettings(containerEl);
    this.renderSourceManagement(containerEl);
    this.renderAdvancedSettings(containerEl);
  }

  private renderBasicSettings(container: HTMLElement): void
  private renderSourceManagement(container: HTMLElement): void
  private renderAdvancedSettings(container: HTMLElement): void
  private openSourceModal(source?: Source): void
}
```

### 2.4 配置热重载
- [ ] 使用 `fs.watch()` 监听 `config.json` 变化
- [ ] 检测到变化时显示 Notice
- [ ] 询问用户是否重启服务器
- [ ] 实现 `reloadConfig()` 方法

**估计代码量**：~40行

### 2.5 集成到主插件
- [ ] 在 `main.ts` 中初始化 `ConfigManager`
- [ ] 注册 `SettingsTab`
- [ ] 将 `ConfigManager` 传递给 `ModelRunnerView`
- [ ] 更新 `ProcessManager` 使用配置中的端口

**估计代码量**：~30行

**Phase 2 总估计**：~470行，预计 3-4小时

---

## 📊 Phase 3: 健康监控

### 3.1 HealthChecker 模块
- [ ] 创建 `src/HealthChecker.ts` 文件
- [ ] 实现 `startChecking(interval)` - 开始定时检查
- [ ] 实现 `stopChecking()` - 停止检查
- [ ] 实现 `checkHealth()` - 单次健康检查
  - [ ] 调用 `GET http://localhost:4000/health`
  - [ ] 解析响应 JSON
  - [ ] 更新内存缓存
- [ ] 实现 `getSourceHealth(sourceId)` - 获取单个源健康状态
- [ ] 实现 `getAllHealthStatus()` - 获取所有源健康状态
- [ ] 事件发射器（状态变化通知）

**估计代码量**：~100行

**示例代码结构**：
```typescript
export class HealthChecker {
  private timer: NodeJS.Timeout | null = null;
  private healthCache: Map<string, HealthStatus> = new Map();

  constructor(
    private port: number,
    private onStatusChange: (sourceId: string, status: HealthStatus) => void
  ) {}

  startChecking(interval: number = 60000): void
  stopChecking(): void
  async checkHealth(): Promise<void>
  getSourceHealth(sourceId: string): HealthStatus | null
  getAllHealthStatus(): Map<string, HealthStatus>
}
```

### 3.2 健康状态面板
- [ ] 在 `ModelRunnerView` 中添加健康状态区域
- [ ] 创建 `renderHealthPanel()` 方法
- [ ] 为每个源渲染状态卡片
  - [ ] 源名称
  - [ ] 状态图标（🟢健康 / 🟡降级 / 🔴熔断）
  - [ ] 平均延迟（avgLatencyMs）
  - [ ] 错误率（errorRate）
  - [ ] 连续失败次数（consecutiveFailures）
  - [ ] 最后检查时间（lastCheck）
- [ ] 点击卡片显示详细信息
- [ ] 自动刷新（跟随 HealthChecker 更新）

**估计代码量**：~80行

### 3.3 告警通知
- [ ] 监听 `HealthChecker` 的状态变化事件
- [ ] 源进入熔断状态时弹出 Notice（🔴）
- [ ] 源恢复健康时弹出 Notice（🟢）
- [ ] 在设置中添加"启用通知"开关
- [ ] 通知防抖（避免频繁弹窗）

**估计代码量**：~40行

**Phase 3 总估计**：~220行，预计 2-3小时

---

## 🚀 Phase 4: 高级功能

### 4.1 自动重启
- [ ] 在 `ProcessManager` 中添加重启逻辑
- [ ] 监听进程异常退出（code !== 0）
- [ ] 记录重启次数
- [ ] 指数退避策略（1s, 2s, 4s）
- [ ] 最多重试 3 次（可配置）
- [ ] 超过最大次数后显示错误 Notice
- [ ] 在设置中添加"自动重启"开关

**估计代码量**：~60行

### 4.2 日志管理
- [ ] 日志分级显示（INFO/WARN/ERROR 不同颜色）
- [ ] 日志搜索功能
  - [ ] 搜索输入框
  - [ ] 实时过滤
  - [ ] 高亮匹配文本
- [ ] 日志过滤功能
  - [ ] 级别过滤（只显示 ERROR）
  - [ ] 时间范围过滤
- [ ] 导出日志到文件
  - [ ] "导出日志"按钮
  - [ ] 保存为 .txt 文件
  - [ ] 包含时间戳

**估计代码量**：~100行

### 4.3 快捷操作
- [ ] "测试连接"按钮
  - [ ] ping 当前源
  - [ ] 显示响应时间
  - [ ] 显示可用模型列表
- [ ] "一键切换备用源"
  - [ ] 当前源不可用时快速切换
  - [ ] 智能推荐健康的源
- [ ] "刷新健康状态"按钮
  - [ ] 手动触发健康检查

**估计代码量**：~50行

### 4.4 性能优化
- [ ] 日志虚拟滚动（仅渲染可见行）
- [ ] 配置读写防抖（避免频繁 I/O）
- [ ] 健康检查节流（避免同时发起多个请求）
- [ ] 使用 `requestAnimationFrame` 优化 UI 更新

**估计代码量**：~80行

**Phase 4 总估计**：~290行，预计 2-3小时

---

## ✨ Phase 5: 打磨与发布

### 5.1 文档
- [ ] 完善 README.md
  - [ ] 添加截图/动图
  - [ ] 详细的安装步骤
  - [ ] 常见问题 FAQ
  - [ ] 贡献指南
- [ ] 编写 API 文档
  - [ ] 供其他插件调用的接口
  - [ ] 示例代码
- [ ] 编写用户指南
  - [ ] 分步教程
  - [ ] 最佳实践
- [ ] 编写开发者文档
  - [ ] 架构说明
  - [ ] 模块职责
  - [ ] 扩展指南

**估计工作量**：2小时

### 5.2 测试
- [ ] 单元测试
  - [ ] ProcessManager 测试
  - [ ] ConfigManager 测试
  - [ ] HealthChecker 测试
- [ ] 集成测试
  - [ ] 完整启动/停止流程
  - [ ] 配置修改流程
  - [ ] 健康检查流程
- [ ] 跨平台测试
  - [ ] Windows 测试
  - [ ] Mac 测试
  - [ ] Linux 测试
- [ ] 边界测试
  - [ ] 端口被占用
  - [ ] server.js 文件缺失
  - [ ] config.json 损坏
  - [ ] 网络断开

**估计工作量**：3小时

### 5.3 代码质量
- [ ] ESLint 全面检查
- [ ] 代码注释补充（JSDoc）
- [ ] 错误处理完善
  - [ ] 所有 Promise 都有 catch
  - [ ] 用户友好的错误提示
- [ ] 性能分析
  - [ ] 使用 Chrome DevTools
  - [ ] 优化瓶颈

**估计工作量**：2小时

### 5.4 发布
- [ ] 提交到 [obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
  - [ ] Fork 仓库
  - [ ] 添加 `community-plugins.json` 条目
  - [ ] 创建 Pull Request
- [ ] 创建 GitHub Release
  - [ ] 打 tag（v0.1.0）
  - [ ] 上传 main.js、manifest.json、styles.css
  - [ ] 编写发布说明
- [ ] 宣传推广
  - [ ] Obsidian 论坛发帖
  - [ ] Reddit r/ObsidianMD
  - [ ] Twitter/X

**估计工作量**：2小时

**Phase 5 总估计**：9小时

---

## 📊 总体进度

| Phase | 状态 | 完成度 | 预计工作量 |
|-------|------|--------|-----------|
| Phase 1: MVP | ✅ 完成 | 100% | - |
| Phase 2: 配置管理 | ⏳ 待开始 | 0% | 3-4小时 |
| Phase 3: 健康监控 | 📋 计划中 | 0% | 2-3小时 |
| Phase 4: 高级功能 | 📋 计划中 | 0% | 2-3小时 |
| Phase 5: 打磨与发布 | 📋 计划中 | 0% | 9小时 |

**总预计工作量**：16-19小时（不含 Phase 1）

---

## 🎯 优先级排序

### 🔥 高优先级（建议先完成）
1. Phase 2.1 - ConfigManager 封装
2. Phase 2.2 - 侧边栏快速配置
3. Phase 2.3 - 设置页面（基础部分）
4. Phase 1.4 - 实际 Obsidian 测试

### 🟡 中优先级（有时间再做）
5. Phase 3.1 - HealthChecker 模块
6. Phase 3.2 - 健康状态面板
7. Phase 4.1 - 自动重启
8. Phase 4.2 - 日志管理

### 🟢 低优先级（锦上添花）
9. Phase 4.3 - 快捷操作
10. Phase 4.4 - 性能优化
11. Phase 5 - 打磨与发布

---

## 📝 开发建议

### 每个 Phase 的开发流程
1. **需求确认**：明确功能目标和用户体验
2. **设计接口**：先定义类型和接口
3. **编写代码**：实现核心逻辑
4. **单元测试**：确保功能正确
5. **集成测试**：测试与其他模块的协作
6. **UI 调整**：优化用户界面
7. **文档更新**：更新 README 和 CHANGELOG

### 开发注意事项
- ⚠️ 每次修改后运行 `npm run build` 验证编译
- ⚠️ 使用 `console.log` 调试时记得清理
- ⚠️ 提交前运行 ESLint 检查
- ⚠️ 重要功能添加错误处理和用户提示
- ⚠️ 配置修改前先备份 `config.json`

---

**文档版本**：v1.0  
**更新时间**：2024-06-15 21:20  
**状态**：Phase 1 已完成，Phase 2 待开始
