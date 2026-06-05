"""
AI 同声传译助手 - FastAPI 服务入口
"""

from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from config import config

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


@app.websocket("/ws/translate")
async def websocket_translate(websocket: WebSocket) -> None:
    """
    翻译 WebSocket 端点
    接收前端识别的英文文字，返回中文翻译

    消息格式（接收）:
    {
        "text": "The quick brown fox",
        "type": "final" | "interim",
        "target_lang": "zh"
    }

    消息格式（返回）:
    {
        "en_text": "The quick brown fox",
        "zh_text": "敏捷的棕色狐狸",
        "type": "final" | "interim" | "corrected"
    }
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # TODO: 接入七牛云 LLM 翻译（PR3）
            # 目前 echo 原文，PR3 替换为真实翻译
            import json
            try:
                msg = json.loads(data)
                text = msg.get("text", data)
            except json.JSONDecodeError:
                text = data
            await websocket.send_text(f"[翻译] {text}")
    except WebSocketDisconnect:
        pass


# 静态文件（不使用 app.mount 避免 WebSocket 路由冲突）
@app.get("/static/{filename:path}")
async def static_files(filename: str):
    """静态文件服务"""
    file_path = static_dir / filename
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    return FileResponse(static_dir / "index.html")
