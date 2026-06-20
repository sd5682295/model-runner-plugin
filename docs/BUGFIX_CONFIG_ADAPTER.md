# 🔧 修复：适配现有 config.json 格式

**版本**：Phase 2 v0.4.1  
**修复日期**：2024-06-18  
**状态**：✅ 已修复  

---

## 🐛 问题描述

插件无法读取 model-runner 已设置的 API 源。

**原因**：ConfigManager 期望的配置格式与现有的 config.json 格式不一致。

---

## 📊 格式对比

### 现有格式（server.js 使用）

```json
{
  "sources": [
    {
      "id": "yunyi",
      "name": "云驿",
      "baseUrl": "https://yunyi.yun/claude/v1",
      "apiKeys": ["N1HKX3SR-..."]
    },
    {
      "id": "ceotech",
      "name": "伟业科技",
      "baseUrl": "https://claude.api.ceo-tech.cn/v1",
      "apiKeys": ["sk-9b36ccf1..."]
    }
  ],
  "activeSourceId": "yunyi",
  "modelRoutes": { ... },
  "timeout": 120000,
  "retries": 2
}
```

**特点**：
- `sources` 是**数组**
- 使用 `id` 标识源
- 使用 `name` 显示名称
- 使用 `baseUrl`（驼峰）
- 使用 `apiKeys` 数组（支持多 Key）
- 使用 `activeSourceId` 标识当前源

### 原 ConfigManager 期望格式

```json
{
  "sources": {
    "OpenAI": {
      "provider": "OpenAI",
      "baseURL": "https://...",
      "models": ["gpt-4"],
      "enabled": true
    }
  },
  "currentSource": "OpenAI"
}
```

**特点**：
- `sources` 是**对象**
- 键名即源名称
- 使用 `baseURL`（全大写）
- 使用 `models` 数组
- 使用 `enabled` 状态
- 使用 `currentSource` 标识当前源

---

## ✅ 修复方案

### 1. 重写 ConfigManager

**新接口定义**：

```typescript
// 原始配置格式（server.js 使用）
export interface OriginalSource {
  id: string;
  name: string;
  baseUrl: string;
  apiKeys: string[];
}

export interface OriginalConfig {
  sources: OriginalSource[];
  activeSourceId: string;
  modelRoutes?: any;
  timeout?: number;
  retries?: number;
}
```

**核心方法**：

```typescript
// 获取所有源
getSources(): { id: string; name: string; enabled: boolean }[]

// 获取当前源 ID
getCurrentSource(): string

// 获取当前源名称
getCurrentSourceName(): string

// 切换源
async switchSource(sourceId: string): Promise<void>

// 添加源
async addSource(data: {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}): Promise<void>

// 更新源
async updateSource(sourceId: string, data: {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<void>

// 删除源
async deleteSource(sourceId: string): Promise<void>
```

### 2. 更新 SettingsTab

**源列表显示**：
```typescript
config.sources.forEach((source) => {
  // source.id - 源 ID
  // source.name - 显示名称
  // source.baseUrl - API 地址
  // source.apiKeys - API Key 数组
});
```

**当前源选择**：
```typescript
dropdown.addOption(source.id, source.name);
dropdown.setValue(config.activeSourceId);
```

### 3. 更新 ModelRunnerView

**显示当前源名称**：
```typescript
const currentSourceName = this.plugin.configManager!.getCurrentSourceName();
sourceDiv.createEl('strong', { text: currentSourceName });
```

### 4. 更新 SourceModals

**添加源时生成 ID**：
```typescript
const id = data.name.toLowerCase().replace(/[^a-z0-9]/g, '');
await this.plugin.configManager?.addSource({
  id: id,
  name: data.name,
  baseUrl: data.baseURL,
  apiKey: data.apiKey,
});
```

---

## 📝 修改文件

| 文件 | 修改内容 | 行数 |
|------|----------|------|
| ConfigManager.ts | 完全重写，适配原始格式 | 220 行 |
| SettingsTab.ts | 更新源列表渲染 | +40 行 |
| ModelRunnerView.ts | 使用 getCurrentSourceName() | +5 行 |
| SourceModals.ts | 修复重名检查 | +3 行 |
| settings.ts | 删除旧文件 | -200 行 |

