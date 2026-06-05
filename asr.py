"""
语音识别服务 — 将音频流转写为英文文本

支持多种后端：
- groq: Groq Whisper（免费、快速，推荐）
- openai: OpenAI Whisper API
- local: 本地模拟（测试用）
"""

import os
import tempfile
import base64
from pathlib import Path
from openai import OpenAI

from config import config

# STT 后端配置
STT_BACKEND = os.getenv("STT_BACKEND", "groq")  # groq | openai | local
STT_API_KEY = os.getenv("STT_API_KEY", "")      # STT 服务 API Key
STT_BASE_URL = os.getenv("STT_BASE_URL", "")     # STT 服务 Base URL
STT_MODEL = os.getenv("STT_MODEL", "whisper-large-v3")  # 模型名


def _get_stt_client() -> OpenAI | None:
    """获取 STT 客户端"""
    if STT_BACKEND == "local":
        return None

    if STT_BACKEND == "groq":
        api_key = STT_API_KEY or os.getenv("GROQ_API_KEY", "")
        base_url = STT_BASE_URL or "https://api.groq.com/openai/v1"
        if not api_key:
            print("[asr] 未配置 GROQ_API_KEY，使用本地模拟模式")
            return None
        return OpenAI(api_key=api_key, base_url=base_url)

    if STT_BACKEND == "openai":
        api_key = STT_API_KEY or os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            print("[asr] 未配置 OPENAI_API_KEY，使用本地模拟模式")
            return None
        return OpenAI(api_key=api_key)

    return None


async def transcribe_audio(audio_data: bytes, mime_type: str = "audio/webm") -> str:
    """将音频数据转写为英文文本

    Args:
        audio_data: 音频字节数据
        mime_type: 音频 MIME 类型

    Returns:
        转写后的英文文本，失败返回空字符串
    """
    if not audio_data:
        return ""

    client = _get_stt_client()

    if client is None:
        # 本地模拟模式（测试用）
        return _local_mock_transcribe()

    # 将音频写入临时文件
    suffix = ".webm" if "webm" in mime_type else ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_data)
        tmp_path = f.name

    try:
        with open(tmp_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model=STT_MODEL,
                file=audio_file,
                language="en",
                response_format="text",
            )
        return transcript.strip() if isinstance(transcript, str) else str(transcript).strip()
    except Exception as e:
        print(f"[asr] 转写失败: {e}")
        return ""
    finally:
        # 清理临时文件
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _local_mock_transcribe() -> str:
    """本地模拟转写（测试用，返回空让翻译模块不处理）"""
    return ""


# 音频缓冲区（累积音频直到足够长度再转写）
class AudioBuffer:
    """音频缓冲区 — 收集音频块，定期转写"""

    def __init__(self, min_chunks: int = 3):
        self.chunks: list[bytes] = []
        self.min_chunks = min_chunks

    def add(self, chunk: bytes) -> None:
        """添加音频块"""
        self.chunks.append(chunk)

    def should_transcribe(self) -> bool:
        """是否应该触发转写"""
        return len(self.chunks) >= self.min_chunks

    def get_audio(self) -> bytes:
        """获取累积的音频数据"""
        return b"".join(self.chunks)

    def clear(self) -> None:
        """清空缓冲区"""
        self.chunks.clear()

    def __len__(self) -> int:
        return len(self.chunks)
