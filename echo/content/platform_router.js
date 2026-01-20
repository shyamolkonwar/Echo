// Echo Chrome Extension - Platform Router
// Detects current platform and loads appropriate logic module

(function () {
    'use strict';

    // Detect platform from hostname
    const hostname = window.location.hostname;
    let currentPlatform = 'unknown';

    if (hostname.includes('linkedin.com')) {
        currentPlatform = 'linkedin';
    } else if (hostname.includes('reddit.com')) {
        currentPlatform = 'reddit';
    } else if (hostname.includes('x.com') || hostname.includes('twitter.com')) {
        currentPlatform = 'x';
    }

    // Export platform detection
    window.ECHO_PLATFORM = currentPlatform;

    console.log(`[Echo] Platform detected: ${currentPlatform}`);

    // Utility: Check if we're on a supported platform
    window.isSupportedPlatform = function () {
        return currentPlatform === 'linkedin' || currentPlatform === 'reddit' || currentPlatform === 'x';
    };

    // Utility: Get platform name
    window.getPlatform = function () {
        return currentPlatform;
    };

})();
