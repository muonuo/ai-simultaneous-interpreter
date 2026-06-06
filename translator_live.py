"""
阿里云百炼 LiveTranslate — 端到端实时语音翻译

模型: qwen3.5-livetranslate-flash-realtime
协议: WebSocket (wss://dashscope.aliyuncs.com/api-ws/v1/realtime)
音频: PCM 16kHz 16bit mono

流式事件:
  - response.audio_transcript.text   → 流式中文翻译 (text=确认, stash=暂定)
  - response.audio_transcript.done   → 最终中文翻译
  - conversation.item.input_audio_transcription.text       → 流式英文转录
  - conversation.item.input_audio_transcription.completed  → 最终英文转录
"""

import os, json, threading
from dotenv import load_dotenv

load_dotenv()  # 确保 .env 在 import 时就加载
import websocket

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-livetranslate-flash-realtime"


class LiveTranslator:
    def __init__(self):
        self.ws: websocket.WebSocketApp | None = None
        self.ready = threading.Event()
        self._thread: threading.Thread | None = None
        self._on_result: callable | None = None  # callback(en_text, zh_text, msg_type)
        self._source_lang: str = 'en'  # 源语言代码

        # 流式状态追踪
        self._accumulated_zh: str = ""  # 累积的中文翻译 (text + stash)

    def connect(self, source_lang: str = "en", on_result: callable = None):
        """建立 LiveTranslate WebSocket 连接

        Args:
            on_result: 回调函数, 签名 (en_text: str, zh_text: str, msg_type: str)
                       msg_type: "interim" | "final" | "corrected"
        """
        self._on_result = on_result
        self._source_lang = source_lang
        self.ws = websocket.WebSocketApp(
            WS_URL,
            header=["Authorization: Bearer " + DASHSCOPE_API_KEY],
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
        )
        self._thread = threading.Thread(target=self.ws.run_forever, daemon=True)
        self._thread.start()
        self.ready.wait(timeout=15)

    def _on_open(self, ws):
        """连接成功后发送会话配置"""
        ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],   # 需要audio才能触发流式翻译事件
                "input_audio_format": "pcm",
                "input_audio_transcription": {
                    "model": "qwen3-asr-flash-realtime",
                    "language": self._source_lang,
                },
                "translation": {"language": "zh"},
            },
        }))
        self.ready.set()

    def _on_message(self, ws, msg):
        """处理 LiveTranslate 服务端事件"""
        data = json.loads(msg)
        t = data.get("type", "")
        print(f"[LiveTranslate] {t} {json.dumps(data, ensure_ascii=False)[:300]}")

        # ── 流式中文翻译 (text=已确认, stash=暂定会被修正) ──
        if t == "response.audio_transcript.text":
            text = data.get("text", "")
            stash = data.get("stash", "")
            combined = text + stash
            if combined and self._on_result:
                self._accumulated_zh = combined
                self._on_result("", combined, "interim")

        # ── 最终中文翻译 ──
        elif t == "response.audio_transcript.done":
            zh = data.get("transcript", "")
            if zh and self._on_result:
                msg_type = "corrected" if (self._accumulated_zh and self._accumulated_zh != zh) else "final"
                self._accumulated_zh = ""
                self._on_result("", zh, msg_type)

        # ── 兼容：response.content_part.done 也包含中文翻译 ──
        elif t == "response.content_part.done":
            part = data.get("part", {})
            if part.get("type") == "text":
                zh = part.get("text", "")
                if zh and self._on_result:
                    self._on_result("", zh, "final")

        # ── 兼容：response.text.delta 流式中文 ──
        elif t == "response.text.delta":
            delta = data.get("delta", "")
            if delta and self._on_result:
                self._accumulated_zh += delta
                self._on_result("", self._accumulated_zh, "interim")

        # ── 兼容：response.text.done 最终中文 ──
        elif t == "response.text.done":
            text = data.get("text", "")
            if text and self._on_result:
                msg_type = "corrected" if (self._accumulated_zh and self._accumulated_zh != text) else "final"
                self._accumulated_zh = ""
                self._on_result("", text, msg_type)

        # ── 流式英文转录 ──
        elif t == "conversation.item.input_audio_transcription.text":
            text = data.get("text", "")
            stash = data.get("stash", "")
            combined = text + stash
            if combined and self._on_result:
                self._on_result(combined, "", "interim")

        # ── 最终英文转录 ──
        elif t == "conversation.item.input_audio_transcription.completed":
            en = data.get("transcript", "")
            if en and self._on_result:
                self._on_result(en, "", "final")

        # ── 音频输出事件（启用audio模式后会收到，直接忽略）──
        elif t in ("response.audio.delta", "response.audio.done"):
            pass  # 不需要音频输出，只需要文本翻译

        # ── 语音检测事件 ──
        elif t == "input_audio_buffer.speech_started":
            print("[LiveTranslate] 🎤 检测到语音开始")
        elif t == "input_audio_buffer.speech_stopped":
            print("[LiveTranslate] 🔇 检测到语音结束")

    def _on_error(self, ws, err):
        print(f"[LiveTranslate] WS Error: {err}")

    def _on_close(self, ws, close_status, close_msg):
        print(f"[LiveTranslate] 连接关闭: status={close_status} msg={close_msg}")
        # 自动重连（3秒后）
        if self._on_result:
            import time
            time.sleep(3)
            print("[LiveTranslate] 尝试重连...")
            self.ready.clear()
            self.ws = websocket.WebSocketApp(
                WS_URL,
                header=["Authorization: Bearer " + DASHSCOPE_API_KEY],
                on_open=self._on_open,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close,
            )
            self._thread = threading.Thread(target=self.ws.run_forever, daemon=True)
            self._thread.start()
            self.ready.wait(timeout=15)
            print(f"[LiveTranslate] 重连结果: {'成功' if self.ready.is_set() else '超时'}")

    def send_audio(self, data: bytes):
        """发送 PCM16 音频数据到 LiveTranslate

        Args:
            data: 原始 PCM16 字节 (16kHz, 16bit, mono)
        """
        import base64
        if self.ws and self.ws.sock and self.ws.sock.connected:
            b64 = base64.b64encode(data).decode()
            self.ws.send(json.dumps({
                "type": "input_audio_buffer.append",
                "audio": b64,
            }))

    def close(self):
        """关闭连接"""
        if self.ws:
            try:
                self.ws.send(json.dumps({"type": "session.finish"}))
            except Exception:
                pass
            try:
                self.ws.close()
            except Exception:
                pass
            self.ws = None
