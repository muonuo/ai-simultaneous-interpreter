"""
AI 同声传译助手 - FastAPI 服务入口
"""

from pathlib import Path
import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from config import config
from translator import translate_text, add_to_history, get_recent_history
from translator_live import get_translator

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

    try:
        while True:
            raw = await websocket.receive()

            if "text" in raw:
                msg_data = raw["text"]
                try:
                    msg = json.loads(msg_data)
                except json.JSONDecodeError:
                    continue

                # 音频消息（base64 PCM）
                if "audio" in msg:
                    import base64
                    try:
                        pcm_bytes = base64.b64decode(msg["audio"])
                        translator = get_translator()
                        translator.send_audio(pcm_bytes)
                    except Exception as e:
                        print(f"[audio] decode error: {e}")

                    # 检查翻译结果
                    results = translator.get_translations()
                    for r in results:
                        if isinstance(r, tuple):
                            _, en_text = r
                            await websocket.send_text(json.dumps({
                                "en_text": en_text, "zh_text": "", "type": "final",
                            }, ensure_ascii=False))
                        else:
                            await websocket.send_text(json.dumps({
                                "en_text": "", "zh_text": r, "type": "final",
                            }, ensure_ascii=False))
                    continue

                # 文本翻译消息
                text = msg.get("text", "").strip()
                if not text:
                    continue
                msg_type = msg.get("type", "final")
                target_lang = msg.get("target_lang", "zh")

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
