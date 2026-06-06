/**
 * SimulCast — AI 同声传译助手
 *
 * 核心流程：
 *   用户选择视频标签页 → 视频画面搬到本页 → 字幕叠在视频上
 *   音频 → Web Audio API PCM16 → WebSocket → LiveTranslate → 字幕
 *   字幕可拖拽，旧字幕自动淡出
 */

// ============================================================
// 状态
// ============================================================
const S = {
    isTranslating: false,
    ws: null,
    _audioCtx: null,
    _processor: null,
    _stream: null,
};

// ============================================================
// DOM
// ============================================================
const D = {
    ctrlBtn:      document.getElementById('ctrl-btn'),
    ctrlIcon:     document.getElementById('ctrl-icon'),
    ctrlLabel:    document.getElementById('ctrl-label'),
    brandDot:     document.getElementById('brand-dot'),
    statusDot:    document.getElementById('status-dot'),
    statusText:   document.getElementById('status-text'),
    guide:        document.getElementById('guide'),
    videoStage:   document.getElementById('video-stage'),
    videoPlayer:  document.getElementById('video-player'),
    overlay:      document.getElementById('subtitle-overlay'),
    subSource:    document.getElementById('sub-source'),
    subTarget:    document.getElementById('sub-target'),
};

// ============================================================
// 字幕逻辑
// ============================================================
const FADE_AFTER_MS = 5000;   // 5秒无活动 → 隐藏
const MAX_LEN       = 120;    // 中文字符宽，120个足够
const MAX_HISTORY   = 100;    // 最多保存100条历史

let fadeTimer = null;
let currentEn = '';  // 当前英文句子
let currentZh = '';  // 当前中文句子

function handleDelta(enText, zhText, type) {
    D.overlay.classList.add('visible');
    resetTimers();

    // 更新当前句子
    if (enText) currentEn = enText;
    if (zhText) currentZh = zhText;

    // 显示中文
    const display = getLastSentence(zhText || currentZh);
    D.subTarget.textContent = display;

    if (type === 'interim') {
        D.subTarget.classList.add('interim');
    } else {
        D.subTarget.classList.remove('interim');
        if (type === 'corrected') {
            D.overlay.classList.add('corrected');
            setTimeout(() => D.overlay.classList.remove('corrected'), 500);
        }
        // final 时保存历史记录
        if (type === 'final' && currentZh) {
            saveToHistory(currentEn, currentZh);
        }
    }
}

// 只取最后一句（按句号/问号/感叹号分割）
function getLastSentence(text) {
    if (!text) return '';
    const parts = text.split(/[。！？!?\n]+/).filter(s => s.trim());
    const last = parts.length > 0 ? parts[parts.length - 1].trim() : text.trim();
    if (last.length > MAX_LEN) return '...' + last.slice(last.length - MAX_LEN);
    return last;
}

function resetTimers() {
    if (fadeTimer) clearTimeout(fadeTimer);
    // 5秒无活动 → 隐藏字幕
    fadeTimer = setTimeout(() => {
        D.overlay.classList.remove('visible');
        D.subTarget.textContent = '';
    }, FADE_AFTER_MS);
}

function clearSubtitle() {
    D.subTarget.textContent = '';
    D.overlay.classList.remove('visible');
    if (fadeTimer) clearTimeout(fadeTimer);
    currentEn = '';
    currentZh = '';
}

// ============================================================
// 历史记录
// ============================================================
function getHistory() {
    try {
        return JSON.parse(localStorage.getItem('simulcast_history') || '[]');
    } catch {
        return [];
    }
}

function saveToHistory(en, zh) {
    if (!zh) return;
    const history = getHistory();
    // 避免重复（和上一条相同则跳过）
    if (history.length > 0 && history[0].zh === zh) return;

    history.unshift({
        en: en || '',
        zh: zh,
        time: Date.now(),
    });
    // 限制数量
    if (history.length > MAX_HISTORY) history.pop();
    localStorage.setItem('simulcast_history', JSON.stringify(history));
}

function clearHistory() {
    localStorage.removeItem('simulcast_history');
    renderHistory();
}

