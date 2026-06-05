"""
AI 同声传译助手 - FastAPI 服务入口
"""

from pathlib import Path
import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from config import config
from translator import translate_text, add_to_history, get_recent_history
from asr import AudioBuffer, transcribe_audio

app = FastAPI(title="AI 同声传译助手", version="0.1.0")

# 静态文件目录
static_dir = Path(__file__).parent / "static"


@app.get("/")
async def root() -> FileResponse:
    """返回主页（控制面板）"""
    return FileResponse(static_dir / "index.html")


@app.get("/pip")
async def pip_page() -> FileResponse:
    """返回画中画字幕页面"""
    return FileResponse(static_dir / "pip.html")


@app.get("/test")
async def test_page() -> FileResponse:
    """返回文件上传测试页面"""
    return FileResponse(static_dir / "test.html")
    """返回画中画字幕页面"""
    return FileResponse(static_dir / "pip.html")


# 缓存上一轮的 interim 翻译（用于自动纠错）
_interim_translations: dict[str, str] = {}


@app.websocket("/ws/translate")
async def websocket_translate(websocket: WebSocket) -> None:
    """
    翻译 WebSocket 端点
    支持两种消息类型：
    1. 文本 (JSON): 直接翻译文本
    2. 二进制: 音频数据 → STT 转写 → 翻译

    返回（JSON）:
    {"en_text": "...", "zh_text": "...", "type": "final"|"interim"|"corrected"}
    """
    await websocket.accept()

    audio_buffer = AudioBuffer(min_chunks=1)

    try:
        while True:
            # 接收文本或二进制消息
            try:
                raw = await websocket.receive()
            except WebSocketDisconnect:
                break

            if "text" in raw:
                # 文本消息：直接翻译
                text_data = raw["text"]
                try:
                    msg = json.loads(text_data)
                    text = msg.get("text", text_data).strip()
                    msg_type = msg.get("type", "final")
                    target_lang = msg.get("target_lang", "zh")
                except json.JSONDecodeError:
                    text = text_data.strip()
                    msg_type = "final"
                    target_lang = "zh"

                if not text:
                    continue

            elif "bytes" in raw:
                # 二进制消息：音频数据
                audio_chunk = raw["bytes"]
                audio_buffer.add(audio_chunk)

                if not audio_buffer.should_transcribe():
                    continue

                # 转写音频
                audio_data = audio_buffer.get_audio()
                audio_buffer.clear()
                text = await transcribe_audio(audio_data)

                if not text:
                    continue

                msg_type = "final"
                target_lang = "zh"
            else:
                continue

            # 调用七牛云 LLM 翻译
            history = get_recent_history()
            zh_text = await translate_text(
                text, msg_type=msg_type, target_lang=target_lang,
                history=history,
            )

            # 自动纠错
            out_type = msg_type
            if msg_type == "final":
                prev = _interim_translations.pop(text[:60], None)
                if prev and prev != zh_text:
                    out_type = "corrected"

            # 发送结果
            await websocket.send_text(json.dumps({
                "en_text": text,
                "zh_text": zh_text,
                "type": out_type,
            }, ensure_ascii=False))

            # 记录历史
            if msg_type == "final" and zh_text:
                add_to_history(text, zh_text)

    except WebSocketDisconnect:
        pass
    finally:
        _interim_translations.clear()


# 静态文件（不使用 app.mount 避免 WebSocket 路由冲突）
@app.get("/static/{filename:path}")
async def static_files(filename: str):
    """静态文件服务"""
    file_path = static_dir / filename
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    return FileResponse(static_dir / "index.html")
