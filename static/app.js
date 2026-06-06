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
    sourceLang: "en",
    _audioCtx: null,
    _processor: null,
    _stream: null,
};

// ============================================================
// DOM
// ============================================================
const D = {
    topbar:       document.getElementById('topbar'),
    startBtn:     document.getElementById('start-btn'),
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
const FADE_AFTER_MS = 8000;   // 8秒无活动 → 隐藏
const MAX_LEN       = 100;    // 单句最大长度
const MAX_LINES     = 2;      // 最多显示2行
const MAX_HISTORY   = 100;    // 最多保存100条历史

let fadeTimer = null;
let currentEn = '';  // 当前英文句子
let currentZh = '';  // 当前中文句子
let sessionEn = [];  // 整个会话的英文句子
let sessionZh = [];  // 整个会话的中文句子

function handleDelta(enText, zhText, type) {
    D.overlay.classList.add('visible');
    resetTimers();

    // 更新当前句子
    if (enText) currentEn = enText;
    if (zhText) currentZh = zhText;

    // 显示中文（取最后2句）
    const display = getRecentSentences(zhText || currentZh);
    D.subTarget.textContent = display;

    if (type === 'interim') {
        D.subTarget.classList.add('interim');
    } else {
        D.subTarget.classList.remove('interim');
        if (type === 'corrected') {
            D.overlay.classList.add('corrected');
            setTimeout(() => D.overlay.classList.remove('corrected'), 500);
        }
        // final 时累积到会话记录
        if (type === 'final' && currentZh) {
            if (sessionZh.length === 0 || sessionZh[sessionZh.length - 1] !== currentZh) {
                sessionEn.push(currentEn);
                sessionZh.push(currentZh);
            }
        }
    }

    // 每次都更新实时转录（包括 interim），实现流式效果
    renderLiveTranscript();
}

// 取最后2句话，限制总长度
function getRecentSentences(text) {
    if (!text) return '';
    // 按句号分割
    const parts = text.split(/[。！？!?\n]+/).filter(s => s.trim());

    // 取最后2句
    const recent = parts.slice(-MAX_LINES);
    let result = recent.join('。');

    // 限制总长度
    if (result.length > MAX_LEN * MAX_LINES) {
        result = '...' + result.slice(-(MAX_LEN * MAX_LINES));
    }

    return result;
}

function resetTimers() {
    if (fadeTimer) clearTimeout(fadeTimer);
    // 8秒无活动 → 隐藏字幕
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
    sessionEn = [];
    sessionZh = [];
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
    if (history.length > 0 && history[0].zh === zh) return;

    history.unshift({
        en: en || '',
        zh: zh,
        time: Date.now(),
    });
    if (history.length > MAX_HISTORY) history.pop();
    localStorage.setItem('simulcast_history', JSON.stringify(history));
}

function clearHistory() {
    localStorage.removeItem('simulcast_history');
    renderHistory();
}

// 实时转录：翻译中直接显示 session 累积内容 + 当前正在翻译的句子
function renderLiveTranscript() {
    const list = document.getElementById('history-list');
    if (!list) return;

    if (!S.isTranslating) {
        const existing = list.querySelector('.history-item.live');
        if (existing) existing.remove();
        return;
    }

    // 已确认的句子
    const fullEn = sessionEn.join(' ');
    const fullZh = sessionZh.join('。');

    // 当前正在翻译的句子（interim）- 取最新的
    const pendingEn = currentEn;
    const pendingZh = currentZh;

    // 如果完全没有内容，不显示
    if (!fullEn && !fullZh && !pendingEn && !pendingZh) {
        const existing = list.querySelector('.history-item.live');
        if (existing) existing.remove();
        return;
    }

    // 英文：已确认 + 当前（去重）
    let displayEn = fullEn;
    if (pendingEn && pendingEn !== fullEn) {
        displayEn = fullEn ? fullEn + ' ' + pendingEn : pendingEn;
    }

    // 中文：已确认 + 当前（去重）
    let displayZh = fullZh;
    if (pendingZh && !fullZh.endsWith(pendingZh)) {
        displayZh = fullZh + pendingZh;
    }

    const liveHtml = `
        <div class="history-item live">
            <div class="history-content">
                <div class="h-live-badge">● 翻译中</div>
                ${displayEn ? `<div class="h-en">${escapeHtml(displayEn)}</div>` : ''}
                <div class="h-zh">${escapeHtml(displayZh)}</div>
            </div>
        </div>
    `;

    const existing = list.querySelector('.history-item.live');
    if (existing) {
        existing.outerHTML = liveHtml;
    } else {
        list.insertAdjacentHTML('afterbegin', liveHtml);
    }
}

function renderHistory() {
    const history = getHistory();
    const list = document.getElementById('history-list');

    if (history.length === 0 && !S.isTranslating) {
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

    // 如果正在翻译，叠加实时转录
    renderLiveTranscript();
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
        showToast('请先勾选要导出的历史记录', 'warning');
        return;
    }
    const history = getHistory();
    const selected = Array.from(checks).map(c => history[parseInt(c.dataset.index)]);
    showExportDialog(selected);
}

function showExportDialog(items) {
    const existing = document.querySelector('.export-dialog');
    if (existing) existing.remove();
    const dialog = document.createElement('div');
    dialog.className = 'export-dialog';
    dialog.innerHTML = `
        <div class="export-dialog-backdrop"></div>
        <div class="export-dialog-content">
            <div class="export-dialog-header">
                <span>选择导出格式</span>
                <button class="export-dialog-close">&times;</button>
            </div>
            <div class="export-format-options">
                <button class="export-format-btn" data-format="pdf">
                    <span class="export-format-icon">📄</span>
                    <span class="export-format-label">PDF</span>
                    <span class="export-format-desc">适合打印和分享</span>
                </button>
                <button class="export-format-btn" data-format="word">
                    <span class="export-format-icon">📝</span>
                    <span class="export-format-label">Word</span>
                    <span class="export-format-desc">可编辑文档</span>
                </button>
                <button class="export-format-btn" data-format="txt">
                    <span class="export-format-icon">📋</span>
                    <span class="export-format-label">TXT</span>
                    <span class="export-format-desc">纯文本格式</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    requestAnimationFrame(() => dialog.classList.add('show'));

    dialog.querySelector('.export-dialog-close').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.export-dialog-backdrop').addEventListener('click', () => dialog.remove());
    dialog.querySelectorAll('.export-format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const format = btn.dataset.format;
            dialog.remove();
            switch(format) {
                case 'pdf': exportAsPdf(items); break;
                case 'word': exportAsWord(items); break;
                case 'txt': exportAsTxt(items); break;
            }
        });
    });
}

function getExportHtml(selected) {
    return `
        <h1 style="text-align:center;font-size:24px;font-weight:700;color:#2563eb;margin:0 0 8px;">SimulCast 翻译记录</h1>
        <p style="text-align:center;font-size:13px;color:#999;margin-bottom:30px;">导出时间：${new Date().toLocaleString('zh-CN')}</p>
        ${selected.map((item, i) => `
            <div style="margin-bottom:20px;padding:16px;border:1px solid #e0e0e0;border-radius:8px;">
                <p style="font-size:12px;color:#999;margin-bottom:8px;">[${i + 1}] ${formatTime(item.time)}</p>
                ${item.en ? `<p style="font-size:14px;color:#666;line-height:1.8;margin-bottom:6px;">${escapeHtml(item.en)}</p>` : ''}
                <p style="font-size:16px;color:#1a1a2e;line-height:1.8;font-weight:500;">${escapeHtml(item.zh)}</p>
            </div>
        `).join('')}
    `;
}

function exportAsPdf(selected) {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;padding:40px;background:white;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;color:#333;';
    container.innerHTML = getExportHtml(selected);
    document.body.appendChild(container);
    html2canvas(container, { scale: 2, useCORS: true }).then(canvas => {
        document.body.removeChild(container);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        let heightLeft = pdfHeight;
        let position = 0;
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
        while (heightLeft > 0) {
            position = heightLeft - pdfHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pdf.internal.pageSize.getHeight();
        }
        pdf.save(`simulcast_${new Date().toISOString().slice(0, 10)}.pdf`);
    });
}

function exportAsWord(selected) {
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>SimulCast</title>
<style>
body{font-family:"Microsoft YaHei",sans-serif;color:#333;padding:40px;}
h1{font-size:24px;font-weight:700;color:#2563eb;text-align:center;margin:0 0 8px;}
.meta{font-size:13px;color:#999;text-align:center;margin-bottom:30px;}
.record{margin-bottom:20px;padding:16px;border:1px solid #e0e0e0;border-radius:8px;}
.time{font-size:12px;color:#999;margin-bottom:8px;}
.en{font-size:14px;color:#666;line-height:1.8;margin-bottom:6px;}
.zh{font-size:16px;color:#1a1a2e;line-height:1.8;font-weight:500;}
</style></head><body>
<h1>SimulCast 翻译记录</h1>
<p class="meta">导出时间：${new Date().toLocaleString('zh-CN')}</p>
${selected.map((item, i) => `
<div class="record">
    <p class="time">[${i + 1}] ${formatTime(item.time)}</p>
    ${item.en ? `<p class="en">${escapeHtml(item.en)}</p>` : ''}
    <p class="zh">${escapeHtml(item.zh)}</p>
</div>`).join('')}
</body></html>`;
    const blob = new Blob(['﻿' + html], { type: 'application/msword' });
    downloadBlob(blob, `simulcast_${new Date().toISOString().slice(0, 10)}.doc`);
}

function exportAsTxt(selected) {
    let text = 'SimulCast 翻译记录\n';
    text += '导出时间：' + new Date().toLocaleString('zh-CN') + '\n';
    text += '═'.repeat(40) + '\n\n';
    selected.forEach((item, i) => {
        text += `[${i + 1}] ${formatTime(item.time)}\n`;
        if (item.en) text += `EN: ${item.en}\n`;
        text += `ZH: ${item.zh}\n`;
        text += '\n' + '─'.repeat(30) + '\n\n';
    });
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `simulcast_${new Date().toISOString().slice(0, 10)}.txt`);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
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
        renderLiveTranscript();
    }
}

