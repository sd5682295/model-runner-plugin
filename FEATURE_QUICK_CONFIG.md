# ✨ 新功能：侧边栏快速配置面板

**功能版本**：Phase 2 v0.3.0  
**开发日期**：2024-06-17  
**状态**：✅ 已实现并部署  

---

## 🎯 功能概述

在侧边栏直接修改所有常用设置，**无需跳转到设置页面**！

---

## ✨ 新增的可编辑配置项

### 1. 自动启动开关 ✅
- **功能**：打开 Obsidian 时自动启动服务器
- **类型**：开关（Toggle）
- **默认值**：关闭
- **实时生效**：立即保存

### 2. 端口号配置 ✅
- **功能**：修改服务器监听端口
- **类型**：数字输入（1024-65535）
- **默认值**：4000
- **生效时机**：重启服务器后生效

### 3. 自动重启开关 ✅
- **功能**：服务器崩溃时自动重启
- **类型**：开关（Toggle）
- **默认值**：开启
- **实时生效**：立即保存

### 4. 显示通知开关 ✅
- **功能**：控制是否显示启动/停止/错误通知
- **类型**：开关（Toggle）
- **默认值**：开启
- **实时生效**：立即保存

### 5. 当前源信息（只读）
- **功能**：显示当前使用的 API 源
- **类型**：只读文本
- **显示条件**：启动服务器后

---

## 🎨 界面设计

### 布局结构

```
┌─────────────────────────────────────┐
│  ⚙️ 快速配置                        │
├─────────────────────────────────────┤
│                                     │
│  自动启动                 [Toggle] │
│  打开 Obsidian 时自动启动服务器     │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  端口号                    [4000]   │
│  服务器监听端口（1024-65535）       │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  自动重启                 [Toggle] │
│  服务器崩溃时自动重启               │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  显示通知                 [Toggle] │
│  显示启动/停止/错误通知             │
│                                     │
│  ═════════════════════════════════  │
│                                     │
│  当前源: OpenAI                     │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  [     ⚙️ 更多设置     ]            │
│                                     │
└─────────────────────────────────────┘
```

### 样式特点
- ✅ 使用 Obsidian 原生组件样式
- ✅ 响应式布局
- ✅ 清晰的分隔线
- ✅ 一致的间距和对齐

---

## 🚀 使用体验

### 之前的体验 ❌

```
1. 想要修改自动启动设置
2. 点击 "设置" → "社区插件"
3. 找到 "Model Runner"
4. 点击设置图标
5. 修改选项
6. 关闭设置页面
7. 回到侧边栏
```

**7 步操作，需要切换页面**

### 现在的体验 ✅

```
1. 在侧边栏直接点击开关
2. 完成！
```

**1 步操作，无需切换页面**

---

## 🔧 技术实现

### 核心方法

#### 1. createToggleSetting()
创建开关型配置项：

```typescript
private createToggleSetting(
  name: string,              // 配置项名称
  desc: string,              // 配置项描述
  value: boolean,            // 当前值
  onChange: (value: boolean) => Promise<void>  // 变化回调
): void {
  // 创建标准的 Obsidian setting-item 结构
  const settingItem = this.configContainer.createDiv({ cls: 'setting-item' });
  
  const settingInfo = settingItem.createDiv({ cls: 'setting-item-info' });
  settingInfo.createDiv({ text: name, cls: 'setting-item-name' });
  settingInfo.createDiv({ text: desc, cls: 'setting-item-description' });
  
  const settingControl = settingItem.createDiv({ cls: 'setting-item-control' });
  const toggle = settingControl.createEl('input', {
    type: 'checkbox',
    cls: 'mod-toggle',
  });
  toggle.checked = value;
  toggle.onchange = async () => {
    await onChange(toggle.checked);
  };
}
```

#### 2. createNumberSetting()
创建数字输入型配置项：

```typescript
private createNumberSetting(
  name: string,
  desc: string,
  value: number,
  onChange: (value: number) => Promise<void>
): void {
  // 类似结构，但使用 input[type="number"]
  const input = settingControl.createEl('input', {
    type: 'number',
    cls: 'mod-number',
  });
  input.value = String(value);
  input.onchange = async () => {
    const num = parseInt(input.value);
    if (!isNaN(num)) {
      await onChange(num);
    }
  };
}
```

#### 3. refreshConfig()
刷新配置显示：

```typescript
refreshConfig(): void {
  this.configContainer.empty();
  
  // 自动启动
  this.createToggleSetting('自动启动', '...', this.plugin.settings.autoStart, 
    async (value) => {
      this.plugin.settings.autoStart = value;
      await this.plugin.saveSettings();
    }
  );
  
  // 端口
  this.createNumberSetting('端口号', '...', this.plugin.settings.port,
    async (value) => {
      if (value < 1024 || value > 65535) {
        new Notice('❌ 端口必须在 1024-65535 之间');
        return;
      }
      this.plugin.settings.port = value;
      await this.plugin.saveSettings();
      new Notice('✅ 端口已更新，重启服务器后生效');
    }
  );
  
  // ... 其他配置项
}
```

---

## 📊 文件修改

### ModelRunnerView.ts
- ✅ 重写 `refreshConfig()` 方法（+80 行）
- ✅ 添加 `createToggleSetting()` 方法（+25 行）
- ✅ 添加 `createNumberSetting()` 方法（+25 行）
- **总计**：+130 行