---

## 🧪 测试验证

### 测试 1：读取现有源

**步骤**：
1. 重启 Obsidian
2. 启动服务器
3. 打开设置页面

**预期**：
- ✅ 显示 3 个源：云驿、伟业科技、算力岛
- ✅ 当前源显示：云驿 (当前)

### 测试 2：切换源

**步骤**：
1. 在"当前源"下拉框选择"伟业科技"

**预期**：
- ✅ 显示"已切换到: 伟业科技"
- ✅ 侧边栏的"当前源"更新为"伟业科技"
- ✅ config.json 中 activeSourceId 更新为 "ceotech"

### 测试 3：添加新源

**步骤**：
1. 点击"➕ 添加新源"
2. 填写：
   - 源名称：MyAPI
   - Base URL：https://api.example.com/v1
   - API Key：sk-test

**预期**：
- ✅ 生成 ID：myapi
- ✅ 源添加成功
- ✅ 列表显示新源

### 测试 4：编辑源

**步骤**：
1. 点击"云驿"的"编辑"按钮
2. 修改 Base URL

**预期**：
- ✅ 模态框显示现有数据
- ✅ 修改成功
- ✅ config.json 更新

### 测试 5：删除源

**步骤**：
1. 尝试删除"云驿"（当前源）

**预期**：
- ✅ 显示"无法删除当前使用的源"

**步骤**：
1. 删除"算力岛"

**预期**：
- ✅ 弹出确认对话框
- ✅ 删除成功
- ✅ config.json 更新

---

## 🎯 兼容性说明

### 完全兼容

✅ 现有的 config.json **无需修改**  
✅ 所有现有源都能正确读取  
✅ server.js 继续正常工作  
✅ 插件和服务器共享同一配置文件  

### 新增功能

✅ 在插件中可视化管理源  
✅ 支持添加/编辑/删除源  
✅ 支持源切换  
✅ 保持与 server.js 的完全兼容  

---

## 📊 现有源信息

从您的 config.json 读取到的源：

| ID | 名称 | Base URL | API Keys |
|----|----|----------|----------|
| yunyi | 云驿 | https://yunyi.yun/claude/v1 | 1 个 |
| ceotech | 伟业科技 | https://claude.api.ceo-tech.cn/v1 | 1 个 |
| mytokenland | 算力岛 | https://api.mytokenland.com/v1 | 1 个 |

**当前源**：yunyi (云驿)

---

## 🔒 安全说明

### API Key 处理

✅ **读取时不显示完整 Key**  
✅ **编辑时可选更新**（留空则保持不变）  
✅ **添加时使用密码输入框**  
✅ **存储在本地 config.json**（与 server.js 共享）  

**注意**：API Key 存储为明文，与 server.js 保持一致。

---

## ✅ 完成清单

- [x] 分析现有 config.json 格式
- [x] 重写 ConfigManager 适配原始格式
- [x] 更新 SettingsTab 源列表渲染
- [x] 更新 ModelRunnerView 显示
- [x] 修复 SourceModals 重名检查
- [x] 删除旧的 settings.ts
- [x] 编译和部署
- [x] 创建修复文档

---

## 🎊 总结

### 问题根源
插件使用了不同的配置格式，无法读取现有的 config.json。

### 解决方案
完全重写 ConfigManager，直接适配 server.js 使用的原始格式。

### 技术亮点
- ✅ 零迁移成本（无需修改现有配置）
- ✅ 完全兼容（插件和服务器共享配置）
- ✅ 向后兼容（支持所有现有功能）

### 用户体验
- 🚀 现有源自动显示
- 🚀 无缝切换源
- 🚀 可视化管理
- 🚀 与服务器同步

---

**版本**：Phase 2 v0.4.1  
**修复时间**：2024-06-18 00:42  
**状态**：✅ 已修复并部署  

🎉 **现在请重启 Obsidian，所有现有源都会正确显示！** 🎉
