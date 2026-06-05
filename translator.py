"""
翻译服务 — 调用七牛云 LLM API 实现英译中实时翻译
"""

import json
from typing import AsyncIterator
from openai import AsyncOpenAI

from config import config

# 七牛云 API 客户端（延迟初始化，避免无 Key 时启动失败）
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    """获取或创建七牛云 API 客户端"""
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=config.QINIU_API_KEY,
            base_url=config.QINIU_BASE_URL,
        )
    return _client

SYSTEM_PROMPT = """你是一个专业的同声传译助手。你的任务是将英文实时翻译成中文。

规则：
1. 只返回中文翻译，不要返回任何解释、注释或英文原文
2. 保持翻译简洁流畅，符合中文表达习惯
3. 如果输入是不完整的句子片段（interim），翻译也保持不完整，等待后续修正
4. 如果输入是完整句子（final），给出准确流畅的完整翻译
5. 保持专业术语的准确性（如技术演讲、学术内容）
6. 如果输入为空或无法识别，返回空字符串"""


async def translate_text(
    text: str,
    msg_type: str = "final",
    target_lang: str = "zh",
    history: list[dict] | None = None,
) -> str:
    """翻译一段英文文本为中文

    Args:
        text: 待翻译的英文文本
        msg_type: 'interim'（中间结果）或 'final'（最终结果）
        target_lang: 目标语言代码
        history: 之前的翻译上下文，用于保持连贯性

    Returns:
        中文翻译结果
    """
    if not text or not text.strip():
        return ""

    # 构建消息
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # 加入翻译历史作为上下文
    if history:
        for h in history[-5:]:  # 最近5条
            messages.append(
                {"role": "user", "content": f"[EN] {h.get('en', '')}"}
            )
            messages.append(
                {"role": "assistant", "content": h.get("zh", "")}
            )

    # 当前翻译请求
    type_hint = "（不完整片段，等待后续修正）" if msg_type == "interim" else "（完整句子，请准确翻译）"
    messages.append(
        {"role": "user", "content": f"{text} {type_hint}"}
    )

    try:
        response = await _get_client().chat.completions.create(
            model=config.TRANSLATION_MODEL,
            messages=messages,
            temperature=0.3,
            max_tokens=200,
            stream=False,
        )
        translation = response.choices[0].message.content or ""
        return translation.strip()
    except Exception as e:
        print(f"[translator] 翻译失败: {e}")
        return f"[翻译错误: {str(e)[:50]}]"


async def translate_stream(
    text: str,
    msg_type: str = "final",
    target_lang: str = "zh",
) -> AsyncIterator[str]:
    """流式翻译——边生成边返回，降低延迟

    Args:
        text: 待翻译的英文文本
        msg_type: 'interim' 或 'final'
        target_lang: 目标语言

    Yields:
        中文翻译片段（每次 yield 一个 token）
    """
    if not text or not text.strip():
        return

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": text},
    ]

    try:
        stream = await _get_client().chat.completions.create(
            model=config.TRANSLATION_MODEL,
            messages=messages,
            temperature=0.3,
            max_tokens=200,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as e:
        print(f"[translator] 流式翻译失败: {e}")
        # 降级到非流式
        result = await translate_text(text, msg_type, target_lang)
        if result:
            yield result


# 全局翻译历史（用于维持上下文连贯性）
_translation_history: list[dict] = []
MAX_HISTORY = 20


def add_to_history(en_text: str, zh_text: str) -> None:
    """记录翻译到历史"""
    _translation_history.append({"en": en_text, "zh": zh_text})
    if len(_translation_history) > MAX_HISTORY:
        _translation_history.pop(0)


def get_recent_history(n: int = 5) -> list[dict]:
    """获取最近的翻译历史"""
    return _translation_history[-n:]
