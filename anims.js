function DoubleToneFlash(color1, color2, delay, flashes) {
    var color1 = color1 || 'rgb(0, 0, 0)';
    var color2 = color2 || 'rgb(255, 203, 227)';
    var delay = delay || 100;
    var flashes = flashes || 8;
    startConfetti();
    for (let i = 0; i < flashes; i++) {
        setTimeout(() => {
            document.body.style.backgroundColor = color2;
        }, i * delay * 2);
        setTimeout(() => {
            document.body.style.backgroundColor = color1;
        }, i * delay * 2 + delay);
    }
    // Show photo booth button after 2 seconds
    setTimeout(() => {
        showPhotoBoothButton();
    }, 2000);
}

function RapidBlink(color, delay, flashes) {
    var color = color || 'rgb(255, 0, 0)';
    var delay = delay || 60;
    var flashes = flashes || 7;
    startConfetti();
    for (let i = 0; i < flashes; i++) {
        setTimeout(() => {
            document.body.style.backgroundColor = color;
        }, i * delay * 2);
        setTimeout(() => {
            document.body.style.backgroundColor = 'rgb(0, 0, 0)';
        }, i * delay * 2 + delay);
    }
    // Show photo booth button after 2 seconds
    setTimeout(() => {
        showPhotoBoothButton();
    }, 2000);
}

function changeBackgroundColor(color) {
    document.body.style.backgroundColor = color;
}

// ============================================================================
// EXPORT FUNCTIONS TO WINDOW (for HTML onclick handlers)
// ============================================================================
window.accept = accept;
window.reject = reject;
