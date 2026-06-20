# Task: 爆款素材搜集 + 资料整理系统

## 背景

幽灵的写作体系需要持续搜集爆款素材（小说/文章/帖子等），整理归类，方便后续分析和使用。不做整体工作流，只做**素材搜集、存储、检索**三个核心功能。

## 设计原则

- 不做自动化抓取（暂不依赖爬虫）
- 以手动上传 + 粘贴为主
- 重点是：**快速搜集 + 精准分类 + 高效检索**

## 数据结构设计

### sources.json（素材来源管理）

```json
[
  {
    "id": "src_001",
    "name": "番茄小说-都市爽文",
    "url": "https://example.com",
    "platform": "番茄小说",
    "category": "小说",
    "subCategory": "都市爽文",
    "note": "爆款率最高的分类",
    "createdAt": "2026-04-01"
  }
]
```

### materials.json（素材存储）

```json
[
  {
    "id": "mat_001",
    "title": "第一章：被赶出家门",
    "sourceId": "src_001",
    "url": "https://example.com/12345",
    "content": "全文内容...",
    "summary": "主角被后妈赶出家门，发现自己是豪门真少爷...",
    "extractedFeatures": {
      "genre": "都市爽文",
      "tags": ["断亲", "逆袭", "打脸"],
      "structure": "开局即冲突",
      "pacing": "快节奏，每章2-3个爽点",
      "openingHook": "用冲突事件开篇，3句话内制造矛盾"
    },
    "analysisNotes": "开篇钩子很强，用'被赶出'这个动作瞬间建立冲突...",
    "reusableModules": [
      "开篇冲突模板",
      "打脸节奏设计"
    ],
    "linkedPrompts": ["p_001", "p_003"],
    "createdAt": "2026-05-01",
    "updatedAt": "2026-05-01"
  }
]
```

## 功能模块

### 1. 素材来源管理

**API**：
```
GET    /sources         # 列表
POST   /sources          # 添加来源
PUT    /sources/:id     # 更新
DELETE /sources/:id      # 删除
```

**功能**：
- 记录素材来源（平台/帖子/链接）
- 按平台分类（番茄小说/起点/小红书/知乎等）
- 记录来源备注和标签

### 2. 素材上传 + 快速入库

**API**：
```
GET    /materials       # 列表，支持筛选（source/tag/keyword）
GET    /materials/:id   # 详情
POST   /materials        # 创建
PUT    /materials/:id   # 更新
DELETE /materials/:id   # 删除
```

**上传方式**（按优先级实现）：
1. **粘贴文本**：`{ title, content, sourceId }` 直接 POST
2. **URL 记录**：`{ title, url, sourceId }` 记录链接，content 后续补
3. **批量导入**：支持 JSON 格式批量导入多条素材

**字段**：
- title（必填）
- content（正文，可选）
- summary（摘要，可选）
- sourceId（关联来源）
- url（原始链接）
- tags（标签数组）
- analysisNotes（分析笔记）
- linkedPrompts（关联的 prompt ID 数组）

### 3. 素材分析与特征提取

**API**：`POST /materials/:id/analyze`

**功能**：
- 调用 model-runner 分析素材
- 自动提取特征：genre/tags/structure/pacing/openingHook
- 生成 summary（如果未填）
- 分析完成后写入 `extractedFeatures` 字段

**分析 Prompt 示例**（系统调用，不需要用户操作）：
```
你是一个爆款网文分析师。请分析以下素材：
1. 提取核心标签（最多5个）
2. 分析结构特点（开篇/发展/高潮/结尾）
3. 分析节奏设计（爽点密度/冲突递进）
4. 提炼开篇钩子模式

原文：[content]
```

### 4. 检索系统

**API**：`GET /materials/search?q=关键词`

**功能**：
- 全文检索（title + content + summary + analysisNotes）
- 按 tag 筛选
- 按 sourceId 筛选
- 按时间范围筛选
- 返回结果包含 matchedContent（高亮匹配片段）

**实现**：简单的关键词匹配（不需要引入搜索引擎），纯 Node.js 实现。

### 5. 素材分析工具

**API**：`GET /materials/:id/features`

**功能**：
- 展示该素材的所有分析特征
- 支持手动编辑 extractedFeatures 和 analysisNotes
- 支持添加 reusableModules（可复用模块）
- 支持关联到 prompt（linkedPrompts）

### 6. 统计面板

**API**：`GET /materials/stats`

**返回**：
```json
{
  "total": 156,
  "byPlatform": {"番茄小说": 45, "起点": 23, "小红书": 88},
  "byTag": {"断亲": 34, "逆袭": 67, "打脸": 45},
  "recentlyAdded": 12
}
```

## 页面设计方向（非强制）

- 列表页：素材卡片（标题 + 来源 + tags + 时间）
- 详情页：全文 + 提取特征 + 分析笔记 + 关联 prompt
- 快速入库入口：顶部输入框，粘贴即入库
- 搜索栏：顶部，支持 tag 筛选

## 技术要求

- 存储：`D:\work\model-runner\sources.json` 和 `D:\work\model-runner\materials.json`
- 与 model-runner 的 `/chat` 接口联动（分析功能）
- 纯 Node.js，不引入数据库

## 交付物

1. `sources.json` + `materials.json` 数据结构
2. 完整 API 端点（`/sources`、`/materials`、`/materials/search`、`/materials/stats`、`/materials/:id/analyze`、`/materials/:id/features`）
3. 简单的 HTML 页面（素材列表 + 详情 + 快速入库）
4. 示例数据（至少 5 条真实风格的素材示例）

## 测试用例

1. 添加一条素材（粘贴内容），自动关联到来源
2. 调用 `/analyze`，确认提取了正确的特征
3. 搜索关键词，返回相关素材，高亮匹配片段
4. 关联素材到 prompt，双向都能查到
5. 统计面板正确显示各维度数量
