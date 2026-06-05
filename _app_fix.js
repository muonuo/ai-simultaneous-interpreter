// on page load, try both approaches
async function testAudioCapture() {
    // Test 1: getDisplayMedia - can we capture tab audio?
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true, audio: true
        });
        console.log('getDisplayMedia OK, audio tracks:', stream.getAudioTracks().length);
        stream.getTracks().forEach(t => t.stop());
        return 'tab_capture';
    } catch(e) {
        console.log('getDisplayMedia failed:', e.message);
    }
    
    // Test 2: getUserMedia - microphone
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        console.log('getUserMedia OK');
        stream.getTracks().forEach(t => t.stop());
        return 'mic';
    } catch(e) {
        console.log('getUserMedia failed:', e.message);
    }
    return 'none';
}

// The real issue: Web Speech API ONLY uses default microphone
// It CANNOT accept audio from getDisplayMedia() streams
// Solution: Send audio to backend ASR instead
console.log('Audio capture test ready');
