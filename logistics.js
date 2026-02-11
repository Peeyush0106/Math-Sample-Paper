// DOM Elements
const yesBtn = document.getElementById('yesBtn');
const noBtn = document.getElementById('noBtn');
const buttonsWrap = document.getElementById('buttons');
const heading1 = document.getElementById('heading1');
const heading2 = document.getElementById('heading2');
const img = document.getElementById('image-wrap');
const centerGif = document.getElementById('center-gif');

// Text strings
const ACCEPTED_TEXT = 'YAY! ❤️';
const REJECTION_MESSAGES = [
    'Misclick maybe?',
    'Think again!',
    'Please? I made cookies...',
    'BE MY VALENTINE! ❤️',
    '🤡'
];

// GIF sequence (index 0 = initial state before any "No" click).
// Replace these entries with your actual gif files in order.
const PLACEHOLDER_GIF = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
        <rect width="400" height="400" fill="#ffe5ef"/>
        <rect x="14" y="14" width="372" height="372" rx="18" fill="none" stroke="#ff4d6d" stroke-width="6" stroke-dasharray="14 10"/>
        <path d="M24 24 L376 376 M376 24 L24 376" stroke="#ff7aa6" stroke-width="4" opacity="0.75"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" fill="#ff2e63" font-weight="700">GIF</text>
        <text x="50%" y="62%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#ff2e63">wireframe placeholder</text>
    </svg>`
)}`;

const GIF_SEQUENCE = [
    PLACEHOLDER_GIF,
    PLACEHOLDER_GIF,
    PLACEHOLDER_GIF,
    PLACEHOLDER_GIF,
    PLACEHOLDER_GIF,
    PLACEHOLDER_GIF
];

// Yes button growth settings
const YES_SCALE_INCREMENT_PER_NO = 0.18;  // How much the "Yes" button grows per "No" click
const YES_SCALE_MAX = 100;                  // Maximum size multiplier (4 = 4x larger)
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

let noCount = 0;  // Tracks how many times the user clicked "No"
let hasAccepted = false; // Prevent duplicate accept animations
let hasTriggeredPhotoTransition = false; // Prevent duplicate flash/photo transition

function setCenterGifByIndex(index) {
    if (!centerGif || GIF_SEQUENCE.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, GIF_SEQUENCE.length - 1));
    centerGif.src = GIF_SEQUENCE[safeIndex];
}

function setChoiceButtonsFixed(isFixed) {
    if (!buttonsWrap) return;
    buttonsWrap.classList.toggle('choice-fixed', isFixed);
}

// Keep Yes/No pinned while both choices are visible.
setChoiceButtonsFixed(true);
setCenterGifByIndex(0);

function handlePhotoCtaClick() {
    if (hasTriggeredPhotoTransition) return;
    hasTriggeredPhotoTransition = true;

    yesBtn.disabled = true;
    yesBtn.style.pointerEvents = 'none';
    yesBtn.style.transition = 'opacity 120ms ease';
    yesBtn.style.opacity = '0';

    triggerCenterFlash(() => {
        if (typeof startPhotoBooth === 'function') {
            startPhotoBooth();
        }
    });
}

