/**
 * SimulCast — AI 同声传译助手
 *
 * 核心流程：
 *   标签页音频捕获 → Web Speech API 识别英文
 *   → WebSocket 发后端 → 七牛云 LLM 翻译
 *   → BroadcastChannel 广播 → 画中画字幕窗口显示
 */

// ============================================================
// 状态
// ============================================================
const S = {
    isTranslating: false,
    isPaused: false,
    ws: null,
    recognition: null,
    pipWindow: null,
    broadcastSettings: new BroadcastChannel('simulcast-settings'),
    broadcastTranslate: new BroadcastChannel('simulcast-translate'),
    settings: {
        fontSize: 'medium',
        mode: 'bottom',
        targetLang: 'zh',
    },
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
// 字幕窗口管理（支持多种降级方案）
// ============================================================
async function openPipWindow() {
    if (S.pipWindow && !S.pipWindow.closed) {
        S.pipWindow.focus();
        return true;
    }

    const pipUrl = `${location.origin}/pip`;

    // 方案1: Document Picture-in-Picture（Chrome 116+）
    if (documentPictureInPicture && documentPictureInPicture.requestWindow) {
        try {
            S.pipWindow = await documentPictureInPicture.requestWindow({
                width: 640,
                height: 180,
            });
            S.pipWindow.document.body.style.margin = '0';
            S.pipWindow.document.body.style.overflow = 'hidden';
            S.pipWindow.document.body.innerHTML = `
                <iframe src="${pipUrl}" style="width:100vw;height:100vh;border:none;"></iframe>
            `;
            S.pipWindow.addEventListener('pagehide', () => {
                S.pipWindow = null;
            });
            S.broadcastSettings.postMessage(S.settings);
            updateUI('pip');
            console.log('字幕窗口: Document PiP');
            return true;
        } catch (err) {
            console.warn('Document PiP 失败, 尝试降级方案:', err.message);
        }
    }

    // 方案2: 普通弹窗（可能被拦截）
    try {
        const features = 'width=680,height=200,left=100,top=' + (screen.height - 280);
        S.pipWindow = window.open(pipUrl, 'simulcast-subtitles', features);
        if (S.pipWindow) {
            S.pipWindow.addEventListener('beforeunload', () => { S.pipWindow = null; });
            // 等待窗口加载后发送设置
            S.pipWindow.addEventListener('load', () => {
                S.broadcastSettings.postMessage(S.settings);
            });
            S.broadcastSettings.postMessage(S.settings);
            updateUI('pip');
            console.log('字幕窗口: window.open');
            return true;
        }
    } catch (err) {
        console.warn('弹窗被拦截:', err.message);
    }

    // 方案3: 内联字幕（在主页面显示）
    console.log('字幕窗口: 内联降级模式');
    const inlineSubtitles = document.getElementById('inline-subtitles');
    if (inlineSubtitles) {
        inlineSubtitles.style.display = 'block';
    }
    updateUI('inline');
    return true;
}

function closePipWindow() {
    if (S.pipWindow && !S.pipWindow.closed) {
        S.pipWindow.close();
    }
    S.pipWindow = null;
    // 隐藏内联字幕
    const inline = document.getElementById('inline-subtitles');
    if (inline) inline.style.display = 'none';
}

// 初始化：监听翻译消息，渲染到内联字幕（降级方案）
S.broadcastTranslate.addEventListener('message', (e) => {
    const { en_text, zh_text, type } = e.data;
    const inlineEn = document.getElementById('inline-en');
    const inlineZh = document.getElementById('inline-zh');
    if (!inlineEn || !inlineZh) return;

    if (en_text) {
        inlineEn.textContent = en_text;
        inlineEn.style.fontStyle = type === 'interim' ? 'italic' : 'normal';
        inlineEn.style.opacity = type === 'interim' ? '0.5' : '1';
    }
    if (zh_text) {
        inlineZh.textContent = zh_text;
        inlineZh.style.fontStyle = type === 'interim' ? 'italic' : 'normal';
        inlineZh.style.opacity = type === 'interim' ? '0.5' : '1';
    }
});

// ============================================================
// WebSocket
// ============================================================
function connectWS() {
    return new Promise((resolve, reject) => {
        if (S.ws && S.ws.readyState === WebSocket.OPEN) {
            resolve(S.ws);
            return;
        }

        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${proto}://${location.host}/ws/translate`;
        S.ws = new WebSocket(url);

        S.ws.onopen = () => {
            D.infoDot.classList.add('active');
            D.infoText.textContent = '翻译中';
            resolve(S.ws);
        };

        S.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // 广播到画中画窗口
                S.broadcastTranslate.postMessage(data);
            } catch {
                S.broadcastTranslate.postMessage({
                    zh_text: event.data,
                    type: 'final',
                });
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
    if (S.ws) {
        S.ws.close();
        S.ws = null;
    }
    D.infoDot.classList.remove('active', 'error');
    D.infoText.textContent = '就绪';
}

// ============================================================
// 音频捕获 + 语音识别
// ============================================================
async function startAudioCapture() {
    try {
        let stream;

        // 方案1: 纯音频捕获（Chrome 125+）
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,   // 必须包含 video，部分浏览器不支持纯音频
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            });
        } catch (err) {
            throw new Error('无法访问屏幕音频: ' + err.message);
        }

        // 如果用户关闭了共享，getDisplayMedia 会 reject
        // 停止视频轨道（只保留音频）
        stream.getVideoTracks().forEach(t => t.stop());

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
            throw new Error('未检测到音频轨道。请在选择标签页时勾选"分享音频"选项。');
        }

        // 创建纯音频流
        const audioStream = new MediaStream([audioTrack]);

        // 初始化 Web Speech API
        startSpeechRecognition(audioStream);

        // 监听音频轨道结束（用户手动停止共享）
        audioTrack.addEventListener('ended', () => {
            if (S.isTranslating) stopTranslation();
        });

        return audioStream;
    } catch (err) {
        if (err.name === 'AbortError') {
            // 用户取消了选择
            return null;
        }
        console.error('音频捕获失败:', err);
        alert('音频捕获失败: ' + err.message);
        return null;
    }
}

