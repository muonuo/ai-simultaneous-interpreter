# AI 同声传译助手 - 项目计划

## 项目概述

**题目**：七牛云 × XEngineer 暑期实训营 第三批次 - 题目二：AI 同声传译助手

**目标**：Web 端 AI 同声传译工具，捕获浏览器标签页音频 → 实时语音识别 + 翻译 → 浮动字幕。不限平台（YouTube / B站 / 网课 / 会议），帮助用户降低语言门槛。

**时间**：2026年6月5日 - 6月7日

---

## 产品形态

**Web 应用** — 控制面板 + 画中画浮动字幕窗口

```
用户在任意网站看视频 → 打开控制面板 → 点开始 → 选标签页
       ↓
getDisplayMedia() 捕获标签音频
       ↓
Web Audio API 采集 PCM16 音频 → WebSocket 实时流
       ↓
阿里云百炼 LiveTranslate 端到端处理（ASR + 翻译）
       ↓
画中画字幕窗口弹出 → 始终置顶 → 中英双语字幕
```

---

## 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 后端 | Python FastAPI + uvicorn | WebSocket + REST |
| 实时翻译 | 阿里云百炼 LiveTranslate (qwen3.5-livetranslate-flash-realtime) | 端到端 ASR + 翻译，一个 WebSocket 流完成 |
| ASR 语音识别 | LiveTranslate 内置 qwen3-asr-flash-realtime | 英语语音 → 英文文本 |
| 翻译 | LiveTranslate 内置，目标语言 zh | 英文 → 中文 |
| 前端 | 原生 HTML/CSS/JS | 无框架 |
| 音频捕获 | getDisplayMedia + Web Audio API (ScriptProcessor) | PCM16 16kHz mono 直采 |
| 字幕窗口 | Document PiP / window.open / 内联 | 三级降级 |
| 跨窗口通信 | BroadcastChannel | 控制面板 → 字幕窗口 |

---

## 项目结构

```
ai-simultaneous-interpreter/
├── main.py                 # FastAPI + WebSocket 端点
├── translator_live.py      # 阿里云百炼 LiveTranslate 实时翻译
├── config.py               # 配置管理
├── requirements.txt        # Python 依赖
├── .env.example            # 环境变量模板
├── static/
│   ├── index.html          # 控制面板页面
│   ├── pip.html            # 画中画字幕窗口
│   ├── style.css           # 样式
│   └── app.js              # 前端逻辑
├── AGENTS.md               # 项目规则（AI 开发用）
├── PLAN.md                 # 本文件
└── README.md               # 项目说明（待补充）
```

---

## 数据流

```
┌─ 浏览器 ───────────────────────────────────────────┐
│                                                     │
│  用户看视频 (YouTube/B站/网课...)                     │
│       ↓                                             │
│  getDisplayMedia() 捕获标签音频                       │
│       ↓                                             │
│  Web Audio API → ScriptProcessor (128ms/块)          │
│       ↓                                             │
│  PCM16 Int16 → base64 → WebSocket 实时流             │
│       ↓                                             │
│  BroadcastChannel ←── 翻译结果 ←──┐                  │
│       ↓                          │                  │
│  画中画字幕窗口                    │                  │
│  ┌──────────────────────┐        │                  │
│  │ EN: Hello world      │        │                  │
│  │ 中: 你好世界          │        │                  │
│  └──────────────────────┘        │                  │
└──────────────────────────────────┼──────────────────┘
                                   │
┌─ Python 后端 ────────────────────┼──────────────────┐
│                                  │                  │
│  WebSocket ←── base64 PCM16 ─────┘                  │
│       ↓                                             │
│  LiveTranslator.send_audio()                        │
│       ↓                                             │
│  阿里云百炼 LiveTranslate WebSocket                   │
│    (wss://dashscope.aliyuncs.com/api-ws/v1/realtime) │
│       ↓                                             │
│  模型 qwen3.5-livetranslate-flash-realtime            │
│    ├─ ASR: 音频 → 英文文本 (流式 + 最终)              │
│    └─ 翻译: 英文 → 中文 (流式 interim + final)         │
│       ↓                                             │
│  回调 → on_result(en, zh, type) → WebSocket 推前端    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 事件类型说明

LiveTranslate 返回三种翻译结果类型，前端据此控制字幕显示样式：

| 类型 | 含义 | 前端表现 |
|------|------|---------|
| `interim` | 暂定结果，后续可能修正 | 半透明字幕 |
| `final` | 最终确定结果 | 实色字幕 |
| `corrected` | 对之前 final 结果的修正 | 实色字幕 + 修正标记 |

---

## PR 计划

### ✅ PR1：项目初始化 + 基础架构（已完成）

- FastAPI + WebSocket 骨架
- 控制面板 UI（深色主题 + 画中画三级降级）
- 标签页音频捕获 + 本地文件上传

### ⬜ PR2：阿里云百炼 LiveTranslate 实时翻译（当前工作）

- ✅ 接入 LiveTranslate 端到端实时语音翻译
- ✅ 流式 interim/final/corrected 事件处理
- ✅ 自动断线重连
- ⬜ 端到端联调验证
- ⬜ 清理废弃代码（asr.py, translator.py）→ 已完成

### ⬜ PR3：UI 优化 + 功能完善

- 字幕配置（字体大小/位置/语言切换）
- 翻译历史记录
- 字幕导出（SRT/TXT）

### ⬜ PR4：文档 + Demo 视频

- README.md（项目介绍 / 运行方式 / 依赖列表 / 架构说明 / Demo 链接）
- 架构设计文档
- Demo 视频录制（含声音讲解，上传 bilibili）

---

## 待办

- [x] 删除废弃文件 asr.py 和 translator.py（已迁移到 LiveTranslate）
- [x] 更新 .env.example 为 DASHSCOPE_API_KEY
- [ ] 端到端测试：视频播放 → 字幕出现
- [ ] 录制 Demo 视频