function accept() {
    if (hasAccepted) return;
    hasAccepted = true;
    setChoiceButtonsFixed(false);

    startConfetti();
    yesBtn.disabled = true;
    noBtn.disabled = true;
    noBtn.style.pointerEvents = 'none';

    setTimeout(() => {
        // Instant black background change (no transition).
        document.documentElement.style.transition = 'none';
        document.body.style.transition = 'none';
        document.body.style.backgroundColor = 'rgb(0, 0, 0)';

        // Fade distracting elements so the shrinking CTA is the focus.
        heading1.style.transition = 'opacity 150ms ease';
        heading2.style.transition = 'opacity 150ms ease';
        img.style.transition = 'opacity 150ms ease';
        noBtn.style.transition = 'opacity 120ms ease';
        heading1.style.opacity = '0';
        heading2.style.opacity = '0';
        img.style.opacity = '0';
        noBtn.style.opacity = '0';

        // Rapidly shrink from full-screen to an attractive, click-ready pill.
        // Move to body so centering is independent of parent layout context.
        document.body.appendChild(yesBtn);
        yesBtn.style.transition = [
            'width 190ms cubic-bezier(0.2, 0.9, 0.2, 1)',
            'height 190ms cubic-bezier(0.2, 0.9, 0.2, 1)',
            'top 190ms cubic-bezier(0.2, 0.9, 0.2, 1)',
            'left 190ms cubic-bezier(0.2, 0.9, 0.2, 1)',
            'transform 190ms cubic-bezier(0.2, 0.9, 0.2, 1)',
            'border-radius 190ms cubic-bezier(0.2, 0.9, 0.2, 1)',
            'font-size 300ms ease',
            'opacity 180ms ease'
        ].join(', ');
        yesBtn.style.position = 'fixed';
        yesBtn.style.inset = 'auto';
        yesBtn.style.top = '50dvh';
        yesBtn.style.left = '50vw';
        yesBtn.style.right = 'auto';
        yesBtn.style.bottom = 'auto';
        yesBtn.style.width = 'clamp(240px, 62vw, 540px)';
        yesBtn.style.height = 'clamp(72px, 13vh, 120px)';
        yesBtn.style.maxWidth = '92vw';
        yesBtn.style.maxHeight = '30vh';
        yesBtn.style.transformOrigin = 'center center';
        yesBtn.style.transform = 'translate3d(-50%, -50%, 0)';
        yesBtn.style.borderRadius = '20px';
        yesBtn.style.padding = '0 20px';
        yesBtn.style.boxShadow = '0 16px 40px rgba(255, 82, 123, 0.45)';
        yesBtn.style.fontSize = 'clamp(1rem, 3.2vw, 2rem)';
        yesBtn.style.lineHeight = '1.25';
        yesBtn.style.display = 'flex';
        yesBtn.style.alignItems = 'center';
        yesBtn.style.justifyContent = 'center';

        // Smooth text morph via quick fade-out/fade-in.
        yesBtn.style.opacity = '0';
        setTimeout(() => {
            yesBtn.innerText = "Let's take a picture together ! 📸";
            yesBtn.style.opacity = '1';
            yesBtn.disabled = false;
            yesBtn.style.pointerEvents = 'auto';
            yesBtn.onclick = handlePhotoCtaClick;
        }, 90);
    }, 1000);
}

function reject() {
    noCount += 1;
    setCenterGifByIndex(noCount);

    // Show the corresponding rejection message from the list
    const messageIndex = (noCount - 1) % REJECTION_MESSAGES.length;
    heading2.textContent = REJECTION_MESSAGES[messageIndex];

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

    // Calculate and apply "Yes" button growth
    const yesScale = Math.min(1 + noCount * YES_SCALE_INCREMENT_PER_NO, YES_SCALE_MAX);
    if (isFinalMessage) {
        setChoiceButtonsFixed(false);
        noBtn.style.transition = `opacity ${NO_DISAPPEAR_ANIMATION_MS}ms ease, transform ${NO_DISAPPEAR_ANIMATION_MS}ms ease`;
        noBtn.style.opacity = '0';
        noBtn.style.transform = 'scale(0)';
        noBtn.disabled = true;
        noBtn.style.pointerEvents = 'none';
        yesBtn.style.background = "rgb(255, 0, 64)";
        yesBtn.style.color = "white";
        yesBtn.innerText = "SAY YES 💗";
        // Lock page scroll so a full-screen CTA never creates scrollbars.
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        yesBtn.style.position = 'fixed';
        yesBtn.style.inset = '0';
        yesBtn.style.width = '100vw';
        yesBtn.style.height = '100dvh';
        yesBtn.style.maxWidth = '100vw';
        yesBtn.style.maxHeight = '100dvh';
        yesBtn.style.margin = '0';
        yesBtn.style.padding = 'clamp(16px, 3vw, 36px)';
        yesBtn.style.borderRadius = '0';
        yesBtn.style.boxSizing = 'border-box';
        yesBtn.style.fontSize = 'clamp(1.1rem, 6vw, 4.5rem)';
        yesBtn.style.lineHeight = '1.2';
        yesBtn.style.transform = 'none';
        yesBtn.style.zIndex = '10000';

        // Remove from layout after animation completes for clean centering
        setTimeout(() => {
            noBtn.style.display = 'none';
        }, NO_DISAPPEAR_DELAY_MS);
    }
    // When "No" counter reaches final message, fully hide and disable the "No" button
    else {
        yesBtn.style.transform = `scale(${yesScale})`;
        yesBtn.style.boxShadow = YES_GLOW_SHADOW;
    }

    // Animate "Yes" button with a bounce to draw attention (skip on full-screen final state)
    if (!isFinalMessage) {
        yesBtn.animate(
            [
                { transform: `scale(${yesScale}) translateY(0px)` },
                { transform: `scale(${yesScale + YES_BOUNCE_SCALE_EXTRA}) translateY(-6px)` },
                { transform: `scale(${yesScale}) translateY(0px)` }
            ],
            { duration: YES_BOUNCE_DURATION_MS, easing: 'ease-out' }
        );
    }
}
