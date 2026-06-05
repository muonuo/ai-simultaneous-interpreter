/**
 * SimulCast — AI 同声传译助手
 * 前端交互逻辑
 */

// ============================================================
// 状态管理
// ============================================================
const state = {
    videoLoaded: false,
    isTranslating: false,
    isPaused: false,
    ws: null,
    reconnectTimer: null,
    settings: {
        fontSize: 'medium',
        subtitlePos: 'bottom',
        targetLang: 'zh',
    },
};

// ============================================================
// DOM 缓存
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    // 视频
    videoContainer: $('#video-container'),
    emptyState: $('#empty-state'),
    urlBar: $('#url-bar'),
    videoUrl: $('#video-url'),
    fileInput: $('#file-input'),

    // 控制
    startBtn: $('#start-btn'),
    pauseBtn: $('#pause-btn'),
    exportBtn: $('#export-btn'),
    settingsToggle: $('#settings-toggle'),
    statusDot: $('.status-dot'),
    statusText: $('.status-text'),

    // 字幕
    enSegments: $('#en-segments'),
    zhSegments: $('#zh-segments'),
    subtitleTrack: $('#subtitle-track'),

    // 面板
    sidebar: $('#sidebar'),
    main: $('#main-content'),

    // Toast
    toastContainer: $('#toast-container'),
};

// ============================================================
// Toast 通知
// ============================================================
function showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============================================================
// 视频加载
// ============================================================
function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([^&]+)/,
        /(?:youtu\.be\/)([^?]+)/,
        /(?:youtube\.com\/embed\/)([^?]+)/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

function loadVideo(source) {
    dom.videoContainer.innerHTML = '';

    if (typeof source === 'string') {
        // URL 模式
        const videoId = extractYouTubeId(source);
        if (videoId) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0`;
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
            iframe.allowFullscreen = true;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            dom.videoContainer.appendChild(iframe);
        } else {
            const video = document.createElement('video');
            video.src = source;
            video.controls = true;
            video.crossOrigin = 'anonymous';
            video.style.maxWidth = '100%';
            video.style.maxHeight = '100%';
            dom.videoContainer.appendChild(video);
        }
    } else if (source instanceof File) {
        // 文件模式
        const url = URL.createObjectURL(source);
        const isAudio = source.type.startsWith('audio/');
        if (isAudio) {
            const audio = document.createElement('audio');
            audio.src = url;
            audio.controls = true;
            audio.crossOrigin = 'anonymous';
            audio.style.width = '80%';
            audio.style.maxWidth = '600px';
            dom.videoContainer.appendChild(audio);
        } else {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.crossOrigin = 'anonymous';
            video.style.maxWidth = '100%';
            video.style.maxHeight = '100%';
            dom.videoContainer.appendChild(video);
        }
    }

    // 切换 UI 状态
    dom.emptyState.style.display = 'none';
    dom.urlBar.classList.add('collapsed');
    state.videoLoaded = true;
    dom.startBtn.disabled = false;
    dom.statusText.textContent = '已加载';
    dom.statusDot.classList.remove('active', 'error');
}

// URL 输入提交
dom.videoUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const url = dom.videoUrl.value.trim();
        if (url) loadVideo(url);
    }
});

// 文件上传
dom.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadVideo(file);
});

// 空状态按钮点击
$('#empty-link-btn').addEventListener('click', () => dom.videoUrl.focus());
$('#empty-file-btn').addEventListener('click', () => dom.fileInput.click());

// ============================================================
// WebSocket
// ============================================================
function connectWebSocket() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${location.host}/ws/translate`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        dom.statusDot.classList.add('active');
        dom.statusText.textContent = '翻译中';
        dom.startBtn.querySelector('.control-btn-icon').innerHTML = '&#9679;';
        dom.startBtn.querySelector('.control-btn-text').textContent = '翻译中';
    };

    state.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleTranslationResult(data);
    };

    state.ws.onclose = () => {
        if (state.isTranslating && !state.isPaused) {
            dom.statusText.textContent = '重连中...';
            state.reconnectTimer = setTimeout(connectWebSocket, 2000);
        }
    };

    state.ws.onerror = () => {
        dom.statusDot.classList.add('error');
        dom.statusText.textContent = '连接错误';
    };
}

function disconnectWebSocket() {
    clearTimeout(state.reconnectTimer);
    if (state.ws) {
        state.ws.close();
        state.ws = null;
    }
    dom.statusDot.classList.remove('active', 'error');
    dom.statusText.textContent = '就绪';
}

// ============================================================
// 翻译结果处理
// ============================================================
function handleTranslationResult(data) {
    const { en_text, zh_text, type } = data; // type: 'interim' | 'final' | 'corrected'

    if (en_text) {
        appendSegment(dom.enSegments, en_text, type);
    }
    if (zh_text) {
        appendSegment(dom.zhSegments, zh_text, type);
    }
}

