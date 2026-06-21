# Model Runner Plugin - 完备测试主计划

**创建时间**：2026-06-21  
**测试目标**：覆盖所有功能、所有可能操作、误操作场景  
**测试方法**：8 种测试方法全覆盖  

---

## 📋 目录

1. [项目功能清单](#项目功能清单)
2. [8 种测试方法](#8种测试方法)
3. [测试用例设计](#测试用例设计)
4. [测试执行计划](#测试执行计划)
5. [测试验证标准](#测试验证标准)

---

## 🎯 项目功能清单

### 核心模块

#### 1. ProcessManager（进程管理器）
**功能**：
- ✅ 启动 Node.js 服务器进程
- ✅ 停止服务器进程
- ✅ 检查端口占用
- ✅ 清理端口（kill 进程）
- ✅ 监听进程输出（stdout/stderr）
- ✅ 自动重启（可配置）
- ✅ 状态更新回调

**可能的操作**：
- 正常启动
- 正常停止
- 重复启动（已运行时再启动）
- 重复停止（已停止时再停止）
- 端口被占用时启动
- 进程崩溃时自动重启
- 快速连续启动/停止

**误操作场景**：
- server.js 不存在
- Node.js 不在 PATH 中
- 端口被其他程序占用
- 权限不足
- 磁盘空间不足

#### 2. ConfigManager（配置管理器）
**功能**：
- ✅ 读取 config.json
- ✅ 写入 config.json
- ✅ 切换源
- ✅ 添加/删除/编辑源
- ✅ 管理 API Keys
- ✅ 配置验证

**可能的操作**：
- 读取配置
- 保存配置
- 添加新源
- 编辑现有源
- 删除源
- 切换当前源
- 添加/删除 API Key

**误操作场景**：
- config.json 不存在
- config.json 格式错误（JSON 损坏）
- 权限不足（只读文件）
- 并发读写
- 删除当前使用的源
- 空的 API Key 列表
- 重复的源 ID

#### 3. ServiceManager（服务管理器）
**功能**：
- ✅ 管理多个服务（model-runner, search-relay）
- ✅ 启动服务（委托给 ProcessManager）
- ✅ 停止服务
- ✅ 检查服务状态

**可能的操作**：
- 启动 model-runner
- 停止 model-runner
- 检查服务状态
- 启动多个服务

**误操作场景**：
- 服务配置错误
- ProcessManager 不可用
- 服务已在运行

#### 4. ModelRunnerView（侧边栏视图）
**功能**：
- ✅ 显示服务状态
- ✅ 显示日志输出
- ✅ 快速配置面板
- ✅ 启动/停止按钮
- ✅ 配置编辑（端口、自动启动、自动重启、通知）

**可能的操作**：
- 打开/关闭侧边栏
- 点击启动按钮
- 点击停止按钮
- 编辑端口配置
- 切换自动启动
- 切换自动重启
- 切换通知
- 查看日志
- 清空日志

**误操作场景**：
- 输入无效端口号（负数、超出范围、非数字）
- 快速连续点击按钮
- 配置保存失败

#### 5. SettingsTab（设置页面）
**功能**：
- ✅ 源管理（列表、添加、编辑、删除）
- ✅ 服务管理（启动、停止、状态）
- ✅ API Keys 管理
- ✅ 模型管理（待实现）
- ✅ 状态监控（待实现）

**可能的操作**：
- 切换 Tab（源管理、模型管理、服务管理、状态监控）
- 添加新源
- 编辑源
- 删除源
- 切换当前源
- 管理 Keys
- 启动服务
- 停止服务

**误操作场景**：
- 输入无效的 URL
- 空的源名称
- 重复的源 ID
- 删除当前使用的源
- Keys 管理中的空 Key

---

## 🔬 8种测试方法

### 1. 单元测试（Unit Test）
**目标**：测试每个独立函数/方法的正确性

**覆盖模块**：
- ConfigManager 的每个方法
- ProcessManager 的每个方法
- ServiceManager 的每个方法
- 工具函数

**策略**：
- 使用 Jest
- Mock 外部依赖（文件系统、子进程）
- 测试纯函数逻辑
- 边界值测试
- 异常处理测试

**现状**：
- ✅ tests/unit/ConfigManager.test.ts
- ✅ tests/unit/ProcessManager.test.ts
- ✅ tests/unit/ServiceManager.test.ts
- ✅ tests/unit/ModelRunnerView.test.ts

**待完善**：
- 增加边界值测试
- 增加异常场景测试
- 提高覆盖率到 90%+

---

### 2. 集成测试（Integration Test）
**目标**：测试模块间的协作

**测试场景**：
1. **ProcessManager + ConfigManager**
   - 读取配置 → 启动服务器
   - 配置更改 → 重启服务器

2. **ServiceManager + ProcessManager**
   - ServiceManager 调用 ProcessManager 启动
   - 状态同步

3. **SettingsTab + ConfigManager + ServiceManager**
   - UI 操作 → 配置更新 → 服务重启

4. **完整流程**
   - 插件加载 → 初始化所有模块 → 启动服务 → 正常工作

**策略**：
- 最小化 Mock（只 Mock 文件系统和网络）
- 实际调用模块间接口
- 验证数据流和状态传递

**现状**：
- ✅ tests/integration/integration.test.ts
- ✅ tests/integration/ServiceManager.integration.test.ts
- ⚠️ tests/integration/ServiceManager.spawn.test.ts（仅验证环境变量）

**待完善**：
- ProcessManager + ConfigManager 集成
- SettingsTab + ConfigManager 集成
- 完整启动流程测试

---

### 3. 功能测试（Functional Test）
**目标**：从用户角度测试所有功能

**测试场景分类**：

#### A. 启动/停止功能
- [ ] 首次启动插件
- [ ] 从侧边栏启动服务
- [ ] 从设置页面启动服务
- [ ] 停止运行中的服务
- [ ] 重复启动（已运行时）
- [ ] 重复停止（已停止时）
- [ ] 快速连续启动/停止
- [ ] 服务崩溃后重启

#### B. 配置管理功能
- [ ] 添加新源
- [ ] 编辑现有源
- [ ] 删除源
- [ ] 切换当前源
- [ ] 保存配置
- [ ] 配置验证

#### C. API Keys 管理
- [ ] 添加 Key
- [ ] 删除 Key
- [ ] 编辑 Key 名称
- [ ] 空 Keys 列表处理

#### D. UI 交互
- [ ] 打开/关闭侧边栏
- [ ] 切换设置 Tab
- [ ] 编辑快速配置
- [ ] 查看日志
- [ ] 状态指示器更新

**策略**：
- 手动测试 + 自动化 E2E 测试（如果可行）
- 每个功能至少 3 个用例（正常、边界、异常）
- 记录测试结果

**待创建**：
- 功能测试用例清单
- 手动测试检查表
- 自动化功能测试脚本

---

### 4. 冒烟测试（Smoke Test）
**目标**：快速验证核心功能是否可用

**测试用例**（< 5 分钟）：
1. ✅ 插件是否加载成功
2. ✅ 服务器是否能启动
3. ✅ 基本 API 是否响应（/health）
4. ✅ 配置是否可读写
5. ✅ 服务是否能正常停止

**策略**：
- 每次部署后立即执行
- 失败则阻止进一步测试
- 自动化执行

**现状**：
- ✅ server/tests/smoke/smoke.test.js（服务器端）
- ❌ 插件端冒烟测试缺失

**待创建**：
- tests/smoke/plugin.smoke.test.ts

---

### 5. 回归测试（Regression Test）
**目标**：确保修复 Bug 后不再复现

**已修复的 Bug**：
1. ✅ Bug #1: Toggle 开关无法点击
2. ✅ Bug #2: 端口配置丢失
3. ✅ Bug #3: JSON 解析错误
4. ✅ Bug #4: CORS 错误
5. ✅ Bug #5: 重复的源 ID
6. ✅ Bug #6: 端口清理失败
7. ✅ Bug #7: ServiceManager spawn ENOENT
8. ✅ Bug #8: TIME_WAIT 误判
9. ✅ Bug #9: 停止按钮需点击两次

**策略**：
- 为每个 Bug 编写专门的测试用例
- 在每次发布前全部运行
- 失败则阻止发布

**现状**：
- ✅ tests/regression/bug-fixes.test.ts（已有部分）

**待完善**：
- 为每个 Bug 添加完整测试用例
- 验证修复后的行为

---

### 6. 性能测试（Performance Test）
**目标**：验证性能指标

**测试指标**：
1. **启动时间**
   - 插件加载时间 < 2 秒
   - 服务器启动时间 < 3 秒

2. **响应时间**
   - 配置读取 < 100ms
   - 配置保存 < 200ms
   - UI 操作响应 < 100ms

3. **资源占用**
   - 内存占用 < 100MB
   - CPU 占用 < 10%（空闲时）

4. **并发性能**
   - 支持多个并发请求（服务器端）
   - UI 操作不阻塞

**策略**：
- 使用 performance API 测量
- 压力测试工具
- 长时间运行测试

**待创建**：
- tests/performance/startup.test.ts
- tests/performance/config-io.test.ts
- tests/performance/ui-response.test.ts

---

### 7. 安全测试（Security Test）
**目标**：发现安全漏洞

**测试场景**：
1. **输入验证**
   - [ ] URL 注入
   - [ ] 路径遍历（config.json 路径）
   - [ ] XSS（如果有 HTML 渲染）
   - [ ] 命令注入（spawn 参数）

2. **权限控制**
   - [ ] 文件权限检查
   - [ ] 进程权限隔离

3. **数据保护**
   - [ ] API Key 存储安全
   - [ ] 敏感信息不记录到日志
   - [ ] config.json 权限控制

**策略**：
- 输入边界测试
- 恶意输入测试
- 权限提升测试

**现状**：
- ✅ server/tests/security.test.js（服务器端）
- ❌ 插件端安全测试缺失

**待创建**：
- tests/security/input-validation.test.ts
- tests/security/path-traversal.test.ts
- tests/security/api-key-security.test.ts

---

### 8. 兼容性测试（Compatibility Test）
**目标**：验证跨平台、跨版本兼容性

**测试维度**：
1. **操作系统**
   - [ ] Windows 10/11
   - [ ] macOS (Intel/Apple Silicon)
   - [ ] Linux (Ubuntu, Arch)

2. **Obsidian 版本**
   - [ ] 最新版本
   - [ ] 前一个稳定版本
   - [ ] API 版本兼容性

3. **Node.js 版本**
   - [ ] Node.js 18.x
   - [ ] Node.js 20.x
   - [ ] Node.js 22.x

**策略**：
- CI/CD 多环境测试
- 手动在不同平台测试
- 版本兼容性矩阵

**待创建**：
- tests/compatibility/platform.test.ts
- tests/compatibility/obsidian-version.test.ts
- .github/workflows/test-matrix.yml

---

## 📝 测试用例设计原则

### 1. 功能测试用例设计（详细）

#### 示例：启动服务功能

**测试用例 TC-001：正常启动服务**
- **前置条件**：服务未运行，配置正确，端口未占用
- **操作步骤**：
  1. 打开侧边栏
  2. 点击"启动"按钮
- **预期结果**：
  - 按钮变为"停止"
  - 状态显示"运行中"
  - 日志显示启动成功
  - 端口被占用
  - /health 接口返回 200
- **实际验证**：
  - 检查进程是否存在
  - 检查端口是否监听
  - 发送 HTTP 请求验证
  - 检查 UI 状态

**测试用例 TC-002：重复启动**
- **前置条件**：服务已运行
- **操作步骤**：再次点击"启动"
- **预期结果**：
  - 显示"服务器已在运行"提示
  - 不创建新进程
  - 现有服务继续运行
- **实际验证**：
  - 检查进程数量未增加
  - 检查进程 PID 未变化

**测试用例 TC-003：端口被占用时启动**
- **前置条件**：端口 4000 被其他程序占用
- **操作步骤**：点击"启动"
- **预期结果**：
  - 自动 kill 占用端口的进程
  - 启动成功
  - 或者提示端口被占用，询问是否清理
- **实际验证**：
  - 检查是否尝试清理端口
  - 检查启动是否成功

**测试用例 TC-004：server.js 不存在**
- **前置条件**：删除或移动 server.js
- **操作步骤**：点击"启动"
- **预期结果**：
  - 显示错误提示"找不到 server.js"
  - 不创建进程
- **实际验证**：
  - 检查错误消息
  - 检查进程未创建

**测试用例 TC-005：Node.js 不在 PATH**
- **前置条件**：Node.js 不在系统 PATH 中
- **操作步骤**：点击"启动"
- **预期结果**：
  - 显示错误提示"找不到 Node.js"
  - 提供安装指引
- **实际验证**：
  - 检查错误消息
  - 检查是否有帮助信息

---

### 2. 集成测试用例设计（倒推）

**从功能测试倒推集成测试**：

功能测试：添加新源并切换
→ 涉及模块：SettingsTab + ConfigManager
→ 集成测试需要：
  - SettingsTab.addSource() 调用 ConfigManager.addSource()
  - ConfigManager.addSource() 更新内存和文件
  - ConfigManager.switchSource() 更新当前源
  - 状态回调触发 UI 更新

**集成测试用例 IT-001：添加源并切换**
```typescript
test('添加源并切换', async () => {
  // 1. 创建 ConfigManager
  const configManager = new ConfigManager(testServerDir);
  await configManager.loadConfig();
  
  // 2. 添加新源
  const newSource = {
    id: 'test-source',
    name: 'Test Source',
    baseUrl: 'http://localhost:5000',
    apiKeys: []
  };
  await configManager.addSource(newSource);
  
  // 3. 验证源已添加
  const config = configManager.getConfig();
  expect(config.sources).toContainEqual(newSource);
  
  // 4. 切换到新源
  await configManager.switchSource('test-source');
  
  // 5. 验证当前源已切换
  expect(config.activeSourceId).toBe('test-source');
  
  // 6. 验证文件已保存
  const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  expect(savedConfig.activeSourceId).toBe('test-source');
});
```

---

## ⚠️ 测试验证标准（防止测试作弊）

### 1. 禁止空函数测试
❌ **错误示例**：
```typescript
test('启动服务', () => {
  // 空测试，什么都没验证
});

test('启动服务', () => {
  expect(true).toBe(true); // 无意义的断言
});
```

✅ **正确示例**：
```typescript
test('启动服务', async () => {
  const pm = new ProcessManager(serverDir, mockCallback, mockStatusCallback);
  await pm.start();
  
  // 验证进程已创建
  expect(pm['process']).toBeDefined();
  expect(pm['process']?.pid).toBeGreaterThan(0);
  
  // 验证端口被占用
  const portInUse = await checkPort(4000);
  expect(portInUse).toBe(true);
  
  // 验证服务响应
  const response = await fetch('http://localhost:4000/health');
  expect(response.status).toBe(200);
  
  await pm.stop();
});
```

---

### 2. 禁止过度 Mock（测试假数据）
❌ **错误示例**：
```typescript
test('读取配置', async () => {
  const mockFs = {
    readFileSync: jest.fn().mockReturnValue('{"test": true}')
  };
  // Mock 了文件系统，测试不到真实的读取逻辑
});
```

✅ **正确示例**：
```typescript
test('读取配置', async () => {
  // 创建真实的测试文件
  const testConfigPath = path.join(testDir, 'config.json');
  const testConfig = { sources: [], activeSourceId: 'default' };
  fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));
  
  // 测试真实的读取
  const configManager = new ConfigManager(testDir);
  await configManager.loadConfig();
  
  const config = configManager.getConfig();
  expect(config).toEqual(testConfig);
  
  // 清理
  fs.unlinkSync(testConfigPath);
});
```

---

### 3. 必须验证实际行为
✅ **验证清单**：
- [ ] 进程是否真的创建了？（检查 PID）
- [ ] 端口是否真的被占用？（netstat / lsof）
- [ ] 文件是否真的写入了？（读取文件验证）
- [ ] 配置是否真的生效了？（重新加载验证）
- [ ] UI 是否真的更新了？（DOM 检查）
- [ ] 回调是否真的被调用了？（spy 验证）

---

### 4. 必须运行测试
❌ **禁止**：
- 写了测试但不运行
- 跳过失败的测试（test.skip）
- 忽略测试错误

✅ **要求**：
- 所有测试必须通过
- 失败的测试必须修复或标注原因
- CI/CD 自动运行所有测试

---

## 📊 测试执行计划

### Phase 1：单元测试完善（1-2 天）
- [ ] 补充 ConfigManager 边界测试
- [ ] 补充 ProcessManager 异常测试
- [ ] 补充 ServiceManager 错误处理测试
- [ ] 达到 90% 代码覆盖率

### Phase 2：集成测试编写（2-3 天）
- [ ] ProcessManager + ConfigManager 集成
- [ ] ServiceManager + ProcessManager 集成
- [ ] SettingsTab + ConfigManager 集成
- [ ] 完整启动流程测试

### Phase 3：功能测试（3-4 天）
- [ ] 编写详细测试用例（每个功能 3-5 个用例）
- [ ] 手动测试执行
- [ ] 自动化功能测试（如可行）
- [ ] 记录测试结果

### Phase 4：专项测试（2-3 天）
- [ ] 冒烟测试自动化
- [ ] 回归测试完善
- [ ] 性能测试
- [ ] 安全测试
- [ ] 兼容性测试

### Phase 5：测试验证（1 天）
- [ ] 审查所有测试代码
- [ ] 验证测试真实性
- [ ] 检查覆盖率
- [ ] 生成测试报告

---

## ✅ 验收标准

### 代码覆盖率
- 单元测试覆盖率 ≥ 90%
- 集成测试覆盖核心流程
- 功能测试覆盖所有用户操作

### 测试通过率
- 所有测试 100% 通过
- 无跳过的测试
- 无忽略的错误

### 测试质量
- 无空函数测试
- 最小化 Mock（仅 Mock 不可控部分）
- 验证实际行为
- 有清晰的断言

### 文档完整性
- 测试计划文档
- 测试用例文档
- 测试报告
- Bug 追踪

---

**下一步**：开始执行 Phase 1 - 单元测试完善
