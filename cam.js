// ============================================================================
// CAMERA AND PHOTO BOOTH MODULE
// ============================================================================

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

/**
 * Shows the attractive photo booth button after acceptance
 */
function showPhotoBoothButton() {
    const button = document.createElement('button');
    button.id = 'photo-booth-btn';
    button.className = 'photo-booth-btn';
    button.innerHTML = '📸 Say Cheese! Take a Picture Together ❤️';
    button.onclick = startPhotoBooth;
    document.body.appendChild(button);
}

/**
 * Initiates the photo booth by requesting camera permission
 */
async function startPhotoBooth() {
    try {
        // Request camera permission
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });
        
        // Remove the photo booth button
        const photoBtn = document.getElementById('photo-booth-btn');
        if (photoBtn) photoBtn.remove();
        
        // Create camera interface
        createCameraInterface();
        startRecording();
    } catch (error) {
        console.error('Camera access denied:', error);
        alert('Camera permission is required to take a picture together!');
    }
}

/**
 * Creates the camera interface with video feed and control buttons
 */
function createCameraInterface() {
    stopConfetti();
    const canvases = document.getElementsByTagName("canvas");
    for (let i = 0; i < canvases.length; i++) {
        canvases[i].style.display = 'none';
    }
    
    // Create container
    const container = document.createElement('div');
    container.id = 'camera-container';
    container.className = 'camera-container';
    
    // Create video element
    const video = document.createElement('video');
    video.id = 'camera-feed';
    video.autoplay = true;
    video.playsinline = true;
    video.muted = true;
    video.srcObject = mediaStream;
    
    // Create canvas for capturing images
    const canvas = document.createElement('canvas');
    canvas.id = 'capture-canvas';
    canvas.style.display = 'none';
    
    // Create controls container
    const controls = document.createElement('div');
    controls.className = 'camera-controls';
    
    // Capture button
    const captureBtn = document.createElement('button');
    captureBtn.className = 'control-btn capture-btn';
    captureBtn.innerHTML = '📷 Capture';
    captureBtn.onclick = captureImage;
    
    // Stop button
    const stopBtn = document.createElement('button');
    stopBtn.className = 'control-btn stop-btn';
    stopBtn.innerHTML = '✅ Done';
    stopBtn.onclick = stopRecording;
    
    controls.appendChild(captureBtn);
    controls.appendChild(stopBtn);
    
    container.appendChild(video);
    container.appendChild(canvas);
    container.appendChild(controls);
    document.body.appendChild(container);
}

/**
 * Starts recording the camera feed
 */
function startRecording() {
    recordedChunks = [];
    const options = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000
    };
    
    // Fallback for browsers that don't support vp9
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
    }
    
    mediaRecorder = new MediaRecorder(mediaStream, options);
    
    mediaRecorder.ondataavailable = (event) => {
        recordedChunks.push(event.data);
    };
    
    mediaRecorder.start();
    isRecording = true;
}

/**
 * Captures a single image from the current video frame
 */
function captureImage() {
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('capture-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    // Download image
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `photo-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
    });
}

/**
 * Stops recording and initiates downloads
 */
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Stop all tracks
        mediaStream.getTracks().forEach(track => track.stop());
        
        // Wait for the recording to finish processing
        setTimeout(() => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            downloadVideo(blob);
            downloadLastFrame();
            cleanup();
        }, 1000);
    }
}

/**
 * Downloads the recorded video
 */
function downloadVideo(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `video-${Date.now()}.webm`;
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * Downloads the final frame as an image
 */
function downloadLastFrame() {
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('capture-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `final-photo-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
    });
}

/**
 * Cleans up the camera interface
 */
function cleanup() {
    const container = document.getElementById('camera-container');
    if (container) container.remove();
    
    const video = document.getElementById('camera-feed');
    if (video) video.remove();
    
    // Return to normal state
    const heading2 = document.getElementById('heading2');
    document.body.style.backgroundColor = 'rgb(255, 203, 227)';
    heading2.textContent = 'Thanks for saying yes! ❤️';
}

// ============================================================================
// EXPORT FUNCTIONS TO WINDOW
// ============================================================================
window.showPhotoBoothButton = showPhotoBoothButton;
window.startPhotoBooth = startPhotoBooth;
window.captureImage = captureImage;
window.stopRecording = stopRecording;
