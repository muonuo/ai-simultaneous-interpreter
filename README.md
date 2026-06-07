# SimulCast — AI 同声传译助手

<h2 align="center">浏览器端 AI 实时同传</h2>
<p align="center">
  打开浏览器即可使用的 AI 同声传译工具。<br>
  捕获标签页音频，实时生成中文字幕，支持本地视频播放和历史导出。<br>
  适用于<b>外语演讲、技术分享、国际会议</b>等场景。
</p>

```bash
git clone https://github.com/muonuo/ai-simultaneous-interpreter.git
```

<p align="center">
  <img src="https://img.shields.io/badge/python-3.9+-blue" alt="Python">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/platform-Web-blueviolet" alt="Platform">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs">
</p>

---

## 📖 目录

- [✨ 创新亮点](#-创新亮点)
- [🧩 系统架构](#-系统架构)
- [🎯 功能特性](#-功能特性)
- [🚀 快速开始](#-快速开始)
- [🔧 技术栈](#-技术栈)
- [📐 项目结构](#-项目结构)
- [📝 PR 记录](#-pr-记录)
- [🎬 演示视频](#-演示视频)
- [📄 许可证](#-许可证)

---

## ✨ 创新亮点

| 创新点 | 说明 |
|---|---|
| 🎬 视频搬运模式 | 捕获标签页视频+音频，画面搬到本页面显示，字幕叠加在下方，无需多窗口切换 |
| 📂 本地文件播放 | 支持打开本地视频文件，同样享受实时翻译字幕，进度条拖拽自动重置翻译 |
| 🔍 智能断句 | 无标点长句自动按语义切分，避免字幕堆积 |
| 🎨 三层动态背景 | 极光渐变 + 音波流动 + 粒子漂浮，科技感沉浸式体验 |
| 📝 AI 摘要 | 翻译结束后一键生成内容摘要，支持缓存 |
| 📄 多格式导出 | 历史记录导出为 PDF / Word / TXT，客户端生成无需服务器 |

---

## 🧩 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                       浏览器端                           │
│                                                         │
│   用户操作          音频采集           画面渲染           │
│   ┌─────────┐     ┌─────────┐      ┌─────────────┐     │
│   │ 标签页/  │────▶│ PCM16   │─────▶│ 视频 + 字幕  │     │
│   │ 本地文件 │     │ 16kHz   │      │ 毛玻璃叠加   │     │
│   └─────────┘     └────┬────┘      └─────────────┘     │
│                        │                                │
└────────────────────────┼────────────────────────────────┘
                         │ WebSocket 实时传输
                         ▼
              ┌─────────────────────┐
              │     FastAPI 服务     │
              │                     │
              │  接收音频流          │
              │  转发到翻译引擎      │
              │  返回翻译结果        │
              │                     │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  阿里云 LiveTranslate │
              │                     │
              │  语音 → 中文（端到端）│
              │  延迟约 1 秒         │
              │  内置纠错能力        │
              └─────────────────────┘
```

### 数据流

```
标签页音频 ──▶ getDisplayMedia ──▶ PCM16 编码 ──▶ WebSocket ──▶ LiveTranslate ──▶ 中文字幕
本地视频   ──▶ captureStream  ──▶ PCM16 编码 ──▶ WebSocket ──▶ LiveTranslate ──▶ 中字幕
                                                                              │
                                                                         ┌────┴────┐
                                                                         │ AI 摘要  │──▶ 一句话总结
                                                                         └─────────┘
```

---

## 🎯 功能特性

- 🎤 **标签页音频实时捕获** — 浏览器原生 API，无需安装插件
- 📂 **本地视频播放** — 支持 MP4 等格式，带完整播放控制（播放/暂停/进度/音量）
- 🌐 **多语言支持** — 英语、日语、韩语、法语、德语、西班牙语
- 🔍 **智能纠错** — LiveTranslate 内置纠错，翻译过程中自动修正错误
- 📋 **历史记录** — 实时显示翻译过程，支持流式更新
- 📝 **AI 摘要** — 一键生成翻译内容摘要（DashScope Qwen）
- 📄 **多格式导出** — PDF / Word / TXT，客户端生成
- 🎨 **科技感 UI** — 极光背景 + 音波 + 粒子 + 毛玻璃字幕

---

## 🚀 快速开始

### 前置要求

- Python 3.9+
- 阿里云百炼 API Key（[免费获取](https://bailian.console.aliyun.com)）

### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/muonuo/ai-simultaneous-interpreter.git
cd ai-simultaneous-interpreter

# 2. 创建虚拟环境
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate # macOS/Linux

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置 API 密钥
copy .env.example .env
# 编辑 .env，填入你的 DASHSCOPE_API_KEY

# 5. 启动服务
python main.py
```

启动后打开浏览器访问 `http://127.0.0.1:8000`

### 环境变量

编辑 `.env` 文件：

```env
# 必填：阿里云百炼 API Key
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx

# 可选：服务配置
HOST=127.0.0.1
PORT=8000
```

> API Key 仅在服务端使用，不会暴露到前端。

---

## 🔧 技术栈

| 类别 | 技术 | 用途 |
|---|---|---|
| Web 框架 | FastAPI | 后端服务，WebSocket 处理 |
| 实时通信 | WebSocket | 音频流传输和翻译结果接收 |
| 翻译引擎 | 阿里云 LiveTranslate | 端到端语音实时翻译 |
| AI 摘要 | DashScope Qwen | 翻译内容摘要生成 |
| 音频采集 | Web Audio API | 浏览器端 PCM16 音频采集 |
| 视频捕获 | getDisplayMedia | 标签页视频和音频捕获 |
| HTTP 客户端 | httpx | 异步 API 调用 |
| PDF 导出 | jsPDF + html2canvas | 客户端 PDF 生成 |

> 以上为第三方依赖，`pip install -r requirements.txt` 一键安装。
> 核心业务逻辑（视频搬运、音频处理、字幕渲染、动态背景、智能断句）均为原创实现。

---

## 📐 项目结构

```
ai-simultaneous-interpreter/
├── main.py                # 服务入口，FastAPI + WebSocket
├── translator_live.py     # LiveTranslate 翻译引擎客户端
├── requirements.txt       # Python 依赖
├── .env.example           # 环境变量模板
│
├── static/
│   ├── index.html         # 主页面
│   ├── app.js             # 前端逻辑（音频采集、字幕、控制）
│   └── style.css          # 样式（极光背景、毛玻璃、动画）
│
└── README.md
```

---

## 📝 PR 记录

| PR | 分支 | 功能 | 说明 |
|---|---|---|---|
| #1 | `feature/export-format-selector` | 导出格式选择器 | 支持 PDF / Word / TXT 三种格式导出，客户端生成 |
| #2 | `feature/aurora-background` | 极光动态背景 | 三层背景：极光渐变 + 音波流动 + 粒子漂浮 |
| #3 | `feature/local-file-playback` | 本地文件播放 | 支持本地视频文件，带播放控制（暂停/进度/音量） |
| #4 | `feature/history-summary` | 历史摘要功能 | DashScope Qwen 生成翻译摘要，支持缓存 |

---

## 🎬 演示视频

<!-- TODO: 替换为你的演示视频链接 -->

https://github.com/user-attachments/assets/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

> 视频展示了 SimulCast 的核心功能：标签页音频捕获、实时字幕翻译、本地视频播放、历史记录导出等。

---

## 📄 许可证

MIT License — 详见 [LICENSE](LICENSE) 文件。

---

<p align="center">
  <sub>Made with Python · FastAPI · 阿里云百炼 · Web Audio API</sub>
</p>