function startSpeechRecognition(stream) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('您的浏览器不支持 Web Speech API，请使用 Chrome。');
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript.trim();
            if (event.results[i].isFinal) {
                finalText += transcript + ' ';
            } else {
                interimText += transcript + ' ';
            }
        }

        // 发送到字幕窗口
        if (finalText) {
            S.broadcastTranslate.postMessage({
                en_text: finalText.trim(),
                zh_text: '',
                type: 'final',
            });
            // 发送到后端翻译
            sendToBackend(finalText.trim(), 'final');
        }

        if (interimText) {
            S.broadcastTranslate.postMessage({
                en_text: interimText.trim(),
                zh_text: '',
                type: 'interim',
            });
            // 也发送 interim（后端可选择性翻译）
            sendToBackend(interimText.trim(), 'interim');
        }
    };

    recognition.onerror = (event) => {
        console.error('语音识别错误:', event.error);
        if (event.error === 'no-speech') {
            // 没有检测到语音，静默处理
            return;
        }
        if (event.error === 'aborted') {
            return;
        }
        // 其他错误尝试重启
        if (S.isTranslating) {
            recognition.stop();
            setTimeout(() => {
                if (S.isTranslating) recognition.start();
            }, 1000);
        }
    };

    recognition.onend = () => {
        // 自动重启（除非用户手动停止）
        if (S.isTranslating && !S.isPaused) {
            try {
                recognition.start();
            } catch {
                setTimeout(() => {
                    if (S.isTranslating) recognition.start();
                }, 1000);
            }
        }
    };

    S.recognition = recognition;
    recognition.start();
}

function sendToBackend(text, type) {
    if (S.ws && S.ws.readyState === WebSocket.OPEN) {
        S.ws.send(JSON.stringify({
            text,
            type,
            target_lang: S.settings.targetLang,
        }));
    }
}

function stopSpeechRecognition() {
    if (S.recognition) {
        S.recognition.stop();
        S.recognition = null;
    }
}

// ============================================================
// 本地文件模式（备选）
// ============================================================
async function startFileMode(file) {
    const url = URL.createObjectURL(file);
    const isAudio = file.type.startsWith('audio/');

    // 隐藏打开文件模式窗口（用隐藏元素播放）
    const media = document.createElement(isAudio ? 'audio' : 'video');
    media.src = url;
    media.crossOrigin = 'anonymous';
    media.controls = false;
    media.muted = false;
    media.style.display = 'none';
    document.body.appendChild(media);
    await media.play();

    // 捕获元素音频
    const stream = media.captureStream
        ? media.captureStream()
        : media.mozCaptureStream
            ? media.mozCaptureStream()
            : null;

    if (!stream) {
        alert('无法从文件中捕获音频流');
        return;
    }

    startSpeechRecognition(stream);

    media.addEventListener('ended', () => {
        if (S.isTranslating) stopTranslation();
    });

    return stream;
}

