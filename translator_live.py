"""
阿里云百炼 LiveTranslate — 端到端实时语音翻译
文档: https://help.aliyun.com/zh/model-studio/live-translator-client-events
"""

import os, json, threading, queue, time
import websocket

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-livetranslate-flash-realtime"


class LiveTranslator:
    """阿里云 LiveTranslate 客户端"""

    def __init__(self):
        self.ws: websocket.WebSocketApp | None = None
        self.translations: queue.Queue = queue.Queue()
        self.ready = threading.Event()
        self._thread: threading.Thread | None = None

    def connect(self):
        """建立 WebSocket 连接"""
        self.ws = websocket.WebSocketApp(
            WS_URL,
            header=["Authorization: Bearer " + DASHSCOPE_API_KEY],
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
        )
        self._thread = threading.Thread(target=self.ws.run_forever, daemon=True)
        self._thread.start()
        self.ready.wait(timeout=10)

    def _on_open(self, ws):
        # 配置：仅文本输出，opus 音频，英文→中文
        ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["text"],
                "sample_rate": 16000,
                "input_audio_format": "pcm",
                "input_audio_transcription": {"language": "en"},
                "translation": {"language": "zh"},
            },
        }))
        self.ready.set()

    def _on_message(self, ws, msg):
        data = json.loads(msg)
        t = data.get("type", "")

        # 提取翻译文本
        if t == "response.audio_transcript.done":
            transcript = data.get("transcript", "")
            if transcript:
                self.translations.put(transcript)
        elif t == "conversation.item.input_audio_transcription.completed":
            # 源语言转录（英文原文）
            transcript = data.get("transcript", "")
            if transcript:
                self.translations.put(("en", transcript))
        elif t == "error":
            print(f"[LiveTranslate] Error: {data}")

    def _on_error(self, ws, err):
        print(f"[LiveTranslate] WS Error: {err}")

    def send_audio(self, audio_bytes: bytes):
        """发送音频数据"""
        import base64
        if self.ws and self.ws.sock and self.ws.sock.connected:
            b64 = base64.b64encode(audio_bytes).decode()
            self.ws.send(json.dumps({
                "type": "input_audio_buffer.append",
                "audio": b64,
            }))

    def get_translations(self) -> list[str]:
        """获取积累的翻译结果"""
        results = []
        while not self.translations.empty():
            try:
                results.append(self.translations.get_nowait())
            except queue.Empty:
                break
        return results

    def close(self):
        if self.ws:
            try:
                self.ws.send(json.dumps({"type": "session.finish"}))
            except: pass
            self.ws.close()


# 全局实例
_translator: LiveTranslator | None = None


def get_translator() -> LiveTranslator:
    global _translator
    if _translator is None or _translator.ws is None:
        _translator = LiveTranslator()
        _translator.connect()
    return _translator
