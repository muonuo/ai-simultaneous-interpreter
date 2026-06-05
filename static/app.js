/**
 * SimulCast — AI 同声传译助手
 *
 * 核心流程：
 *   标签页音频捕获 → MediaRecorder 编码
 *   → WebSocket 发送音频 → 后端 STT 转写
 *   → 七牛云 LLM 翻译 → BroadcastChannel 广播
 *   → 画中画字幕窗口显示
 */

// ============================================================
// 状态
// ============================================================
const S = {
    isTranslating: false,
    isPaused: false,
    ws: null,
    pipWindow: null,
    mediaRecorder: null,
    broadcastSettings: new BroadcastChannel('simulcast-settings'),
    broadcastTranslate: new BroadcastChannel('simulcast-translate'),
    settings: { fontSize: 'medium', mode: 'bottom', targetLang: 'zh' },
};

// ============================================================
// DOM
// ============================================================
const D = {
    mainBtn: document.getElementById('main-btn'),
    mainBtnIcon: document.querySelector('.main-btn-icon'),
    mainBtnText: document.querySelector('.main-btn-text'),
    statusCard: document.getElementById('status-card'),
    statusTitle: document.getElementById('status-title'),
    statusDesc: document.getElementById('status-desc'),
    hint: document.getElementById('hint'),
    infoDot: document.getElementById('info-dot'),
    infoText: document.getElementById('info-text'),
    fontGroup: document.getElementById('font-group'),
    modeGroup: document.getElementById('mode-group'),
    langSelect: document.getElementById('lang-select'),
    fileInput: document.getElementById('file-input'),
};

// ============================================================
// 画中画窗口管理
// ============================================================
async function openPipWindow() {
    if (S.pipWindow && !S.pipWindow.closed) { S.pipWindow.focus(); return true; }
    const pipUrl = `${location.origin}/pip`;

    // 方案1: Document Picture-in-Picture
    if (documentPictureInPicture && documentPictureInPicture.requestWindow) {
        try {
            S.pipWindow = await documentPictureInPicture.requestWindow({ width: 640, height: 180 });
            S.pipWindow.document.body.style.margin = '0';
            S.pipWindow.document.body.style.overflow = 'hidden';
            S.pipWindow.document.body.innerHTML = `<iframe src="${pipUrl}" style="width:100vw;height:100vh;border:none;"></iframe>`;
            S.pipWindow.addEventListener('pagehide', () => { S.pipWindow = null; });
            S.broadcastSettings.postMessage(S.settings);
            updateUI('pip');
            return true;
        } catch (err) { console.warn('Document PiP 失败:', err.message); }
    }

    // 方案2: window.open
    try {
        S.pipWindow = window.open(pipUrl, 'subtitles', `width=680,height=200,top=${screen.height - 280}`);
        if (S.pipWindow) {
            S.pipWindow.addEventListener('beforeunload', () => { S.pipWindow = null; });
            updateUI('pip');
            return true;
        }
    } catch (err) { console.warn('弹窗被拦截:', err.message); }

    // 方案3: 内联字幕
    const inline = document.getElementById('inline-subtitles');
    if (inline) inline.style.display = 'block';
    updateUI('inline');
    return true;
}

function closePipWindow() {
    if (S.pipWindow && !S.pipWindow.closed) S.pipWindow.close();
    S.pipWindow = null;
    const inline = document.getElementById('inline-subtitles');
    if (inline) inline.style.display = 'none';
}

// ============================================================
// WebSocket
// ============================================================
function connectWS() {
    return new Promise((resolve, reject) => {
        if (S.ws && S.ws.readyState === WebSocket.OPEN) { resolve(S.ws); return; }
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        S.ws = new WebSocket(`${proto}://${location.host}/ws/translate`);
        // 设置为二进制优先
        S.ws.binaryType = 'arraybuffer';

        S.ws.onopen = () => {
            D.infoDot.classList.add('active');
            D.infoText.textContent = '翻译中';
            resolve(S.ws);
        };

        S.ws.onmessage = (event) => {
            // 接收 JSON 文本 → 广播到字幕窗口
            try {
                const data = JSON.parse(event.data);
                S.broadcastTranslate.postMessage(data);
            } catch {
                S.broadcastTranslate.postMessage({ zh_text: event.data, type: 'final' });
            }
        };

        S.ws.onclose = () => {
            D.infoDot.classList.remove('active');
            if (S.isTranslating && !S.isPaused) {
                D.infoText.textContent = '重连中...';
                setTimeout(() => connectWS(), 2000);
            }
        };

        S.ws.onerror = () => {
            D.infoDot.classList.add('error');
            D.infoText.textContent = '连接错误';
            reject(new Error('WebSocket 连接失败'));
        };
    });
}

function disconnectWS() {
    if (S.ws) { S.ws.close(); S.ws = null; }
    D.infoDot.classList.remove('active', 'error');
    D.infoText.textContent = '就绪';
}

// ============================================================
// 音频捕获 + MediaRecorder → WebSocket
// ============================================================
async function startAudioCapture() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        stream.getVideoTracks().forEach(t => t.stop());

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) throw new Error('未检测到音频轨道');

        const audioStream = new MediaStream([audioTrack]);

        // MediaRecorder 编码音频 → 发 WebSocket 到后端 STT
        let mimeType = '';
        for (const mt of ['audio/webm;codecs=opus', 'audio/webm']) {
            if (MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
        }
        S.mediaRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : {});

        S.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && S.ws && S.ws.readyState === WebSocket.OPEN) {
                S.ws.send(event.data);
            }
        };

        // 每3秒发一次音频块（平衡延迟和识别准确率）
        S.mediaRecorder.start(3000);

        audioTrack.addEventListener('ended', () => {
            if (S.isTranslating) stopTranslation();
        });

        return audioStream;
    } catch (err) {
        if (err.name === 'AbortError') return null;
        console.error('音频捕获失败:', err);
        alert('音频捕获失败: ' + err.message);
        return null;
    }
}

