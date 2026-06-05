# AI 同声传译助手 - 项目计划

## 项目概述

**题目**：七牛云 × XEngineer 暑期实训营 第三批次 - 题目二：AI 同声传译助手

**目标**：开发一款 Web 端 AI 同声传译助手。用户在我们的网页中播放英文视频，页面实时显示中英双语字幕，帮助用户降低语言门槛，提升信息获取效率。系统具备修正能力，能够自动纠正之前识别或翻译的错误。

**时间**：2026年6月5日 - 6月7日（共3天）

**参考项目**：
- [open-realtime-translate](https://github.com/sugarforever/open-realtime-translate) — Chrome 扩展，OpenAI Realtime API
- [OpenAI browser-translation-demo](https://github.com/openai/openai-cookbook/tree/main/examples/voice_solutions/realtime_translation_guide/browser-translation-demo) — WebRTC + OpenAI 翻译 API

---

## 产品形态

**Web 应用** — 视频在页面内播放 + 实时中英双语字幕

### 用户交互流程

```
打开我们的网页
  → 粘贴 YouTube 链接（或上传本地视频/音频文件）
  → 点击"开始翻译"
  → 页面播放视频 + 视频下方实时显示中英双语字幕
```

### 页面布局

```
┌─────────────────────────────────────┐
│  AI 同声传译助手                       │
├─────────────────────────────────────┤
│  [粘贴链接...]  [上传文件]  [开始翻译]    │
├─────────────────────────────────────┤
│                                     │
│         视频播放区域                   │
│     (YouTube 嵌入 / 本地文件)          │
│                                     │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │  英文原文（实时滚动）          │    │
│  │  The quick brown fox...     │    │
│  ├─────────────────────────────┤    │
│  │  中文翻译（实时滚动）          │    │
│  │  敏捷的棕色狐狸...           │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│  [暂停] [导出字幕] [字体大小] [深色模式] │
└─────────────────────────────────────┘
```

### 两种输入模式

| 模式 | 用户操作 | 技术实现 |
|------|---------|---------|
| **链接模式** | 粘贴 YouTube URL | YouTube IFrame Player API 嵌入播放 |
| **文件模式** | 上传 mp4/mp3/wav 文件 | `<video>` / `<audio>` 标签播放 |

---

## 核心需求

1. **视频播放**：支持 YouTube 链接嵌入 + 本地视频/音频文件上传
2. **实时语音识别（STT）**：从页面内视频捕获音频，实时识别英文
3. **实时翻译**：将英文文字翻译成中文
4. **字幕展示**：实时滚动显示中英双语字幕
5. **自动纠错**：final 结果替换 interim 结果，后续翻译修正之前的错误
6. **字幕导出**：支持导出 SRT/TXT 格式字幕文件

---

## 技术栈

```
后端：   Python 3.11+ / FastAPI / uvicorn
前端：   HTML + CSS + JavaScript（原生，不使用框架）
ASR：    Web Speech API（浏览器端，从页面内视频捕获音频）
翻译：   七牛云 LLM API（OpenAI 兼容接口，DeepSeek-V3 / Qwen2.5-Max）
通信：   WebSocket（实时双向通信）
包管理： pip / requirements.txt
```

### 技术选型理由

| 组件 | 选择 | 理由 |
|------|------|------|
| 产品形态 | Web 应用 | 零安装，评委打开链接即用 |
| 视频播放 | YouTube IFrame API + HTML5 Video | 两种模式覆盖常见场景 |
| 音频捕获 | captureStream() 从页面内视频元素获取 | 不需要跨标签，不依赖麦克风 |
| ASR | Web Speech API | 浏览器内置，免费，零配置 |
| 翻译 | 七牛云 LLM | 主办方 API，OpenAI SDK 兼容 |
| 前端 | 原生 HTML/CSS/JS | 页面简单，不需要框架 |
| 通信 | WebSocket | 实时双向，FastAPI 原生支持 |

---

## 项目结构

```
ai-simultaneous-interpreter/
├── main.py                 # FastAPI 入口 + WebSocket 路由
├── translator.py           # 翻译模块（调七牛云 LLM）
├── corrector.py            # 自动纠错模块
├── config.py               # 配置管理（API Key 等）
├── requirements.txt        # Python 依赖
├── static/
│   ├── index.html          # 前端页面
│   ├── style.css           # 样式（字幕动画等）
│   └── app.js              # 前端逻辑（视频播放 + 音频捕获 + WebSocket）
├── docs/
│   └── architecture.md     # 架构设计文档
├── CLAUDE.md               # 项目规则
├── PLAN.md                 # 本文件 - 项目计划
└── README.md               # 项目说明文档
```

---

## 数据流

```
用户粘贴 YouTube URL / 上传视频文件
        ↓
页面内播放视频（<video> 或 YouTube iframe）
        ↓
captureStream() 捕获视频音频轨道
        ↓
Web Speech API 实时识别 → 英文文字（interim + final）
        ↓
WebSocket 发送英文文字到后端
        ↓
后端调用七牛云 LLM 流式翻译 → 中文文字
        ↓
WebSocket 返回中文翻译到前端
        ↓
前端实时展示中英双语字幕（滚动显示）
        ↓
final 结果到达时 → 自动修正 interim 翻译
```

---

## PR 计划（严格按规范提交）

### PR1：项目初始化 + 基础架构（6月5日 下午）

- **内容**：FastAPI 骨架 + 基础 HTML 页面 + 静态文件服务
- **文件**：main.py, config.py, requirements.txt, static/index.html
- **验收**：`uvicorn main:app` 启动后能访问页面

### PR2：视频播放 + 音频捕获 + 语音识别（6月5日 晚上）

- **内容**：YouTube 嵌入播放 + 本地文件上传 + captureStream() + Web Speech API 识别 + 字幕 UI
- **文件**：static/app.js, static/style.css
- **验收**：播放视频后页面实时显示英文字幕

### PR3：翻译功能 + 实时双语字幕（6月6日 上午）

- **内容**：接入七牛云 LLM 翻译 + WebSocket 双向通信 + 中英双语字幕联动
- **文件**：translator.py, main.py（WebSocket 路由）
- **验收**：播放英文视频 → 实时显示英文 + 中文翻译字幕

### PR4：自动纠错机制（6月6日 下午）

- **内容**：final 结果替换 interim 结果、翻译上下文纠错、字幕平滑过渡
- **文件**：corrector.py, static/app.js
- **验收**：interim 翻译会在 final 到达后自动修正，字幕不闪烁

### PR5：UI 优化 + 功能完善（6月6日 晚上）

- **内容**：字幕动画效果、深色模式、字体大小调节、字幕导出（SRT/TXT）
- **文件**：static/ 下所有文件
- **验收**：界面美观、交互流畅、可导出字幕

### PR6：文档 + demo 视频（6月7日）

- **内容**：README、架构设计文档、依赖说明、demo 视频录制
- **文件**：README.md, docs/architecture.md
- **验收**：文档完整，demo 视频覆盖核心功能

---

## 评审标准对照

### 用户价值 60%

| 考察点 | 我们的覆盖 |
|--------|-----------|
| 产品目标合理性 | 实时翻译英文演讲/视频/网课，用户需求明确 |
| 产品设计合理性 | Web 页面内播放视频 + 字幕，一站式体验 |
| 功能丰富度 | YouTube/文件双模式 + 实时翻译 + 纠错 + 导出 |
| 符合用户需求 | 直接解决看英文视频的语言障碍 |

### 技术质量 40%

| 考察点 | 我们的覆盖 |
|--------|-----------|
| 架构设计 | FastAPI + WebSocket 异步管道，模块清晰 |
| 可维护性 | 翻译/纠错/配置 分模块，职责单一 |
| 可扩展性 | ASR 和翻译模块可替换（Web Speech API → 七牛云 ASR） |
| 代码规范 | 类型注解、docstring、统一的错误处理 |

---

## 七牛云 API 使用计划

| API | 用途 | 接入方式 |
|-----|------|---------|
| LLM 聊天补全（流式） | 英译中翻译 | `openai` SDK，base_url 指向七牛云 |
| 结构化输出 | 确保翻译格式一致 | LLM 的 JSON mode |

**API Key 管理**：
- 开发环境：`.env` 文件
- 生产环境：环境变量 `QINIU_API_KEY`
- 前端不直接暴露 API Key，通过后端代理

---

## 风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| YouTube iframe 无法获取音频流 | 高 | 优先支持本地文件上传，YouTube 作为加分项 |
| Web Speech API 识别不准 | 中 | 调整识别语言参数，提供纠错机制 |
| LLM 翻译延迟大 | 中 | 使用流式输出，边翻译边显示 |
| WebSocket 连接不稳定 | 低 | 前端自动重连机制 |
| 浏览器兼容性问题 | 中 | 推荐 Chrome，README 说明 |

---

## 提交清单

- [ ] GitHub/Gitee 公开仓库
- [ ] 源代码（含完整开发痕迹）
- [ ] README.md（运行说明 + 依赖列表 + demo 视频链接）
- [ ] 架构设计文档
- [ ] demo 视频（声音讲解 + 功能演示，上传 bilibili）
- [ ] 所有 PR 描述完整（标题 + 功能描述 + 实现思路 + 测试方式）
