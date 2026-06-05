/**
 * AI 同声传译助手 - 前端逻辑
 */

// 状态
const state = {
    mode: 'link',        // 'link' | 'file'
    videoLoaded: false,
    isTranslating: false,
    isPaused: false,
    ws: null,            // WebSocket 连接
};

// DOM 元素
const elements = {
    tabBtns: document.querySelectorAll('.tab-btn'),
    linkMode: document.getElementById('link-mode'),
    fileMode: document.getElementById('file-mode'),
    videoUrl: document.getElementById('video-url'),
    loadBtn: document.getElementById('load-btn'),
    fileInput: document.getElementById('file-input'),
    videoContainer: document.getElementById('video-container'),
    startBtn: document.getElementById('start-btn'),
    pauseBtn: document.getElementById('pause-btn'),
    exportBtn: document.getElementById('export-btn'),
    enText: document.getElementById('en-text'),
    zhText: document.getElementById('zh-text'),
};

/**
 * 切换输入模式（链接 / 文件）
 */
elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        state.mode = btn.dataset.mode;
        elements.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        elements.linkMode.classList.toggle('hidden', state.mode !== 'link');
        elements.fileMode.classList.toggle('hidden', state.mode !== 'file');
    });
});

/**
 * 加载视频
 */
function loadVideo(source) {
    const container = elements.videoContainer;
    container.innerHTML = '';

    if (state.mode === 'link' && source) {
        // YouTube 嵌入
        const videoId = extractYouTubeId(source);
        if (videoId) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
            iframe.allow = 'autoplay; encrypted-media';
            iframe.allowFullscreen = true;
            container.appendChild(iframe);
        } else {
            // 普通视频链接
            const video = document.createElement('video');
            video.src = source;
            video.controls = true;
            video.crossOrigin = 'anonymous';
            container.appendChild(video);
        }
        state.videoLoaded = true;
    } else if (state.mode === 'file' && source) {
        // 本地文件
        const isAudio = source.type?.startsWith('audio/');
        if (isAudio) {
            const audio = document.createElement('audio');
            audio.src = URL.createObjectURL(source);
            audio.controls = true;
            audio.crossOrigin = 'anonymous';
            container.appendChild(audio);
        } else {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(source);
            video.controls = true;
            video.crossOrigin = 'anonymous';
            container.appendChild(video);
        }
        state.videoLoaded = true;
    }

    if (state.videoLoaded) {
        elements.startBtn.disabled = false;
    }
}

/**
 * 从 YouTube URL 提取视频 ID
 */
function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([^&]+)/,
        /(?:youtu\.be\/)([^?]+)/,
        /(?:youtube\.com\/embed\/)([^?]+)/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// 加载按钮
elements.loadBtn.addEventListener('click', () => {
    const url = elements.videoUrl.value.trim();
    if (url) loadVideo(url);
});

// 文件选择
elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadVideo(file);
});

/**
 * 连接 WebSocket
 */
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws/translate`;
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        console.log('WebSocket 已连接');
    };

    state.ws.onmessage = (event) => {
        const translation = event.data;
        appendSubtitle(elements.zhText, translation, 'final');
    };

    state.ws.onclose = () => {
        console.log('WebSocket 已断开');
        if (state.isTranslating && !state.isPaused) {
            // 自动重连
            setTimeout(connectWebSocket, 2000);
        }
    };

    state.ws.onerror = (err) => {
        console.error('WebSocket 错误:', err);
    };
}

/**
 * 添加字幕到面板
 */
function appendSubtitle(container, text, type = 'interim') {
    // 移除 placeholder
    const placeholder = container.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    // 查找或创建 segment
    let segment = container.querySelector(`.segment.${type}:last-child`);
    if (type === 'final' || !segment) {
        segment = document.createElement('p');
        segment.className = `segment ${type}`;
        container.appendChild(segment);
    }

    if (type === 'final') {
        // final 替换之前的 interim
        const interim = container.querySelector('.segment.interim');
        if (interim) interim.textContent = text;
        segment.textContent = text;
    } else {
        segment.textContent = text;
    }

    // 自动滚动到底部
    container.parentElement?.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
    });
}

// 开始翻译按钮
elements.startBtn.addEventListener('click', () => {
    if (state.isTranslating) return;
    state.isTranslating = true;
    state.isPaused = false;
    connectWebSocket();
    elements.startBtn.textContent = '翻译中...';
    elements.pauseBtn.disabled = false;
});

// 暂停按钮
elements.pauseBtn.addEventListener('click', () => {
    state.isPaused = !state.isPaused;
    elements.pauseBtn.textContent = state.isPaused ? '继续' : '暂停';
});

// 导出按钮
elements.exportBtn.addEventListener('click', () => {
    const enText = elements.enText.innerText;
    const zhText = elements.zhText.innerText;
    const content = `英文原文:\n${enText}\n\n中文翻译:\n${zhText}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subtitle.txt';
    a.click();
    URL.revokeObjectURL(url);
});

console.log('AI 同声传译助手 已就绪');
