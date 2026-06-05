# AI 同声传译助手 - 项目计划

## 项目概述

**题目**：七牛云 × XEngineer 暑期实训营 第三批次 - 题目二：AI 同声传译助手

**目标**：Web 端 AI 同声传译工具，捕获浏览器标签页音频 → 语音识别 → 实时翻译 → 浮动字幕。不限平台（YouTube / B站 / 网课 / 会议），帮助用户降低语言门槛。

**时间**：2026年6月5日 - 6月7日

---

## 产品形态

**Web 应用** — 控制面板 + 画中画浮动字幕窗口

```
用户在任意网站看视频 → 打开控制面板 → 点开始 → 选标签页
       ↓
getDisplayMedia() 捕获标签音频 → MediaRecorder 编码
       ↓
WebSocket 发后端 → STT 转写 → 七牛云 LLM 翻译
       ↓
画中画字幕窗口弹出 → 始终置顶 → 中英双语字幕
```

---

## 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 后端 | Python FastAPI + uvicorn | WebSocket + REST |
| LLM 翻译 | 七牛云 API (qnaigc.com) | OpenAI 兼容，deepseek-v4-flash |
| STT 语音识别 | Groq Whisper / OpenAI Whisper | 后端 ASR，音频流转文字 |
| 前端 | 原生 HTML/CSS/JS | 无框架 |
| 音频捕获 | getDisplayMedia + MediaRecorder | 捕获浏览器标签页音频 |
| 字幕窗口 | Document PiP / window.open / 内联 | 三级降级 |
| 跨窗口通信 | BroadcastChannel | 控制面板 → 字幕窗口 |

---

## 项目结构

```
ai-simultaneous-interpreter/
├── main.py                 # FastAPI + WebSocket 端点
├── translator.py           # 翻译服务（七牛云 LLM）
├── asr.py                  # 语音识别服务（Whisper STT）
├── config.py               # 配置管理
├── requirements.txt        # Python 依赖
├── .env.example            # 环境变量模板
├── static/
│   ├── index.html          # 控制面板页面
│   ├── pip.html            # 画中画字幕窗口
│   ├── style.css           # 样式
│   ├── app.js              # 前端逻辑
│   └── test.html           # 文件上传测试页
├── docs/
│   └── architecture.md     # 架构设计文档
├── CLAUDE.md               # 项目规则
├── PLAN.md                 # 本文件
└── README.md               # 项目说明
```

---

## 数据流

```
┌─ 浏览器 ─────────────────────────────────────┐
│                                               │
│  用户看视频 (YouTube/B站/网课...)               │
│       ↓                                       │
│  getDisplayMedia() 捕获标签页音频               │
│       ↓                                       │
│  MediaRecorder 编码 (audio/webm, 3s/块)        │
│       ↓                                       │
│  WebSocket ──── 音频块 (binary) ──────────┐    │
│                                           │    │
│  BroadcastChannel ←── 翻译结果 ←──────┐    │    │
│       ↓                              │    │    │
│  画中画字幕窗口                        │    │    │
│  ┌────────────────────┐              │    │    │
│  │ EN: Hello world    │              │    │    │
│  │ 中: 你好世界        │              │    │    │
│  └────────────────────┘              │    │    │
└──────────────────────────────────────┼────┘
                                       │
┌─ Python 后端 ─────────────────────────┼────┐
│                                      │    │
│  WebSocket ←── 音频块 ───────────────┘    │
│       ↓                                   │
│  AudioBuffer 缓冲 (3块 = 9s音频)           │
│       ↓                                   │
│  asr.transcribe_audio() → Whisper STT     │
│       ↓                                   │
│  translator.translate_text() → LLM翻译    │
│       ↓                                   │
│  WebSocket ──── JSON结果 ──────────→ 前端   │
│                                           │
└───────────────────────────────────────────┘
```

---

## PR 计划

### ✅ PR1：项目初始化 + 基础架构（已完成）

- FastAPI + WebSocket 骨架
- 控制面板 UI（深色主题）
- 画中画字幕窗口（三级降级）
- 标签页音频捕获 + 本地文件上传

### 🔄 PR2：翻译核心 + 语音识别管线（进行中）

- ✅ 七牛云 LLM 翻译（英→中）
- ✅ 自动纠错机制
- ✅ MediaRecorder + 后端 STT 管线
- ⬜ 配置 STT API Key（Groq/OpenAI）
- ⬜ 端到端测试

### ⬜ PR3：UI 优化 + 功能完善

- 字幕导出（SRT/TXT）
- 翻译历史记录
- 目标语言切换

### ⬜ PR4：文档 + Demo 视频

- README.md
- 架构设计文档
- Demo 视频录制

---

## 待办

- [ ] 获取 STT API Key（Groq console.groq.com 免费注册）
- [ ] 配置 `.env` 中的 STT 相关变量
- [ ] 端到端测试：视频播放 → 字幕出现
- [ ] 录 Demo 视频
