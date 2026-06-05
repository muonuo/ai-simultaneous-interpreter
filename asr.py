"""
语音识别服务 — 将音频流转写为英文文本

流程: webm 音频 → ffmpeg/pydub 转 wav → Groq Whisper 转写
"""

import os
import tempfile
import subprocess
from openai import OpenAI

STT_API_KEY = os.getenv("GROQ_API_KEY", "")
STT_MODEL = os.getenv("STT_MODEL", "whisper-large-v3-turbo")

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=STT_API_KEY,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client


async def transcribe_audio(audio_data: bytes) -> str:
    """将 webm 音频转 wav 后调用 Whisper 转写"""
    if not audio_data or len(audio_data) < 1000:
        return ""

    if not STT_API_KEY:
        return ""

    # 写入临时 webm 文件
    webm_path = ""
    wav_path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_data)
            webm_path = f.name

        # 用 pydub 转 wav（Whisper 需要）
        wav_path = webm_path.replace(".webm", ".wav")
        subprocess.run(
            ["ffmpeg", "-y", "-i", webm_path, "-ar", "16000", "-ac", "1", wav_path],
            capture_output=True, timeout=10,
        )

        if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 100:
            return ""

        # 发给 Groq Whisper
        with open(wav_path, "rb") as af:
            transcript = _get_client().audio.transcriptions.create(
                model=STT_MODEL,
                file=af,
                language="en",
                response_format="text",
                temperature=0,
            )
        result = transcript.strip() if isinstance(transcript, str) else str(transcript).strip()
        return result

    except Exception as e:
        print(f"[asr] {e}")
        return ""
    finally:
        for p in [webm_path, wav_path]:
            if p and os.path.exists(p):
                try: os.unlink(p)
                except: pass