### styles.css
- ✅ 添加 `setting-item` 样式（+50 行）
- ✅ 添加 `config-divider` 样式
- ✅ 添加 `config-value` 样式
- **总计**：+50 行

### ConfigManager.ts（已创建，待集成）
- ✅ 完整的配置读写封装（+140 行）

---

## 🎯 配置项说明

### 自动启动

**开启后**：
- Obsidian 启动后 2 秒自动启动服务器
- 适合经常使用 Model Runner 的用户

**关闭后**：
- 需要手动点击"启动"按钮
- 适合偶尔使用的用户

### 端口号

**默认值**：4000

**修改场景**：
- 端口 4000 被其他程序占用
- 需要运行多个实例

**注意事项**：
- 修改后需要重启服务器
- 端口必须在 1024-65535 之间
- 避免使用常见端口（如 3000, 8080）

### 自动重启

**开启后**：
- 服务器崩溃时自动重启
- 最多尝试 3 次
- 使用指数退避策略（1s, 2s, 4s）

**关闭后**：
- 崩溃后不会自动重启
- 需要手动重启

### 显示通知

**开启后**：
- 启动成功：✅ Model Runner 已启动
- 停止：🛑 Model Runner 已停止
- 错误：❌ 错误信息

**关闭后**：
- 只在日志中记录
- 适合不喜欢弹窗的用户

---

## 🎨 UI/UX 设计原则

### 1. 使用 Obsidian 原生组件
- ✅ `setting-item` 类
- ✅ `setting-item-info` 类
- ✅ `setting-item-control` 类
- ✅ `mod-toggle` 类
- ✅ 原生颜色变量

**优势**：
- 自动适配主题
- 与 Obsidian 风格一致
- 支持暗色模式

### 2. 清晰的信息层级
- **标题**：大字体，突出
- **名称**：中等字体，加粗
- **描述**：小字体，灰色
- **分隔线**：视觉分组

### 3. 即时反馈
- 修改后立即保存
- 显示友好的通知
- 端口修改提示"重启后生效"

### 4. 渐进式展示
- 基础配置：直接显示
- 高级配置："更多设置"按钮
- 动态信息：启动后显示

---

## 🧪 测试建议

### 手动测试清单

#### 测试 1：自动启动开关
1. 点击"自动启动"开关，开启
2. 完全关闭 Obsidian
3. 重新打开 Obsidian
4. **预期**：2 秒后自动启动服务器

#### 测试 2：端口号修改
1. 修改端口为 4001
2. **预期**：显示提示"端口已更新，重启服务器后生效"
3. 点击"重启"按钮
4. **预期**：服务器在 4001 端口启动
5. 访问 http://localhost:4001
6. **预期**：能正常访问

#### 测试 3：端口号验证
1. 输入端口 999（小于 1024）
2. **预期**：显示"❌ 端口必须在 1024-65535 之间"
3. 输入端口 70000（大于 65535）
4. **预期**：显示相同错误提示

#### 测试 4：自动重启开关
1. 开启"自动重启"
2. 启动服务器
3. 在任务管理器强制结束 node.exe 进程
4. **预期**：服务器自动重启

#### 测试 5：通知开关
1. 关闭"显示通知"
2. 启动服务器
3. **预期**：不显示通知弹窗，但日志正常记录
4. 开启"显示通知"
5. 停止服务器
6. **预期**：显示"🛑 Model Runner 已停止"

#### 测试 6：更多设置按钮
1. 点击"⚙️ 更多设置"按钮
2. **预期**：跳转到设置页面的 Model Runner 选项卡

---

## 🎉 功能优势

### 用户体验提升
- ⭐ **零页面跳转**：在侧边栏直接修改
- ⭐ **即时反馈**：修改后立即保存
- ⭐ **清晰的 UI**：使用 Obsidian 原生组件
- ⭐ **友好的提示**：明确告知生效时机

### 开发优势
- ⭐ **可复用方法**：`createToggleSetting()` 和 `createNumberSetting()`
- ⭐ **易于扩展**：添加新配置项只需调用方法
- ⭐ **类型安全**：完整的 TypeScript 类型定义

### 维护优势
- ⭐ **代码清晰**：每个方法职责单一
- ⭐ **易于测试**：独立的设置项方法
- ⭐ **样式一致**：使用 Obsidian 原生样式

---

## 🔮 未来改进

### Phase 2 待完成
1. 源切换下拉框
2. 添加完整的设置页面（PluginSettingTab）

### Phase 3 计划
1. 健康状态面板
2. 源管理（增删改）
3. 模型路由配置

---

## 📚 参考资料

技术参考：
- [Obsidian Settings API](https://docs.obsidian.md/Plugins/User+interface/Settings)
- [Obsidian CSS Variables](https://docs.obsidian.md/Reference/CSS+variables)

UI 设计：
- 参考 Obsidian 核心插件的设置面板
- 使用 Obsidian 原生组件保证一致性

---

## ✅ 完成清单

- [x] 创建可复用的设置项方法
- [x] 实现自动启动开关
- [x] 实现端口号配置
- [x] 实现自动重启开关
- [x] 实现通知开关
- [x] 添加"更多设置"按钮
- [x] 添加样式美化
- [x] 编译和部署
- [x] 创建功能文档

---

**功能版本**：Phase 2 v0.3.0  
**开发者**：Claude Fable 5  
**开发时间**：2024-06-17 07:26  
**状态**：✅ 已实现并部署  
**下一步**：用户测试和反馈
