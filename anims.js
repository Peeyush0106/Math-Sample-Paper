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

function RapidBlink(color, delay, flashes, button, rapidCapture, then) {
    var color = color || 'rgb(255, 0, 0)';
    var delay = delay || 60;
    var flashes = flashes || 7;


    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '1000000000';
    container.style.backgroundColor = color;
    document.body.appendChild(container);

    for (let i = 0; i < flashes; i++) {
        setTimeout(() => {
            console.log("BLINK!");
            container.style.backgroundColor = color;
            if (rapidCapture) captureImage();
        }, i * delay * 2);
        setTimeout(() => {
            console.log("BLINK!");
            container.style.backgroundColor = 'rgb(0, 0, 0)';
        }, i * delay * 2 + delay);
    }

    var totalDuration = flashes * delay * 2;
    setTimeout(() => {
        if (container.parentNode) {
            container.parentNode.removeChild(container);
        }
        if (typeof then === 'function') {
            then();
        }
    }, totalDuration);

    var showButton = true ? button == null || button == true : false;
    if (showButton) {
        // Show photo booth button after 2 seconds
        setTimeout(() => {
            showPhotoBoothButton();
        }, 2000);
    }
}

function changeBackgroundColor(color) {
    document.body.style.backgroundColor = color;
}

window.accept = accept;
window.reject = reject;

function addButtonClickEffects(button) {
    button.addEventListener('click', function (e) {
        // Add ripple class for the animation
        button.classList.add('clicked');

        // Remove class after animation completes so it can play again
        setTimeout(() => {
            button.classList.remove('clicked');
        }, 600);

        // Create particle burst effect
        createParticleBurst(this, e);
    });
}

function createParticleBurst(button, event) {
    const rect = button.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;

    // Create 5-8 particles
    const particleCount = Math.floor(Math.random() * 4) + 5;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.style.position = 'fixed';
        particle.style.pointerEvents = 'none';
        particle.style.width = '8px';
        particle.style.height = '8px';
        particle.style.borderRadius = '50%';

        // Use gradient colors from button
        const colors = ['#ff6b9d', '#ff4757', '#ff7979', '#fed6e3'];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.boxShadow = `0 0 6px ${particle.style.background}`;

        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        particle.style.zIndex = '50000';

        document.body.appendChild(particle);

        // Animate particle outward
        const angle = (Math.PI * 2 * i) / particleCount;
        const velocity = 3 + Math.random() * 3;
        const tx = Math.cos(angle) * 50 * velocity;
        const ty = Math.sin(angle) * 50 * velocity;

        particle.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 }
        ], {
            duration: 600 + Math.random() * 200,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        });

        // Remove particle after animation
        setTimeout(() => particle.remove(), 800);
    }
}

function initializeButtonEffects() {
    // Apply to all buttons
    const allButtons = document.querySelectorAll('button, input[type="button"]');
    allButtons.forEach(button => {
        addButtonClickEffects(button);
    });

    // Also watch for dynamically added buttons (photo booth, camera, download page)
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    const buttons = node.querySelectorAll ? node.querySelectorAll('button') : [];
                    buttons.forEach(btn => {
                        // Only add if not already enhanced
                        if (!btn._clickEffectsAdded) {
                            addButtonClickEffects(btn);
                            btn._clickEffectsAdded = true;
                        }
                    });

                    // Check if the node itself is a button
                    if (node.tagName === 'BUTTON' && !node._clickEffectsAdded) {
                        addButtonClickEffects(node);
                        node._clickEffectsAdded = true;
                    }
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeButtonEffects);
} else {
    initializeButtonEffects();
}

function triggerCenterFlash(onComplete) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const diagonal = Math.hypot(viewportWidth, viewportHeight);
    const baseSize = 20;
    const finalScale = (diagonal / baseSize) * 1.25;

    // Circular flash that expands from center very rapidly.
    const circleFlash = document.createElement('div');
    circleFlash.style.position = 'fixed';
    circleFlash.style.top = '50%';
    circleFlash.style.left = '50%';
    circleFlash.style.width = `${baseSize}px`;
    circleFlash.style.height = `${baseSize}px`;
    circleFlash.style.borderRadius = '50%';
    circleFlash.style.pointerEvents = 'none';
    circleFlash.style.zIndex = '100050';
    circleFlash.style.background = 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.98) 35%, rgba(255,255,255,0.72) 58%, rgba(255,255,255,0) 75%)';
    circleFlash.style.transform = 'translate(-50%, -50%) scale(0.05)';
    document.body.appendChild(circleFlash);

    // White bloom overlay for a stronger camera-flash feel.
    const bloom = document.createElement('div');
    bloom.style.position = 'fixed';
    bloom.style.inset = '0';
    bloom.style.background = '#fff';
    bloom.style.opacity = '0';
    bloom.style.pointerEvents = 'none';
    bloom.style.zIndex = '100040';
    document.body.appendChild(bloom);

    circleFlash.animate(
        [
            { transform: 'translate(-50%, -50%) scale(0.05)', opacity: 1 },
            { transform: `translate(-50%, -50%) scale(${finalScale})`, opacity: 1 },
            { transform: `translate(-50%, -50%) scale(${finalScale * 1.05})`, opacity: 0 }
        ],
        { duration: 260, easing: 'cubic-bezier(0.12, 0.85, 0.2, 1)', fill: 'forwards' }
    );

    bloom.animate(
        [
            { opacity: 0 },
            { opacity: 0.92, offset: 0.35 },
            { opacity: 0 }
        ],
        { duration: 280, easing: 'ease-out', fill: 'forwards' }
    );

    setTimeout(() => {
        circleFlash.remove();
        bloom.remove();
        if (typeof onComplete === 'function') onComplete();
    }, 300);
}