// ============================================================
// 翻译控制
// ============================================================
async function startTranslation() {
    // 打开画中画字幕窗口
    const pipOpened = await openPipWindow();
    if (!pipOpened) return;

    // 连接 WebSocket
    try {
        await connectWS();
    } catch {
        closePipWindow();
        return;
    }

    // 捕获音频
    const audioStream = await startAudioCapture();
    if (!audioStream) {
        // 用户取消了
        disconnectWS();
        closePipWindow();
        return;
    }

    S.isTranslating = true;
    S.isPaused = false;
    updateUI('translating');
}

function stopTranslation() {
    S.isTranslating = false;
    S.isPaused = false;
    stopSpeechRecognition();
    disconnectWS();
    closePipWindow();
    updateUI('ready');
}

function togglePause() {
    S.isPaused = !S.isPaused;
    if (S.isPaused) {
        stopSpeechRecognition();
        disconnectWS();
        D.infoText.textContent = '已暂停';
    } else {
        // 暂不支持恢复音频捕获（需要用户重新选择标签）
        // 简化处理：提示用户
        D.infoText.textContent = '请重新开始翻译';
    }
    updateUI(S.isTranslating ? (S.isPaused ? 'paused' : 'translating') : 'ready');
}

// ============================================================
// UI 更新
// ============================================================
function updateUI(state) {
    switch (state) {
        case 'ready':
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
            break;

        case 'pip':
            D.statusCard.classList.add('translating');
            D.statusTitle.textContent = '字幕窗口已打开';
            D.statusDesc.textContent = '画中画窗口已弹出，请将其拖动到视频下方合适的位置。窗口始终置顶，不会遮挡您的操作。';
            D.hint.textContent = '选择播放视频的标签页以开始捕获音频';
            D.hint.classList.add('active');
            break;

        case 'translating':
            D.mainBtn.classList.add('translating');
            D.mainBtnIcon.innerHTML = '&#9632;';
            D.mainBtnText.textContent = '停止';
            D.statusCard.classList.add('translating');
            D.statusTitle.textContent = '翻译中';
            D.statusDesc.textContent = '正在实时捕获音频并翻译。字幕将显示在浮动窗口中。如需调整字幕字体或位置，请使用上方设置。';
            D.hint.textContent = '● 翻译进行中...';
            D.hint.classList.add('active');
            D.infoDot.classList.add('active');
            D.infoText.textContent = '翻译中';
            break;

        case 'paused':
            D.mainBtn.classList.remove('translating');
            D.statusTitle.textContent = '已暂停';
            D.statusDesc.textContent = '翻译已暂停。点击按钮恢复或停止。';
            D.hint.textContent = '暂停中...';
            break;
    }
}

// ============================================================
// 事件绑定
// ============================================================

// 主按钮：开始/停止
D.mainBtn.addEventListener('click', () => {
    if (!S.isTranslating) {
        startTranslation();
    } else {
        stopTranslation();
    }
});

// 字体设置
D.fontGroup.addEventListener('click', (e) => {
    if (!e.target.classList.contains('toggle-btn')) return;
    D.fontGroup.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    S.settings.fontSize = e.target.dataset.font;
    S.broadcastSettings.postMessage({ fontSize: S.settings.fontSize });
});

// 显示模式
D.modeGroup.addEventListener('click', (e) => {
    if (!e.target.classList.contains('toggle-btn')) return;
    D.modeGroup.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    S.settings.mode = e.target.dataset.mode;
    S.broadcastSettings.postMessage({ mode: S.settings.mode });
});

// 目标语言
D.langSelect.addEventListener('change', () => {
    S.settings.targetLang = D.langSelect.value;
});

// 文件上传
D.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 先打开字幕窗口
    const pipOpened = await openPipWindow();
    if (!pipOpened) return;

    try {
        await connectWS();
    } catch {
        closePipWindow();
        return;
    }

    const stream = await startFileMode(file);
    if (!stream) {
        disconnectWS();
        closePipWindow();
        return;
    }

    S.isTranslating = true;
    updateUI('translating');
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        D.mainBtn.click();
    }
});

// 页面关闭前清理
window.addEventListener('beforeunload', () => {
    if (S.isTranslating) stopTranslation();
    S.broadcastSettings.close();
    S.broadcastTranslate.close();
});

// ============================================================
console.log('SimulCast 控制面板已就绪');
console.log('快捷键: Ctrl+Enter 开始/停止');
console.log('支持: 标签页音频捕获 + 本地文件上传');
