// ============================================================================
// CONFIGURATION VARIABLES - Tweak these to customize behavior
// ============================================================================

// DOM Elements
const yesBtn = document.getElementById('yesBtn');
const noBtn = document.getElementById('noBtn');
const heading1 = document.getElementById('heading1');
const heading2 = document.getElementById('heading2');
const img = document.getElementById('image-wrap');

// Text strings
const ACCEPTED_TEXT = 'YAY! ❤️';
const REJECTION_MESSAGES = [
    'Are you sure?',
    'Misclick maybe?',
    'Think again!',
    'Please? I made cookies...',
    'BE MY VALENTINE! ❤️'
];

// Yes button growth settings
const YES_SCALE_INCREMENT_PER_NO = 0.18;  // How much the "Yes" button grows per "No" click
const YES_SCALE_MAX = 4;                  // Maximum size multiplier (4 = 4x larger)
const YES_GLOW_SHADOW = '0 12px 30px rgba(255,90,130,0.25)';  // Shadow when growing
const YES_BOUNCE_SCALE_EXTRA = 0.06;      // Extra scale during bounce animation
const YES_BOUNCE_DURATION_MS = 420;       // Bounce animation duration in milliseconds

// No button shrinking settings
const NO_SCALE_DECREMENT_PER_NO = 0.08;   // How much the "No" button shrinks per click
const NO_OPACITY_DECREMENT_PER_NO = 0.1; // How much "No" button fades per click
const NO_WOBBLE_START_AT_CLICK = 4;       // After which click to start wobbling
const NO_WOBBLE_HORIZONTAL_RANGE = 18;    // Horizontal wobble distance in pixels
const NO_WOBBLE_VERTICAL_RANGE = 8;       // Vertical wobble distance in pixels
const NO_DISAPPEAR_ANIMATION_MS = 300;    // Transition duration for disappearance
const NO_DISAPPEAR_DELAY_MS = 360;        // Delay before fully hiding from layout

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

let noCount = 0;  // Tracks how many times the user clicked "No"

/**
 * Called when user clicks "Yes" button
 * Shows acceptance message and disables the "No" button
 */
function accept() {
    heading2.textContent = ACCEPTED_TEXT;
    yesBtn.style.transform = 'scale(1.06)';
    yesBtn.style.transition = 'transform 250ms ease';
    yesBtn.disabled = true;
    yesBtn.style.opacity = '0';
    noBtn.disabled = true;
    noBtn.style.opacity = '0';
    heading1.style.display = 'none';
    img.style.display = 'none';
    flash();
    setTimeout(() => {
        yesBtn.style.display = 'none';
        noBtn.style.display = 'none';
    }, 100);
}

/**
 * Called when user clicks "No" button
 * Increments the "No" counter, grows "Yes", shrinks "No", shows rejection messages
 */
function reject() {
    noCount += 1;

    // Show the corresponding rejection message from the list
    const messageIndex = (noCount - 1) % REJECTION_MESSAGES.length;
    heading2.textContent = REJECTION_MESSAGES[messageIndex];

    // Calculate and apply "Yes" button growth
    const yesScale = Math.min(1 + noCount * YES_SCALE_INCREMENT_PER_NO, YES_SCALE_MAX);
    yesBtn.style.transform = `scale(${yesScale})`;
    yesBtn.style.boxShadow = YES_GLOW_SHADOW;

    // Calculate and apply "No" button shrinking
    const noScale = Math.max(1 - noCount * NO_SCALE_DECREMENT_PER_NO, 0);
    const noOpacity = Math.max(1 - noCount * NO_OPACITY_DECREMENT_PER_NO, 0);
    noBtn.style.transform = `scale(${noScale})`;
    noBtn.style.opacity = `${noOpacity}`;

    // Add wobble effect once "No" is nearly shrunk (but before final disappearance)
    const isFinalMessage = noCount >= REJECTION_MESSAGES.length;
    if (noCount >= NO_WOBBLE_START_AT_CLICK && !isFinalMessage) {
        const wobbleX = (Math.random() - 0.5) * NO_WOBBLE_HORIZONTAL_RANGE;
        const wobbleY = (Math.random() - 0.5) * NO_WOBBLE_VERTICAL_RANGE;
        noBtn.style.transform += ` translate(${wobbleX}px, ${wobbleY}px)`;
    }

    // Animate "Yes" button with a bounce to draw attention
    yesBtn.animate(
        [
            { transform: `scale(${yesScale}) translateY(0px)` },
            { transform: `scale(${yesScale + YES_BOUNCE_SCALE_EXTRA}) translateY(-6px)` },
            { transform: `scale(${yesScale}) translateY(0px)` }
        ],
        { duration: YES_BOUNCE_DURATION_MS, easing: 'ease-out' }
    );

    // When "No" counter reaches final message, fully hide and disable the "No" button
    if (isFinalMessage) {
        noBtn.style.transition = `opacity ${NO_DISAPPEAR_ANIMATION_MS}ms ease, transform ${NO_DISAPPEAR_ANIMATION_MS}ms ease`;
        noBtn.style.opacity = '0';
        noBtn.style.transform = 'scale(0)';
        noBtn.disabled = true;
        noBtn.style.pointerEvents = 'none';

        // Remove from layout after animation completes for clean centering
        setTimeout(() => {
            noBtn.style.display = 'none';
        }, NO_DISAPPEAR_DELAY_MS);
    }
}

function flash() {
    var color1 = 'rgb(0, 0, 0)';
    var color2 = 'rgb(255, 203, 227)';
    var delay = 70;
    startConfetti();
    for (let i = 0; i < 5; i++) {
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

function changeBackgroundColor(color) {
    document.body.style.backgroundColor = color;
}

// ============================================================================
// EXPORT FUNCTIONS TO WINDOW (for HTML onclick handlers)
// ============================================================================
window.accept = accept;
window.reject = reject;
