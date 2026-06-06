"""
AI 同声传译助手 - FastAPI 服务入口

数据流: 浏览器 PCM16 音频 → WebSocket → LiveTranslate → 流式翻译 → 字幕窗口
"""

import base64
from pathlib import Path
import json
import asyncio
from dotenv import load_dotenv

load_dotenv()  # 最先加载 .env，确保所有模块能读到 API Key

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

from translator_live import LiveTranslator

app = FastAPI(title="AI 同声传译助手", version="0.2.0")

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


@app.websocket("/ws/translate")
async def websocket_translate(websocket: WebSocket) -> None:
    source_lang = websocket.query_params.get("source_lang", "en")
    """
    翻译 WebSocket 端点

    接收: {"audio": "<base64_pcm16>"}
    返回: {"en_text": "...", "zh_text": "...", "type": "interim"|"final"|"corrected"}
    """
    await websocket.accept()
    loop = asyncio.get_running_loop()
    last_zh = ""

    # LiveTranslate 回调 — 从 websocket-client 线程安全调度到 asyncio
    def on_result(en_text: str, zh_text: str, msg_type: str = "final"):
        nonlocal last_zh
        actual_type = msg_type

        # 纠错逻辑：如果 final 翻译和上一次不同，标记为 corrected
        if msg_type == "final" and zh_text:
            if last_zh and last_zh != zh_text:
                actual_type = "corrected"
            last_zh = zh_text

        # 线程安全：从 LiveTranslate 线程调度到 asyncio 事件循环
        loop.call_soon_threadsafe(
            asyncio.create_task,
            websocket.send_text(json.dumps({
                "en_text": en_text,
                "zh_text": zh_text,
                "type": actual_type,
            }, ensure_ascii=False))
        )

    # 每个连接创建独立的 LiveTranslator 实例
    translator = LiveTranslator()
    translator.connect(source_lang=source_lang, on_result=on_result)

    try:
        while True:
            raw = await websocket.receive()

            # 客户端断开连接
            if raw.get("type") == "websocket.disconnect":
                break

            if "text" not in raw:
                continue

            try:
                msg = json.loads(raw["text"])
            except json.JSONDecodeError:
                continue

            # 音频消息: base64 PCM16 → 解码 → 发送到 LiveTranslate
            if "audio" in msg:
                audio_bytes = base64.b64decode(msg["audio"])
                translator.send_audio(audio_bytes)

    except WebSocketDisconnect:
        print("[WS] 客户端断开连接")
    except Exception as e:
        print(f"[WS] 错误: {e}")
    finally:
        translator.close()


# 静态文件（不使用 app.mount 避免 WebSocket 路由冲突）
@app.get("/static/{filename:path}")
async def static_files(filename: str):
    """静态文件服务（防止路径遍历）"""
    file_path = (static_dir / filename).resolve()
    # 安全检查：确保文件在 static_dir 内
    if not str(file_path).startswith(str(static_dir.resolve())):
        return JSONResponse({"error": "forbidden"}, status_code=403)
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    return FileResponse(static_dir / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
