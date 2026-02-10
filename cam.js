// ============================================================================
// CAMERA AND PHOTO BOOTH MODULE
// ============================================================================

// Camera and video settings
const CAMERA_WIDTH_IDEAL = 1920;          // Ideal camera width (1920 = 1080p)
const CAMERA_HEIGHT_IDEAL = 1080;         // Ideal camera height
const CAMERA_FRAME_RATE_IDEAL = 60;       // Ideal frame rate (smooth video)
const CAMERA_FRAME_RATE_MIN = 30;         // Minimum acceptable frame rate
const VIDEO_BITRATE_VP9 = 8000000;        // VP9 bitrate: 8 Mbps (highest quality)
const VIDEO_BITRATE_VP8 = 6000000;        // VP8 bitrate: 6 Mbps
const VIDEO_BITRATE_DEFAULT = 5000000;    // Default bitrate: 5 Mbps (fallback)

// Camera state variables
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

/**
 * Display the clickbait photo booth button after acceptance
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
 * Initialize camera access and start photo booth
 */
async function startPhotoBooth() {
    try {
        // Request camera permission with high-quality settings
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: CAMERA_WIDTH_IDEAL, min: 1280 },
                height: { ideal: CAMERA_HEIGHT_IDEAL, min: 720 },
                frameRate: { ideal: CAMERA_FRAME_RATE_IDEAL, min: CAMERA_FRAME_RATE_MIN },
                aspectRatio: 16 / 9,
                brightness: { ideal: 100 },
                contrast: { ideal: 100 },
                saturation: { ideal: 100 },
                sharpness: { ideal: 100 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false
            }
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
 * Build the camera UI with video feed and controls
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
 * Start recording the video stream
 */
function startRecording() {
    recordedChunks = [];
    
    // Try codecs in order of preference for quality
    let options = null;
    const codecOptions = [
        { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: VIDEO_BITRATE_VP9 },
        { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: VIDEO_BITRATE_VP8 },
        { mimeType: 'video/webm', videoBitsPerSecond: VIDEO_BITRATE_DEFAULT },
        { mimeType: 'video/mp4', videoBitsPerSecond: VIDEO_BITRATE_DEFAULT }
    ];
    
    // Select the first supported codec option
    for (let opt of codecOptions) {
        if (MediaRecorder.isTypeSupported(opt.mimeType)) {
            options = opt;
            break;
        }
    }
    
    // Fallback with default settings if no codec is supported
    if (!options) {
        options = { videoBitsPerSecond: VIDEO_BITRATE_DEFAULT };
    }
    
    mediaRecorder = new MediaRecorder(mediaStream, options);
    
    mediaRecorder.ondataavailable = (event) => {
        recordedChunks.push(event.data);
    };
    
    mediaRecorder.start();
    isRecording = true;
}

/**
 * Capture a still image from the video feed
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
 * Stop recording and export video + final frame
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
 * Download the recorded video file
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
 * Capture and download the final frame from the recording
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
 * Clean up camera interface and return to normal state
 */
function cleanup() {
    const container = document.getElementById('camera-container');
    if (container) container.remove();
    
    const video = document.getElementById('camera-feed');
    if (video) video.remove();
    
    // Return to normal state
    document.body.style.backgroundColor = 'rgb(255, 203, 227)';
    const heading2 = document.getElementById('heading2');
    if (heading2) heading2.textContent = 'Thanks for saying yes! ❤️';
}

// ============================================================================
// EXPORT FUNCTIONS TO WINDOW
// ============================================================================
window.startPhotoBooth = startPhotoBooth;
window.captureImage = captureImage;
window.stopRecording = stopRecording;
