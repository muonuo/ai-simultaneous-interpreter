"""
阿里云百炼 LiveTranslate — 端到端实时语音翻译
"""

import os, json, threading, queue
import websocket

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-livetranslate-flash-realtime"


class LiveTranslator:
    def __init__(self):
        self.ws: websocket.WebSocketApp | None = None
        self.ready = threading.Event()
        self._thread: threading.Thread | None = None
        self._on_result: callable | None = None  # callback(en_text, zh_text)

    def connect(self, on_result: callable = None):
        self._on_result = on_result
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
        ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["text"],
                "sample_rate": 16000,
                "input_audio_format": "opus",
                "input_audio_transcription": {"language": "en"},
                "translation": {"language": "zh"},
            },
        }))

    def _on_message(self, ws, msg):
        data = json.loads(msg)
        t = data.get("type", "")
        print(f"[LiveTranslate] {t} {json.dumps(data, ensure_ascii=False)[:200]}")

        # 中文翻译
        if t == "response.audio_transcript.done":
            zh = data.get("transcript", "")
            if zh and self._on_result:
                self._on_result("", zh)

        # 英文转录
        elif t == "conversation.item.input_audio_transcription.completed":
            en = data.get("transcript", "")
            if en and self._on_result:
                self._on_result(en, "")

        # 也有可能在其他字段
        elif "transcript" in data:
            txt = data.get("transcript", "")
            if txt and self._on_result and t not in ("session.updated",):
                self._on_result("", txt)

    def _on_error(self, ws, err):
        print(f"[LiveTranslate] WS Error: {err}")

    def send_audio(self, data):
        import base64
        if self.ws and self.ws.sock and self.ws.sock.connected:
            b64 = base64.b64encode(data).decode() if isinstance(data, bytes) else data
            self.ws.send(json.dumps({
                "type": "input_audio_buffer.append",
                "audio": b64,
            }))

    def close(self):
        if self.ws:
            try: self.ws.send(json.dumps({"type": "session.finish"}))
            except: pass
            self.ws.close()


_translator: LiveTranslator | None = None


def get_translator(on_result: callable = None) -> LiveTranslator:
    global _translator
    if _translator is None or _translator.ws is None:
        _translator = LiveTranslator()
        _translator.connect(on_result)
    return _translator
