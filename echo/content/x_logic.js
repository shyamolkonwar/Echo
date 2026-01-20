// Echo Chrome Extension - X (Twitter) Logic
// Extracts tweet data using stable data-testid selectors

(function () {
    'use strict';

    // Only run on X/Twitter
    if (window.ECHO_PLATFORM !== 'x') return;

    console.log('[Echo X Logic] Loading...');

    // Selectors using stable data-testid attributes (never use random CSS classes!)
    const X_SELECTORS = {
        tweet: 'article[data-testid="tweet"]',
        tweetText: 'div[data-testid="tweetText"]',
        userName: 'div[data-testid="User-Name"]',
        tweetPhoto: 'div[data-testid="tweetPhoto"] img',
        replyButton: 'div[data-testid="reply"]',
        tweetTextarea: 'div[data-testid="tweetTextarea_0"]',
        likeButton: 'div[data-testid="like"]',
        retweetButton: 'div[data-testid="retweet"]'
    };

    // Extract tweet data from a tweet element
    function extractTweetData(tweetElement) {
        if (!tweetElement) return null;

        try {
            // Get tweet text
            const textElement = tweetElement.querySelector(X_SELECTORS.tweetText);
            const tweetText = textElement?.textContent?.trim() || '';

            // Get author info
            const userNameElement = tweetElement.querySelector(X_SELECTORS.userName);
            let authorName = '';
            let authorHandle = '';

            if (userNameElement) {
                // The User-Name div contains name and @handle
                const allText = userNameElement.textContent || '';
                // Extract handle (starts with @)
                const handleMatch = allText.match(/@[\w]+/);
                authorHandle = handleMatch ? handleMatch[0] : '';

                // Name is usually the first part before @
                const spans = userNameElement.querySelectorAll('span');
                if (spans.length > 0) {
                    authorName = spans[0]?.textContent?.trim() || '';
                }
            }

            // Get images
            const images = [];
            const photoElements = tweetElement.querySelectorAll(X_SELECTORS.tweetPhoto);
            photoElements.forEach(img => {
                if (img.src) images.push(img.src);
            });

            // Generate a pseudo ID from content hash
            const tweetId = generateTweetId(tweetText, authorHandle);

            // Check if it's an ad
            const isAd = detectAd(tweetElement);

            return {
                platform: 'x',
                postId: tweetId,
                authorName: authorName,
                authorHandle: authorHandle,
                content: tweetText,
                hasImage: images.length > 0,
                images: images,
                isAd: isAd
            };
        } catch (error) {
            console.error('[Echo X Logic] Error extracting tweet data:', error);
            return null;
        }
    }

    // Generate a unique ID for a tweet (since we can't easily get the real ID)
    function generateTweetId(text, handle) {
        const combined = `${handle}:${text.substring(0, 50)}`;
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `tweet_${Math.abs(hash)}`;
    }

    // Detect if a tweet is an advertisement
    function detectAd(tweetElement) {
        if (!tweetElement) return false;

        const elementText = tweetElement.textContent?.toLowerCase() || '';

        // Check for "Ad" or "Promoted" labels
        // These are typically in small spans at the top or bottom of the tweet
        if (elementText.includes('promoted')) return true;

        // Look for the small "Ad" label
        const smallTexts = tweetElement.querySelectorAll('span');
        for (const span of smallTexts) {
            const text = span.textContent?.trim();
            if (text === 'Ad' || text === 'Promoted') {
                return true;
            }
        }

        return false;
    }

    // Export functions for the driver
    window.extractXTweetData = extractTweetData;
    window.X_SELECTORS = X_SELECTORS;
    window.isXAd = detectAd;

    console.log('[Echo X Logic] Module loaded');

})();