// ============================================================
// WebSocket
// ============================================================
function connectWS() {
    return new Promise((resolve, reject) => {
        if (S.ws && S.ws.readyState === WebSocket.OPEN) { resolve(S.ws); return; }
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const lang = S.sourceLang || "en";
        S.ws = new WebSocket(`${proto}://${location.host}/ws/translate?source_lang=${lang}`);
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
        D.topbar.classList.add('active');
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
    D.topbar.classList.remove('active');
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
    // 保存会话为历史记录（包括当前正在翻译的句子）
    const enToSave = sessionEn.join(' ') || currentEn;
    const zhToSave = sessionZh.join('。') || currentZh;
    if (zhToSave) {
        saveToHistory(enToSave, zhToSave);
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

    renderHistory();
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
// 中央开始按钮
D.startBtn.addEventListener('click', () => {
    startTranslation();
});

// 顶栏停止按钮（翻译中才显示）
D.ctrlBtn.addEventListener('click', () => {
    if (S.isTranslating) stopTranslation();
});

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        S.isTranslating ? stopTranslation() : startTranslation();
    }
});

window.addEventListener('beforeunload', () => {
    if (S.isTranslating) stopTranslation();
});

// 语言选择
const sourceLangSelect = document.getElementById('source-lang');
if (sourceLangSelect) {
    sourceLangSelect.addEventListener('change', (e) => {
        S.sourceLang = e.target.value;
    });
}

// ============================================================
// 背景动画 —— 音波 + 粒子
// ============================================================
(function initBackgroundAnimations() {
    // ---- 音波动画 ----
    const waveCanvas = document.getElementById('wave-canvas');
    if (waveCanvas) {
        const ctx = waveCanvas.getContext('2d');
        let w, h;
        const waves = [
            { amp: 70, freq: 0.005, speed: 0.01, color: '#4f8fff' },
            { amp: 50, freq: 0.008, speed: 0.015, color: '#7c3aed' },
            { amp: 60, freq: 0.003, speed: 0.007, color: '#06b6d4' },
        ];
        let offset = 0;

        function resizeWave() {
            w = waveCanvas.width = window.innerWidth;
            h = waveCanvas.height = window.innerHeight;
        }
        resizeWave();
        window.addEventListener('resize', resizeWave);

        function drawWave() {
            ctx.clearRect(0, 0, w, h);
            waves.forEach(wave => {
                ctx.beginPath();
                ctx.moveTo(0, h / 2);
                for (let x = 0; x <= w; x += 2) {
                    const y = h / 2 + Math.sin(x * wave.freq + offset * wave.speed) * wave.amp
                            + Math.sin(x * wave.freq * 0.5 + offset * wave.speed * 0.7) * wave.amp * 0.5;
                    ctx.lineTo(x, y);
                }
                ctx.strokeStyle = wave.color;
                ctx.lineWidth = 3;
                ctx.stroke();
            });
            offset++;
            requestAnimationFrame(drawWave);
        }
        drawWave();
    }

    // ---- 粒子动画 ----
    const particleCanvas = document.getElementById('particle-canvas');
    if (particleCanvas) {
        const ctx = particleCanvas.getContext('2d');
        let w, h;
        const particles = [];
        const PARTICLE_COUNT = 60;

        function resizeParticle() {
            w = particleCanvas.width = window.innerWidth;
            h = particleCanvas.height = window.innerHeight;
        }
        resizeParticle();
        window.addEventListener('resize', resizeParticle);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                r: Math.random() * 1.5 + 0.5,
                dx: (Math.random() - 0.5) * 0.3,
                dy: (Math.random() - 0.5) * 0.3,
                opacity: Math.random() * 0.5 + 0.2,
            });
        }

        function drawParticles() {
            ctx.clearRect(0, 0, w, h);
            particles.forEach(p => {
                p.x += p.dx;
                p.y += p.dy;
                if (p.x < 0) p.x = w;
                if (p.x > w) p.x = 0;
                if (p.y < 0) p.y = h;
                if (p.y > h) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(79, 143, 255, ${p.opacity})`;
                ctx.fill();
            });
            requestAnimationFrame(drawParticles);
        }
        drawParticles();
    }
})();

console.log('SimulCast 已就绪 | 视频搬运 + 字幕一体化 + 多语言支持');
