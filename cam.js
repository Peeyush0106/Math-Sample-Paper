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
 * Captures a single image from the current video frame (stores temporarily)
 */
function captureImage() {
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('capture-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    // Store image blob instead of downloading
    canvas.toBlob((blob) => {
        const imageData = {
            blob: blob,
            timestamp: Date.now(),
            url: URL.createObjectURL(blob)
        };
        capturedImages.push(imageData);
        
        // Visual feedback - brief subtitle showing image was captured
        const heading2 = document.getElementById('heading2');
        const originalText = heading2.textContent;
        heading2.textContent = `📷 Captured! (${capturedImages.length})`;
        setTimeout(() => {
            heading2.textContent = originalText;
        }, 1500);
    });
}

/**
 * Stops recording and prepares files for download
 */
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Stop all tracks
        mediaStream.getTracks().forEach(track => track.stop());
        
        // Wait for the recording to finish processing
        setTimeout(() => {
            videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
            
            // Capture final frame
            const video = document.getElementById('camera-feed');
            const canvas = document.getElementById('capture-canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            
            canvas.toBlob((blob) => {
                finalFrameBlob = blob;
                cleanup();
            });
        }, 1000);
    }
}

/**
 * Downloads all captured files at once
 */
async function downloadAll() {
    // Use JSZip library if available, otherwise download files individually with delay
    if (typeof JSZip !== 'undefined') {
        const zip = new JSZip();
        
        // Add all captured images
        capturedImages.forEach((img, index) => {
            zip.file(`photo-${index + 1}.png`, img.blob);
        });
        
        // Add video
        if (videoBlob) {
            zip.file(`video-recording.webm`, videoBlob);
        }
        
        // Add final frame
        if (finalFrameBlob) {
            zip.file(`final-photo.png`, finalFrameBlob);
        }
        
        // Generate and download zip
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
        
        // Download video first
        if (videoBlob) {
            setTimeout(() => {
                const url = URL.createObjectURL(videoBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `video-${Date.now()}.webm`;
                link.click();
                URL.revokeObjectURL(url);
            }, delay);
            delay += 500;
        }
        
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
        
        // Download captured images
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
    
    // Files summary
    const filesSummary = document.createElement('div');
    filesSummary.className = 'files-summary';
    
    const filesList = document.createElement('ul');
    filesList.className = 'files-list';
    
    // Video file
    if (videoBlob) {
        const videoItem = document.createElement('li');
        videoItem.innerHTML = `🎥 Video Recording (${(videoBlob.size / 1024 / 1024).toFixed(2)} MB)`;
        filesList.appendChild(videoItem);
    }
    
    // Final photo
    if (finalFrameBlob) {
        const finalItem = document.createElement('li');
        finalItem.innerHTML = `📸 Final Photo (${(finalFrameBlob.size / 1024).toFixed(2)} KB)`;
        filesList.appendChild(finalItem);
    }
    
    // Captured images
    capturedImages.forEach((img, index) => {
        const imgItem = document.createElement('li');
        imgItem.innerHTML = `📷 Photo ${index + 1} (${(img.blob.size / 1024).toFixed(2)} KB)`;
        filesList.appendChild(imgItem);
    });
    
    filesSummary.appendChild(filesList);
    
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
    content.appendChild(filesSummary);
    content.appendChild(buttonsContainer);
    
    container.appendChild(content);
    document.body.appendChild(container);
}

/**
 * Cleans up the camera interface and shows download page
 */
function cleanup() {
    const container = document.getElementById('camera-container');
    if (container) container.remove();
    
    const video = document.getElementById('camera-feed');
    if (video) video.remove();
    
    // Show the download page with all captured files
    showDownloadPage();
}

/**
 * Cleans up resources and finishes the photo booth session
 */
function finishAndReset() {
    // Clean up blob URLs to free memory
    capturedImages.forEach(img => {
        URL.revokeObjectURL(img.url);
    });
    
    // Remove download page
    const downloadPage = document.getElementById('download-page');
    if (downloadPage) downloadPage.remove();
    
    // Reset variables
    capturedImages = [];
    videoBlob = null;
    finalFrameBlob = null;
    recordedChunks = [];
    
    // Return to normal state
    document.body.style.backgroundColor = 'rgb(255, 203, 227)';
    const heading2 = document.getElementById('heading2');
    heading2.textContent = 'Thanks for saying yes! ❤️';
}

// ============================================================================
// EXPORT FUNCTIONS TO WINDOW
// ============================================================================
window.showPhotoBoothButton = showPhotoBoothButton;
window.startPhotoBooth = startPhotoBooth;
window.captureImage = captureImage;
window.stopRecording = stopRecording;
window.downloadAll = downloadAll;
window.finishAndReset = finishAndReset;