function stopMediaRecorder() {
    if (S.mediaRecorder && S.mediaRecorder.state !== 'inactive') {
        S.mediaRecorder.stop();
        S.mediaRecorder = null;
    }
}

// ============================================================
// 本地文件模式
// ============================================================
async function startFileMode(file) {
    const url = URL.createObjectURL(file);
    const isAudio = file.type.startsWith('audio/');
    const media = document.createElement(isAudio ? 'audio' : 'video');
    media.src = url; media.controls = false; media.muted = false;
    media.style.display = 'none';
    document.body.appendChild(media);
    await media.play();

    const stream = media.captureStream ? media.captureStream() : media.mozCaptureStream ? media.mozCaptureStream() : null;
    if (!stream) { alert('无法从文件中捕获音频流'); return; }

    S.mediaRecorder = new MediaRecorder(stream);
    S.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && S.ws && S.ws.readyState === WebSocket.OPEN) {
            S.ws.send(event.data);
        }
    };
    S.mediaRecorder.start(3000);

    media.addEventListener('ended', () => { if (S.isTranslating) stopTranslation(); });
    return stream;
}

// ============================================================
// 翻译控制
// ============================================================
async function startTranslation() {
    const pipOk = await openPipWindow();
    if (!pipOk) return;

    try { await connectWS(); }
    catch { closePipWindow(); return; }

    const stream = await startAudioCapture();
    if (!stream) { disconnectWS(); closePipWindow(); return; }

    S.isTranslating = true; S.isPaused = false;
    updateUI('translating');
}

function stopTranslation() {
    S.isTranslating = false; S.isPaused = false;
    stopMediaRecorder();
    disconnectWS();
    closePipWindow();
    updateUI('ready');
}

// ============================================================
// UI 更新
// ============================================================
function updateUI(state) {
    if (state === 'ready') {
        D.mainBtn.classList.remove('translating');
        D.mainBtnIcon.innerHTML = '&#9654;';
        D.mainBtnText.textContent = '开始翻译';
        D.statusCard.classList.remove('translating');
        D.statusTitle.textContent = '准备开始';
        D.statusDesc.textContent = '在任何网站观看英文视频时，打开本页面并点击下方按钮。选择视频所在的浏览器标签页，实时字幕将以浮动窗口形式显示在屏幕上方。';
        D.hint.textContent = '选择正在播放视频的浏览器标签页';
        D.hint.classList.remove('active');
        D.infoDot.classList.remove('active', 'error');
        D.infoText.textContent = '就绪';
    } else if (state === 'pip') {
        D.statusCard.classList.add('translating');
        D.statusTitle.textContent = '字幕窗口已打开';
        D.hint.classList.add('active');
    } else if (state === 'inline') {
        D.statusCard.classList.add('translating');
        D.statusTitle.textContent = '字幕窗口已打开（内联模式）';
    } else if (state === 'translating') {
        D.mainBtn.classList.add('translating');
        D.mainBtnIcon.innerHTML = '&#9632;';
        D.mainBtnText.textContent = '停止';
        D.statusCard.classList.add('translating');
        D.statusTitle.textContent = '翻译中';
        D.statusDesc.textContent = '正在实时捕获音频并翻译。字幕在浮动窗口中显示。';
        D.hint.textContent = '● 翻译进行中...';
        D.hint.classList.add('active');
        D.infoDot.classList.add('active');
        D.infoText.textContent = '翻译中';
    }
}

// ============================================================
// 事件绑定
// ============================================================
D.mainBtn.addEventListener('click', () => {
    S.isTranslating ? stopTranslation() : startTranslation();
});

D.fontGroup.addEventListener('click', (e) => {
    if (!e.target.classList.contains('toggle-btn')) return;
    D.fontGroup.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    S.settings.fontSize = e.target.dataset.font;
    S.broadcastSettings.postMessage({ fontSize: S.settings.fontSize });
});

D.modeGroup.addEventListener('click', (e) => {
    if (!e.target.classList.contains('toggle-btn')) return;
    D.modeGroup.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    S.settings.mode = e.target.dataset.mode;
    S.broadcastSettings.postMessage({ mode: S.settings.mode });
});

D.langSelect.addEventListener('change', () => {
    S.settings.targetLang = D.langSelect.value;
});

D.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const pipOk = await openPipWindow();
    if (!pipOk) return;
    try { await connectWS(); } catch { closePipWindow(); return; }
    const stream = await startFileMode(file);
    if (!stream) { disconnectWS(); closePipWindow(); return; }
    S.isTranslating = true;
    updateUI('translating');
});

// 监听翻译消息同步到内联字幕
S.broadcastTranslate.addEventListener('message', (e) => {
    const { en_text, zh_text, type } = e.data;
    const inlineEn = document.getElementById('inline-en');
    const inlineZh = document.getElementById('inline-zh');
    if (!inlineEn || !inlineZh) return;
    if (en_text) { inlineEn.textContent = en_text; inlineEn.style.opacity = type === 'interim' ? '0.5' : '1'; }
    if (zh_text) { inlineZh.textContent = zh_text; inlineZh.style.opacity = type === 'interim' ? '0.5' : '1'; }
});

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); D.mainBtn.click(); }
});

window.addEventListener('beforeunload', () => {
    if (S.isTranslating) stopTranslation();
    S.broadcastSettings.close();
    S.broadcastTranslate.close();
});

console.log('SimulCast 控制面板已就绪 | 音频→后端STT→翻译→字幕');