function appendSegment(container, text, type = 'interim') {
    // 清除 placeholder
    const placeholder = container.querySelector('.subtitle-placeholder');
    if (placeholder) placeholder.remove();

    if (type === 'final') {
        // 替换同位置的 interim segment
        const interim = container.querySelector('.subtitle-segment.interim');
        if (interim) {
            interim.textContent = text;
            interim.classList.remove('interim');
            interim.classList.add('final');
            return;
        }
        // 没有 interim 就直接添加
        const seg = document.createElement('span');
        seg.className = 'subtitle-segment final';
        seg.textContent = text;
        container.appendChild(seg);
    } else if (type === 'corrected') {
        // 修正: 替换最后一个 final segment
        const segments = container.querySelectorAll('.subtitle-segment.final');
        const last = segments[segments.length - 1];
        if (last) {
            last.textContent = text;
            last.classList.add('corrected');
            setTimeout(() => last.classList.remove('corrected'), 500);
        }
    } else {
        // interim: 显示临时结果
        let interim = container.querySelector('.subtitle-segment.interim');
        if (!interim) {
            interim = document.createElement('span');
            interim.className = 'subtitle-segment interim';
            container.appendChild(interim);
        }
        interim.textContent = text;
    }

    // 平滑滚动
    dom.subtitles.scrollTo({
        top: dom.subtitles.scrollHeight,
        behavior: 'smooth',
    });
}

// ============================================================
// 控制按钮
// ============================================================

// 开始/停止翻译
dom.startBtn.addEventListener('click', () => {
    if (!state.videoLoaded) return;

    if (!state.isTranslating) {
        // 开始
        state.isTranslating = true;
        state.isPaused = false;
        dom.startBtn.querySelector('.control-btn-icon').innerHTML = '&#9632;';
        dom.startBtn.querySelector('.control-btn-text').textContent = '停止';
        dom.startBtn.classList.remove('primary');
        dom.pauseBtn.disabled = false;
        dom.exportBtn.disabled = false;
        dom.pauseBtn.querySelector('.control-btn-icon').innerHTML = '&#10074;&#10074;';
        connectWebSocket();
        showToast('翻译已开始', 'success');
    } else {
        // 停止
        stopTranslation();
    }
});

function stopTranslation() {
    state.isTranslating = false;
    state.isPaused = false;
    disconnectWebSocket();
    dom.startBtn.querySelector('.control-btn-icon').innerHTML = '&#9654;';
    dom.startBtn.querySelector('.control-btn-text').textContent = '开始翻译';
    dom.startBtn.classList.add('primary');
    dom.pauseBtn.disabled = true;
    dom.statusDot.classList.remove('active', 'error');
    dom.statusText.textContent = '就绪';
    showToast('翻译已停止');
}

// 暂停/继续
dom.pauseBtn.addEventListener('click', () => {
    state.isPaused = !state.isPaused;
    if (state.isPaused) {
        dom.pauseBtn.querySelector('.control-btn-icon').innerHTML = '&#9654;';
        dom.statusText.textContent = '已暂停';
        dom.statusDot.classList.remove('active');
        if (state.ws) state.ws.close();
    } else {
        dom.pauseBtn.querySelector('.control-btn-icon').innerHTML = '&#10074;&#10074;';
        dom.statusText.textContent = '翻译中';
        dom.statusDot.classList.add('active');
        connectWebSocket();
    }
});

// 导出字幕
dom.exportBtn.addEventListener('click', () => {
    const enText = dom.enSegments.innerText;
    const zhText = dom.zhSegments.innerText;

    if (!enText.trim() && !zhText.trim()) {
        showToast('暂无字幕可导出', 'error');
        return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const content = [
        '=== AI 同声传译助手 - 字幕导出 ===',
        `导出时间: ${new Date().toLocaleString()}`,
        '',
        '--- 英文原文 ---',
        enText,
        '',
        '--- 中文翻译 ---',
        zhText,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitle-${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('字幕已导出', 'success');
});

// ============================================================
// 侧边栏设置
// ============================================================
dom.settingsToggle.addEventListener('click', () => {
    dom.sidebar.classList.toggle('open');
});

// 点击侧边栏外部关闭
document.addEventListener('click', (e) => {
    if (!dom.sidebar.contains(e.target) && e.target !== dom.settingsToggle) {
        dom.sidebar.classList.remove('open');
    }
});

// 字体大小
$$('.btn-sm[data-font]').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.btn-sm[data-font]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const size = btn.dataset.font;
        state.settings.fontSize = size;
        dom.main.classList.remove('font-large', 'font-xlarge');
        if (size !== 'medium') dom.main.classList.add(`font-${size}`);
    });
});

// 字幕位置
$$('.btn-sm[data-position]').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.btn-sm[data-position]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const pos = btn.dataset.position;
        state.settings.subtitlePos = pos;
        dom.main.classList.toggle('overlay-mode', pos === 'overlay');
    });
});

// 目标语言
$('#target-lang').addEventListener('change', (e) => {
    state.settings.targetLang = e.target.value;
});

// ============================================================
// 主题切换（预留）
// ============================================================
$('#theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    showToast('主题切换（深色模式推荐）');
});

// ============================================================
// 键盘快捷键
// ============================================================
document.addEventListener('keydown', (e) => {
    // Ctrl+Enter 开始/停止翻译
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        dom.startBtn.click();
    }
    // Ctrl+. 暂停/继续
    if (e.ctrlKey && e.key === '.') {
        e.preventDefault();
        dom.pauseBtn.click();
    }
});

// ============================================================
// 初始化
// ============================================================
console.log('SimulCast — AI 同声传译助手 已就绪');
console.log('快捷键: Ctrl+Enter 开始/停止 | Ctrl+. 暂停/继续');
