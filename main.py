"""
AI 同声传译助手 - FastAPI 服务入口
"""

from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import config

app = FastAPI(title="AI 同声传译助手", version="0.1.0")

# 静态文件目录
static_dir = Path(__file__).parent / "static"


@app.get("/")
async def root() -> FileResponse:
    """返回主页"""
    return FileResponse(static_dir / "index.html")


@app.websocket("/ws/translate")
async def websocket_translate(websocket: WebSocket) -> None:
    """
    翻译 WebSocket 端点
    接收前端识别的英文文字，返回中文翻译
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # TODO: 接入七牛云 LLM 翻译（PR3）
            await websocket.send_text(f"[翻译] {data}")
    except WebSocketDisconnect:
        pass


# 挂载静态文件（必须在路由注册之后）
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
