# 项目规则 - AI 同声传译助手

> 本文件定义项目级开发规则，所有开发行为必须遵守。

---

## 项目基本信息

- **项目名称**：AI 同声传译助手
- **比赛**：七牛云 × XEngineer 暑期实训营 第三批次 - 题目二
- **时间窗口**：2026年6月5日 00:00 – 6月7日 23:59
- **技术栈**：Python / FastAPI / 原生前端 / WebSocket / 七牛云 LLM API
- **项目路径**：`E:\Python\pyCharmProjects\ai-simultaneous-interpreter`

---

## 比赛提交规则（强制遵守）

### 1. 仓库规则

- 仓库必须在**6月5日之后创建**
- 6月7日 23:59 前可设为私有，6月8日 00:00 起必须公开
- 保留**完整开发过程痕迹**，禁止最后一天突击提交
- 所有 commit 时间戳必须在 6月5日 00:00 – 6月7日 23:59 之内

### 2. PR 提交规范（每个 PR 必须遵守）

每个 PR **只做一件事**，且必须包含以下 4 项描述：

```
标题：一句话说明新增/修改了什么

功能描述：该功能的作用与使用方式

实现思路：技术选型或核心实现逻辑

测试方式：如何验证该功能正常运行
```

- PR 粒度尽可能小、尽可能细
- 大功能拆分为多个独立 PR 分步提交
- PR 描述不能为空或与实际变更严重不符
- **PR 合并后主分支必须保持可运行状态**

### 3. Demo 视频要求

- 必须有**声音讲解**
- 覆盖核心模块和功能效果
- 上传到 bilibili 或云盘等外部平台
- 视频链接放到 README.md 中

### 4. README 必须包含

- 项目介绍
- 如何运行（启动命令）
- 依赖列表（第三方库 + 框架，列明哪些是原创功能）
- 架构设计说明
- Demo 视频链接

### 5. 学术诚信

- 代码重复率不能超过 50%
- 复用自己过去的代码必须在 PR 描述中注明来源
- 引用第三方库/框架必须在 README 中列明并说明原创部分
- 严禁抄袭

---

## 代码规范

### Python 代码风格

- 遵循 PEP 8
- 使用类型注解（type hints）
- 所有公开函数必须有 docstring
- 函数不超过 50 行
- 文件不超过 400 行

### 命名规范

| 类型 | 风格 | 示例 |
|------|------|------|
| 文件名 | snake_case | `translator.py` |
| 函数名 | snake_case | `translate_text()` |
| 类名 | PascalCase | `TranslationService` |
| 常量 | UPPER_SNAKE | `MAX_RETRIES` |
| 变量 | snake_case | `target_language` |

### 前端代码风格

- JavaScript 使用 ES6+ 语法
- CSS 类名使用 kebab-case（如 `.subtitle-container`）
- JS 变量使用 camelCase（如 `wsConnection`）
- 常量使用 UPPER_SNAKE_CASE（如 `WS_URL`）

---

## 架构约束

### 模块职责

```
main.py          → FastAPI 入口、路由、WebSocket 端点
translator.py    → 翻译服务（调七牛云 LLM）
corrector.py     → 自动纠错逻辑
config.py        → 配置管理（API Key、模型选择等）
static/          → 前端静态文件
```

### 不变性

- API Key 绝不暴露到前端代码或 git 仓库
- 使用 `.env` 管理 API Key，`.env` 加入 `.gitignore`
- 主分支任何时间点必须可运行
- 不在 PR 中提交 `.env` 文件

### 错误处理

- 所有外部 API 调用必须有 try/except
- WebSocket 断连后前端自动重连
- LLM API 超时/失败时返回友好错误信息给前端
- 不允许静默吞掉错误

---

## Git 工作流

### 分支策略

- `main` 分支：主分支，始终保持可运行
- 每个功能从 main 拉新分支：`feature/pr1-init`、`feature/pr2-asr` 等
- 功能完成后提 PR 合并回 main

### Commit Message 格式

```
<type>: <description>
```

类型：feat, fix, refactor, docs, style, test, chore

### PR 分支命名

| PR | 分支名 |
|----|--------|
| PR1 | `feature/pr1-project-init` |
| PR2 | `feature/pr2-asr-subtitle` |
| PR3 | `feature/pr3-translation` |
| PR4 | `feature/pr4-auto-correct` |
| PR5 | `feature/pr5-ui-polish` |
| PR6 | `feature/pr6-docs-demo` |

---

## 七牛云 API 使用

- Base URL：`https://api.qiniu.com/v1/ai`（或官方文档指定的地址）
- 接口格式：兼容 OpenAI SDK
- 模型选择：DeepSeek-V3 或 Qwen2.5-Max
- API Key 管理：环境变量 `QINIU_API_KEY`
- 流式输出：使用 `stream=True` 减少延迟

---

## 文件模板

### 新建 Python 文件模板

```python
"""
模块名称 - 一句话描述
"""

from typing import Optional


def example_function(param: str) -> Optional[str]:
    """函数描述

    Args:
        param: 参数描述

    Returns:
        返回值描述
    """
    pass
```

### PR 描述模板

```markdown
## 标题
<一句话说明>

## 功能描述
<该功能的作用与使用方式>

## 实现思路
<技术选型或核心实现逻辑>

## 测试方式
<如何验证该功能正常运行>
```
