// Echo Chrome Extension - Reddit Logic Module
// Handles Reddit-specific DOM manipulation and automation

(function () {
    'use strict';

    // Only run on Reddit
    if (window.getPlatform() !== 'reddit') return;

    console.log('[Echo Reddit] Module loaded');

    // ==================== REDDIT SELECTORS ====================

    const SELECTORS = {
        // Feed and posts
        feed: 'shreddit-feed, div#main-content',
        post: 'shreddit-post, article.w-full',
        postTitle: 'div[slot="title"] h1, h1[slot="title"], a[slot="title"]',
        postBody: 'div[slot="text-body"], div#post-content, div[contenteditable="true"]',
        subreddit: 'a[href^="/r/"], shreddit-subreddit-header a',
        flair: 'flair-text, .flair, [class*="flair"]',
        timestamp: 'time, [data-testid="post_timestamp"]',

        // Comments
        commentButton: 'button[aria-label*="comment"], a[data-click-id="comments"]',
        commentBox: 'div[contenteditable="true"][role="textbox"]',
        commentInput: 'textarea[name="text"], div.public-DraftEditor-content',
        submitButton: 'button[type="submit"]',

        // Metadata
        upvotes: 'shreddit-post::upvote-count, div[id*="vote"]',
        author: 'a[href^="/user/"]'
    };

    // ==================== POST EXTRACTION ====================

    /**
     * Extract post data from Reddit post element
     */
    window.extractRedditPostData = function (postElement) {
        try {
            // Get subreddit name
            const subredditLink = postElement.querySelector(SELECTORS.subreddit);
            const subreddit = subredditLink ?
                subredditLink.getAttribute('href').replace('/r/', '').replace('/', '') :
                'unknown';

            // Get post title
            const titleElement = postElement.querySelector(SELECTORS.postTitle);
            const title = titleElement ? titleElement.textContent.trim() : '';

            // Get post body (if text post)
            const bodyElement = postElement.querySelector(SELECTORS.postBody);
            const body = bodyElement ? bodyElement.textContent.trim() : '';

            // Get flair
            const flairElement = postElement.querySelector(SELECTORS.flair);
            const flair = flairElement ? flairElement.textContent.trim() : '';

            // Get author
            const authorElement = postElement.querySelector(SELECTORS.author);
            const author = authorElement ? authorElement.textContent.trim() : '';

            // Get timestamp
            const timestampElement = postElement.querySelector(SELECTORS.timestamp);
            const timestamp = timestampElement ?
                new Date(timestampElement.getAttribute('datetime') || timestampElement.textContent).getTime() :
                Date.now();

            // Get post ID
            const postId = postElement.getAttribute('id') ||
                postElement.getAttribute('data-post-id') ||
                generatePostId(postElement);

            // Check if post has image
            const hasImage = postElement.querySelector('img[src*="redd.it"], img[src*="imgur"]') !== null;

            return {
                platform: 'reddit',
                postId,
                subreddit,
                title,
                body,
                flair,
                author,
                timestamp,
                hasImage,
                content: title + (body ? '\n\n' + body : '') // Combined for AI
            };
        } catch (error) {
            console.error('[Echo Reddit] Error extracting post data:', error);
            return null;
        }
    };

    /**
     * Generate a unique ID for posts without a data attribute
     */
    function generatePostId(post) {
        const title = post.querySelector(SELECTORS.postTitle)?.textContent || '';
        return 'reddit-' + title.substring(0, 50).replace(/[^a-z0-9]/gi, '');
    }

    /**
     * Check if post is old enough (at least 15 minutes)
     */
    window.isRedditPostOldEnough = function (postElement) {
        try {
            const timestampElement = postElement.querySelector(SELECTORS.timestamp);
            if (!timestampElement) return false;

            const postTime = new Date(timestampElement.getAttribute('datetime') || timestampElement.textContent).getTime();
            const ageMinutes = (Date.now() - postTime) / 60000;

            console.log(`[Echo Reddit] Post age: ${ageMinutes.toFixed(1)} minutes`);
            return ageMinutes >= 15;
        } catch (error) {
            console.error('[Echo Reddit] Error checking post age:', error);
            return false;
        }
    };

    /**
     * Check if subreddit is in watched list
     */
    window.shouldCommentOnSubreddit = async function (subreddit) {
        try {
            const settings = await chrome.storage.local.get(['reddit_watched_subreddits']);
            const watchedList = settings.reddit_watched_subreddits || [];

            const normalized = subreddit.toLowerCase().replace(/^r\//, '');
            const match = watchedList.some(watched =>
                watched.toLowerCase().replace(/^r\//, '') === normalized
            );

            console.log(`[Echo Reddit] Subreddit ${subreddit} watched: ${match}`);
            return match;
        } catch (error) {
            console.error('[Echo Reddit] Error checking subreddit:', error);
            return false;
        }
    };

    // ==================== COMMENT INSERTION ====================

    /**
     * Open comment box for a Reddit post
     */
    window.openRedditCommentBox = async function (postElement) {
        try {
            // Find and click comment button
            const commentButton = postElement.querySelector(SELECTORS.commentButton);
            if (!commentButton) {
                console.error('[Echo Reddit] Comment button not found');
                return false;
            }

            commentButton.click();
            await sleep(1000);

            // Wait for comment box to appear
            const commentBox = await waitForRedditCommentBox(postElement);
            return commentBox !== null;
        } catch (error) {
            console.error('[Echo Reddit] Error opening comment box:', error);
            return false;
        }
    };

    /**
     * Wait for comment box to appear
     */
    async function waitForRedditCommentBox(postElement, timeout = 5000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const commentBox = document.querySelector(SELECTORS.commentBox) ||
                document.querySelector(SELECTORS.commentInput);

            if (commentBox) {
                console.log('[Echo Reddit] Comment box found');
                return commentBox;
            }

            await sleep(100);
        }

        console.error('[Echo Reddit] Comment box timeout');
        return null;
    }

    /**
     * Insert comment text into Reddit's Markdown editor
     */
    window.insertRedditComment = async function (postElement, commentText) {
        try {
            const commentBox = document.querySelector(SELECTORS.commentBox) ||
                document.querySelector(SELECTORS.commentInput);

            if (!commentBox) {
                console.error('[Echo Reddit] Comment box not found');
                return false;
            }

            // Focus the editor
            commentBox.focus();
            await sleep(500);

            // Clear any existing text
            commentBox.textContent = '';

            // Insert text using execCommand (works with most editors)
            document.execCommand('insertText', false, commentText);

            // Fallback: direct textContent set
            if (!commentBox.textContent || commentBox.textContent.trim() === '') {
                commentBox.textContent = commentText;

                // Trigger input event
                const event = new Event('input', { bubbles: true });
                commentBox.dispatchEvent(event);
            }

            console.log('[Echo Reddit] Comment inserted:', commentText);
            return true;
        } catch (error) {
            console.error('[Echo Reddit] Error inserting comment:', error);
            return false;
        }
    };

    /**
     * Auto-post the comment (for auto-pilot mode)
     */
    window.submitRedditComment = async function () {
        try {
            const submitButton = document.querySelector(SELECTORS.submitButton);

            if (!submitButton) {
                console.error('[Echo Reddit] Submit button not found');
                return false;
            }

            await sleep(randomDelay(1000, 2000));
            submitButton.click();

            console.log('[Echo Reddit] Comment submitted');
            return true;
        } catch (error) {
            console.error('[Echo Reddit] Error submitting comment:', error);
            return false;
        }
    };

    // ==================== UTILITIES ====================

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    console.log('[Echo Reddit] Module initialized successfully');

})();