function renderHistory() {
    const history = getHistory();
    const panel = document.getElementById('history-panel');
    const list = document.getElementById('history-list');

    if (history.length === 0) {
        list.innerHTML = '<div class="history-empty">暂无翻译记录</div>';
        return;
    }

    list.innerHTML = history.map((item, i) => `
        <div class="history-item" data-index="${i}">
            <input type="checkbox" class="history-check" data-index="${i}">
            <div class="history-content">
                ${item.en ? `<div class="h-en">${escapeHtml(item.en)}</div>` : ''}
                <div class="h-zh">${escapeHtml(item.zh)}</div>
                <div class="h-time">${formatTime(item.time)}</div>
            </div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(ts) {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// 导出选中的历史记录
function exportSelected() {
    const checks = document.querySelectorAll('.history-check:checked');
    if (checks.length === 0) {
        alert('请先选择要导出的记录');
        return;
    }

    const history = getHistory();
    const selected = Array.from(checks).map(c => history[parseInt(c.dataset.index)]);

    // 生成 TXT 内容
    let txt = '=== SimulCast 翻译记录 ===\n\n';
    selected.forEach((item, i) => {
        txt += `[${i + 1}] ${formatTime(item.time)}\n`;
        if (item.en) txt += `EN: ${item.en}\n`;
        txt += `ZH: ${item.zh}\n\n`;
    });

    // 下载
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulcast_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// 全选/取消全选
function toggleSelectAll() {
    const checks = document.querySelectorAll('.history-check');
    const allChecked = Array.from(checks).every(c => c.checked);
    checks.forEach(c => c.checked = !allChecked);
}

// 打开历史面板
function toggleHistory() {
    const panel = document.getElementById('history-panel');
    panel.classList.toggle('visible');
    if (panel.classList.contains('visible')) {
        renderHistory();
    }
}

// ============================================================
// WebSocket
// ============================================================
function connectWS() {
    return new Promise((resolve, reject) => {
        if (S.ws && S.ws.readyState === WebSocket.OPEN) { resolve(S.ws); return; }
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        S.ws = new WebSocket(`${proto}://${location.host}/ws/translate`);
        S.ws.binaryType = 'arraybuffer';

        S.ws.onopen = () => {
            updateStatus('active', '翻译中');
            resolve(S.ws);
        };

        S.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleDelta(data.en_text || '', data.zh_text || '', data.type);
            } catch {
                handleDelta('', event.data, 'final');
            }
        };

        S.ws.onclose = () => {
            updateStatus('', '连接断开');
            if (S.isTranslating) {
                updateStatus('', '重连中...');
                setTimeout(() => connectWS(), 2000);
            }
        };

        S.ws.onerror = () => {
            updateStatus('error', '连接错误');
            reject(new Error('WebSocket 连接失败'));
        };
    });
}

function disconnectWS() {
    if (S.ws) { S.ws.close(); S.ws = null; }
}

// ============================================================
// 音频 + 视频捕获
// ============================================================
async function startCapture() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
            stream.getTracks().forEach(t => t.stop());
            throw new Error('未检测到音频轨道，请选择有音频的标签页');
        }

        audioTrack.addEventListener('ended', () => {
            if (S.isTranslating) stopTranslation();
        });

        // 显示视频画面（静音）
        D.videoPlayer.srcObject = stream;
        D.videoPlayer.muted = true;
        D.videoStage.classList.add('visible');
        D.guide.classList.add('hidden');
        S._stream = stream;

        // 音频处理：PCM16 → WebSocket
        const audioStream = new MediaStream([audioTrack]);
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        const source = audioCtx.createMediaStreamSource(audioStream);
        const processor = audioCtx.createScriptProcessor(1024, 1, 1);

        processor.onaudioprocess = (e) => {
            if (!S.ws || S.ws.readyState !== WebSocket.OPEN) return;
            const float32 = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
                const s = Math.max(-1, Math.min(1, float32[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            const bytes = new Uint8Array(int16.buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            S.ws.send(JSON.stringify({ audio: btoa(binary) }));
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        S._audioCtx = audioCtx;
        S._processor = processor;

        return true;
    } catch (err) {
        if (err.name === 'AbortError') return false;
        alert('捕获失败: ' + err.message);
        return false;
    }
}

function stopCapture() {
    if (S._processor) { S._processor.disconnect(); S._processor = null; }
    if (S._audioCtx) { S._audioCtx.close(); S._audioCtx = null; }
    if (S._stream) {
        S._stream.getTracks().forEach(t => t.stop());
        S._stream = null;
    }
    D.videoPlayer.srcObject = null;
    D.videoStage.classList.remove('visible');
    D.guide.classList.remove('hidden');
}

// ============================================================
// 翻译控制
// ============================================================
async function startTranslation() {
    try { await connectWS(); }
    catch { return; }

    const ok = await startCapture();
    if (!ok) { disconnectWS(); return; }

    D.subTarget.setAttribute('data-state', 'connecting');
    D.overlay.classList.add('visible');

    S.isTranslating = true;
    D.ctrlBtn.classList.add('recording');
    D.ctrlIcon.textContent = '■';
    D.ctrlLabel.textContent = '停止';
    D.brandDot.classList.add('active');
}

function stopTranslation() {
    // 停止前保存当前句子到历史记录
    if (currentZh) {
        saveToHistory(currentEn, currentZh);
    }

    S.isTranslating = false;
    stopCapture();
    disconnectWS();
    clearSubtitle();

    D.ctrlBtn.classList.remove('recording');
    D.ctrlIcon.textContent = '▶';
    D.ctrlLabel.textContent = '开始翻译';
    D.brandDot.classList.remove('active');
    updateStatus('', '就绪');
}

// ============================================================
// UI 辅助
// ============================================================
function updateStatus(dotClass, text) {
    D.statusDot.className = 'status-dot' + (dotClass ? ' ' + dotClass : '');
    D.statusText.textContent = text;
}

// ============================================================
// 事件绑定
// ============================================================
D.ctrlBtn.addEventListener('click', () => {
    S.isTranslating ? stopTranslation() : startTranslation();
});

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); D.ctrlBtn.click(); }
});

window.addEventListener('beforeunload', () => {
    if (S.isTranslating) stopTranslation();
});

console.log('SimulCast 已就绪 | 视频搬运 + 字幕一体化 + 可拖拽');
