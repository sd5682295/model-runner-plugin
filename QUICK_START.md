# 🚀 Model Runner Obsidian 插件 - 快速开始

## 1️⃣ 安装插件（2分钟）

### 方法 A：直接复制（推荐）

```bash
# Windows
xcopy /E /I "d:\work\model-runner-plugin" "D:\Obsidian\vault\.obsidian\plugins\model-runner"

# Mac/Linux
cp -r /path/to/model-runner-plugin /path/to/vault/.obsidian/plugins/model-runner
```

### 方法 B：符号链接（开发模式）

```bash
# Windows (需要管理员权限)
mklink /D "D:\Obsidian\vault\.obsidian\plugins\model-runner" "d:\work\model-runner-plugin"

# Mac/Linux
ln -s /path/to/model-runner-plugin /path/to/vault/.obsidian/plugins/model-runner
```

---

## 2️⃣ 启用插件（30秒）

1. 打开 Obsidian
2. 设置（齿轮图标）→ **社区插件**
3. 关闭 **安全模式**
4. 在已安装插件列表中找到 **Model Runner**
5. 点击切换开关**启用**

![启用插件](https://via.placeholder.com/600x200?text=Enable+Plugin)

---

## 3️⃣ 启动服务器（30秒）

### 方法 A：通过侧边栏

1. 点击左侧 Ribbon 栏的 **CPU 图标** 🖥️
2. 侧边栏打开后，点击 **▶️ 启动** 按钮
3. 查看日志，等待显示 "服务器启动成功"
4. 状态栏显示 **🟢 运行中**

![启动服务器](https://via.placeholder.com/600x300?text=Start+Server)

### 方法 B：通过命令面板

1. 按 `Ctrl/Cmd + P` 打开命令面板
2. 输入 `Model Runner`
3. 选择 **Model Runner: 启动服务器**

### 方法 C：通过状态栏

1. 点击底部状态栏的 **🔴 未运行**
2. 自动切换到 **🟢 运行中**

---

## 4️⃣ 验证运行（1分钟）

### 检查日志

在侧边栏中应该看到类似日志：

```
[21:20:15] [INFO] 正在启动服务器...
[21:20:15] [INFO] 服务器路径: D:\work\model-runner-plugin\server\server.js
[21:20:16] [INFO] Model Runner 运行  http://localhost:4000
[21:20:16] [INFO] 服务器启动成功
```

### 打开完整界面

1. 点击 **🌐 打开界面** 按钮
2. 浏览器自动打开 http://localhost:4000
3. 看到 Model Runner 完整界面

---

## 5️⃣ 常用操作

### 停止服务器

- 点击 **⏹️ 停止** 按钮
- 或点击状态栏图标切换

### 重启服务器

- 点击 **🔄 重启** 按钮
- 自动停止并在 1 秒后重新启动

### 清空日志

- 点击 **🗑️ 清空** 按钮
- 日志窗口清空，保留一条"日志已清空"提示

---

## 🎯 快捷键

| 操作 | 快捷方式 |
|------|---------|
| 打开命令面板 | `Ctrl/Cmd + P` |
| 打开控制面板 | 搜索 `Model Runner: 打开控制面板` |
| 启动服务器 | 搜索 `Model Runner: 启动服务器` |
| 停止服务器 | 搜索 `Model Runner: 停止服务器` |

---

## ⚠️ 故障排除

### 问题 1：插件无法加载

**症状**：插件列表中看不到 Model Runner

**解决**：
1. 检查插件目录路径是否正确：`.obsidian/plugins/model-runner/`
2. 确认 `manifest.json` 文件存在
3. 重启 Obsidian
4. 查看控制台（`Ctrl/Cmd + Shift + I`）是否有错误

### 问题 2：启动失败

**症状**：点击启动按钮后日志显示错误

**解决**：
1. 检查 `server/server.js` 文件是否存在
2. 确认端口 4000 未被占用
   ```bash
   # Windows
   netstat -ano | findstr :4000
   
   # Mac/Linux
   lsof -i :4000
   ```
3. 手动测试服务器：
   ```bash
   cd d:\work\model-runner-plugin\server
   node server.js
   ```

### 问题 3：日志不显示

**症状**：启动后看不到任何日志

**解决**：
1. 确保侧边栏视图已打开
2. 点击 Ribbon 图标重新打开
3. 重启插件（关闭再启用）
4. 查看浏览器控制台是否有错误

### 问题 4：状态栏不显示

**症状**：底部状态栏看不到 Model Runner 图标

**解决**：
1. 状态栏仅在桌面版显示（移动端不支持）
2. 检查 Obsidian 主题是否隐藏了状态栏
3. 重启 Obsidian

---

## 📚 更多资源

- **完整文档**：查看 `README.md`
- **开发总结**：查看 `DEVELOPMENT_SUMMARY.md`
- **任务清单**：查看 `TODO.md`
- **项目状态**：查看 `PROJECT_STATUS.md`

---

## 🆘 获取帮助

如果遇到问题：

1. 查看日志中的错误信息
2. 打开浏览器控制台（`Ctrl/Cmd + Shift + I`）
3. 记录问题复现步骤
4. 查看 `server/logs/` 目录中的服务器日志

---

## 🎉 成功启动！

现在你可以：

- ✅ 在 Obsidian 侧边栏管理 Model Runner
- ✅ 实时查看服务器日志
- ✅ 一键启动/停止/重启服务器
- ✅ 通过浏览器访问完整界面

**下一步**：开始使用 Model Runner 调用 AI 模型！

---

*最后更新：2024-06-15*
