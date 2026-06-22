# 搜索源管理功能说明

## 概述

搜索源管理功能允许你配置和管理多个搜索 API 源（Google、Bing、Tavily 等），随时切换使用不同的搜索服务。

## 功能特性

### 1. 支持的搜索提供商

- **Google Custom Search** - Google 自定义搜索 API
- **Bing Search API** - 微软 Bing 搜索 API
- **Tavily AI Search** - AI 驱动的搜索 API
- **Serper.dev** - Google 搜索 API 代理
- **自定义** - 任何兼容的搜索 API

### 2. 核心功能

#### 添加搜索源
1. 打开设置 → 🔧 服务管理
2. 滚动到"🔍 搜索源配置"
3. 点击"➕ 添加搜索源"
4. 填写信息：
   - 源名称（如：Google 搜索）
   - 源 ID（自动生成，如：google-search）
   - 提供商类型（下拉选择）
   - Base URL（自动填充）
   - API Key
   - 额外参数（如 Google 的 cx）

#### 测试连接
- 在添加/编辑时点击"🔍 测试连接"
- 发送测试搜索请求（查询："hello world"）
- 验证 API 是否可用

#### 切换搜索源
- 在"当前搜索源"下拉框中选择
- 立即生效

#### 编辑搜索源
- 点击"✏️ 编辑"按钮
- 修改名称、URL、API Key
- 保存更新

#### 删除搜索源
- 点击"🗑️ 删除"按钮
- 确认删除
- 注意：不能删除当前使用的源

## 配置示例

### Google Custom Search

```json
{
  "id": "google-search",
  "name": "Google 搜索",
  "provider": "google",
  "baseUrl": "https://www.googleapis.com/customsearch/v1",
  "apiKey": "YOUR_GOOGLE_API_KEY",
  "params": {
    "cx": "YOUR_CUSTOM_SEARCH_ENGINE_ID"
  }
}
```

**获取 API Key**:
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建项目 → 启用 Custom Search API
3. 创建凭据 → API Key

**获取 cx (Search Engine ID)**:
1. 前往 [Programmable Search Engine](https://programmablesearchengine.google.com/)
2. 创建搜索引擎
3. 复制搜索引擎 ID

### Bing Search API

```json
{
  "id": "bing-search",
  "name": "Bing 搜索",
  "provider": "bing",
  "baseUrl": "https://api.bing.microsoft.com/v7.0/search",
  "apiKey": "YOUR_BING_SUBSCRIPTION_KEY"
}
```

**获取 API Key**:
1. 前往 [Azure Portal](https://portal.azure.com/)
2. 创建 Bing Search 资源
3. 复制订阅密钥

### Tavily AI Search

```json
{
  "id": "tavily-search",
  "name": "Tavily AI",
  "provider": "tavily",
  "baseUrl": "https://api.tavily.com/search",
  "apiKey": "tvly-YOUR_API_KEY"
}
```

**获取 API Key**:
1. 前往 [Tavily.com](https://tavily.com/)
2. 注册账号
3. 获取 API Key

### Serper.dev

```json
{
  "id": "serper-search",
  "name": "Serper 搜索",
  "provider": "serper",
  "baseUrl": "https://google.serper.dev/search",
  "apiKey": "YOUR_SERPER_API_KEY"
}
```

**获取 API Key**:
1. 前往 [Serper.dev](https://serper.dev/)
2. 注册账号
3. 获取 API Key

## 数据存储

配置文件位置：`model-runner/search-sources.json`

```json
{
  "sources": [
    {
      "id": "google-search",
      "name": "Google 搜索",
      "provider": "google",
      "baseUrl": "https://www.googleapis.com/customsearch/v1",
      "apiKey": "YOUR_API_KEY",
      "enabled": true,
      "params": {
        "cx": "YOUR_CX"
      }
    }
  ],
  "activeSourceId": "google-search"
}
```

## API 调用方式

### Google Custom Search

```http
GET https://www.googleapis.com/customsearch/v1?key={apiKey}&cx={cx}&q={query}
```

### Bing Search

```http
GET https://api.bing.microsoft.com/v7.0/search?q={query}
Header: Ocp-Apim-Subscription-Key: {apiKey}
```

### Tavily

```http
POST https://api.tavily.com/search
Header: Authorization: Bearer {apiKey}
Body: {"query": "...", "max_results": 3}
```

### Serper

```http
POST https://google.serper.dev/search
Header: X-API-KEY: {apiKey}
Body: {"q": "..."}
```

## 使用场景

1. **多渠道搜索**
   - 配置多个搜索源
   - 对比不同搜索引擎的结果

2. **成本优化**
   - Google API 配额用完时切换到 Bing
   - 使用免费的 Serper 配额

3. **功能选择**
   - Tavily：AI 优化的搜索结果
   - Google：全面的网页搜索
   - Bing：新闻和图片搜索

4. **测试和开发**
   - 测试环境使用免费 API
   - 生产环境使用付费高质量 API

## 故障排查

### 连接测试失败

1. **检查 API Key**
   - 确认 API Key 正确
   - 检查是否过期

2. **检查 URL**
   - 确认 baseUrl 正确
   - 不要添加额外的路径

3. **检查配额**
   - Google/Bing: 检查配额是否用完
   - 查看账单状态

4. **检查网络**
   - 确认可以访问 API 端点
   - 检查防火墙设置

### Google 特殊问题

- **缺少 cx 参数**: 必须配置 Search Engine ID
- **API 未启用**: 在 Google Cloud Console 启用 Custom Search API
- **计费未设置**: Google API 需要绑定信用卡

### Bing 特殊问题

- **订阅密钥无效**: 检查是否复制了正确的密钥
- **区域限制**: 某些区域可能无法使用

## 最佳实践

1. **备份配置**
   - 定期备份 search-sources.json
   - 记录 API Key 到安全的地方

2. **测试连接**
   - 添加源后立即测试
   - 定期测试确保 API 可用

3. **监控配额**
   - 关注 API 使用量
   - 设置配额告警

4. **安全管理**
   - 不要将 API Key 提交到 Git
   - 使用环境变量或配置文件

5. **多源冗余**
   - 配置至少 2 个搜索源
   - 主源失败时可快速切换

---

**更新时间**: 2026-06-22 23:30
