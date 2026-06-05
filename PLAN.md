# AI 同声传译助手 - 项目计划

## 项目概述

**题目**：七牛云 × XEngineer 暑期实训营 第三批次 - 题目二：AI 同声传译助手

**目标**：开发一款 AI 同声传译助手，通过 AI 能力将单向音频流实时、流畅地翻译成中文，以字幕形式呈现，帮助用户降低语言门槛，提升信息获取效率。系统具备修正能力，能够自动纠正之前识别或翻译的错误。

**时间**：2026年6月5日 - 6月7日（共3天）

---

## 核心需求

1. **实时音频采集**：浏览器采集用户播放的英文音频流
2. **实时语音识别（STT）**：将英文音频实时转为文字
3. **实时翻译**：将英文文字翻译成中文
4. **字幕展示**：实时滚动显示中英双语字幕
5. **自动纠错**：后续翻译自动修正之前的识别/翻译错误

---

## 技术栈

```
后端：   Python 3.11+ / FastAPI / uvicorn
ASR：    Web Speech API（浏览器端，零配置，开发快）
翻译：   七牛云 LLM API（OpenAI 兼容接口，DeepSeek-V3 / Qwen2.5-Max）
前端：   HTML + CSS + JavaScript（原生，不使用框架）
通信：   WebSocket（实时双向通信）
包管理： pip / requirements.txt
```

### 技术选型理由

| 组件 | 选择 | 理由 |
|------|------|------|
| 后端框架 | FastAPI | 原生 async/await + WebSocket，开发速度极快 |
| ASR | Web Speech API | 浏览器内置，免费，零配置，2天内最可靠 |
| 翻译 | 七牛云 LLM | 比赛主办方 API，评委好感度 +1；OpenAI SDK 兼容 |
| 前端 | 原生 HTML/CSS/JS | 字幕页面简单，不需要框架，省时间 |
| 通信 | WebSocket | 实时双向通信，FastAPI 原生支持 |

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
│   └── app.js              # 前端逻辑（音频采集 + WebSocket）
├── docs/
│   └── architecture.md     # 架构设计文档
├── PLAN.md                 # 本文件 - 项目计划
└── README.md               # 项目说明文档
```

---

## 数据流

```
用户播放英文视频/音频
        ↓
浏览器 MediaRecorder API 采集音频
        ↓
Web Speech API 实时识别 → 英文文字（interim + final）
        ↓
WebSocket 发送英文文字到后端
        ↓
后端调用七牛云 LLM 翻译 → 中文文字
        ↓
WebSocket 返回中文翻译到前端
        ↓
前端实时展示中英双语字幕（滚动显示）
        ↓
后续 final 结果到达时 → 自动修正之前的翻译
```

---

## PR 计划（严格按规范提交）

### PR1：项目初始化 + 基础架构（6月5日 下午）

- **内容**：项目骨架搭建
- **文件**：main.py, config.py, requirements.txt, static/index.html
- **验收**：`uvicorn main:app` 启动后能访问页面

### PR2：音频采集 + 语音识别 + 字幕显示（6月5日 晚上）

- **内容**：浏览器端音频采集 + Web Speech API 实时识别 + 字幕 UI
- **文件**：static/app.js, static/style.css
- **验收**：说话后页面实时显示英文字幕

### PR3：翻译功能 + 实时字幕联动（6月6日 上午）

- **内容**：接入七牛云 LLM 翻译 + WebSocket 双向通信 + 中英双语字幕
- **文件**：translator.py, main.py（WebSocket 路由）
- **验收**：说英文 → 实时显示英文 + 中文翻译字幕

### PR4：自动纠错机制（6月6日 下午）

- **内容**：final 结果替换 interim 结果、翻译上下文纠错
- **文件**：corrector.py, static/app.js（UI 更新逻辑）
- **验收**：interim 翻译会在 final 到达后自动修正

### PR5：UI 优化 + 功能完善（6月6日 晚上）

- **内容**：字幕动画效果、深色模式、字体大小调节、历史记录、导出功能
- **文件**：static/ 下所有文件
- **验收**：界面美观、交互流畅

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
| 产品设计合理性 | 简洁的 Web 界面，一键开始，字幕滚动展示 |
| 功能丰富度 | 实时识别 + 翻译 + 纠错 + 历史记录 + 导出 |
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
| ASR（备选） | 替代 Web Speech API | 七牛云实时 ASR（如有时间再接入） |

**API Key 管理**：
- 开发环境：`.env` 文件
- 生产环境：环境变量 `QINIU_API_KEY`
- 前端不直接暴露 API Key，通过后端代理

---

## 风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| Web Speech API 识别不准 | 中 | 使用七牛云 ASR 作为备选 |
| LLM 翻译延迟大 | 中 | 使用流式输出 + 缓存常用句式 |
| WebSocket 连接不稳定 | 低 | 前端自动重连机制 |
| 七牛云 API 额度用完 | 低 | 300万 Token 免费额度足够 |
| 浏览器兼容性问题 | 中 | 推荐 Chrome，README 说明 |

---

## 提交清单

- [ ] GitHub/Gitee 公开仓库
- [ ] 源代码（含完整开发痕迹）
- [ ] README.md（运行说明 + 依赖列表 + demo 视频链接）
- [ ] 架构设计文档
- [ ] demo 视频（声音讲解 + 功能演示，上传 bilibili）
- [ ] 所有 PR 描述完整（标题 + 功能描述 + 实现思路 + 测试方式）
