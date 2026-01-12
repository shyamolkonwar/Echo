// Echo Chrome Extension - Content Script
// Handles LinkedIn DOM manipulation, post detection, and comment insertion

(function () {
    'use strict';

    // State
    let isActive = false;
    let isAutoPilot = false;
    let quickTone = 'professional';
    let processedPosts = new Set();
    let currentPostElement = null;
    let autoPilotDriver = null;

    // Selectors (LinkedIn-specific - updated for 2024/2025)
    const SELECTORS = {
        feedPost: 'div.feed-shared-update-v2',
        postUrn: 'data-urn',
        authorName: '.update-components-actor__name span, .update-components-actor__title span[dir="ltr"], .feed-shared-actor__name',
        postBody: '.feed-shared-update-v2__description .break-words, .feed-shared-inline-show-more-text, .feed-shared-text-view span[dir="ltr"], .update-components-text',
        commentButton: 'button[aria-label*="omment"], button.comment-button, button[data-control-name="comment"]',
        commentForm: '.comments-comment-box, .comments-comment-texteditor, [class*="comment-box"]',
        commentEditor: '.ql-editor, div[data-placeholder*="Add a comment"], div[contenteditable="true"][aria-label*="comment"], .editor-content[contenteditable="true"]',
        postButton: 'button.comments-comment-box__submit-button--cr, button[class*="comments-comment-box__submit-button"], button.comments-comment-box__submit-button, button[data-control-name="submit_comment"], button[type="submit"][class*="comment"]'
    };

    // Initialize extension
    async function init() {
        console.log('[Echo] Content script initialized on LinkedIn');

        // Load initial settings
        const settings = await chrome.storage.local.get(['isActive', 'isAutoPilot', 'quickTone']);
        isActive = settings.isActive || false;
        isAutoPilot = settings.isAutoPilot || false;
        quickTone = settings.quickTone || 'professional';

        console.log('[Echo] Initial state - isActive:', isActive, 'isAutoPilot:', isAutoPilot);

        // Create root element for injected UI
        createEchoRoot();

        // Initialize auto-pilot driver if available
        if (window.AutoPilotDriver) {
            autoPilotDriver = new window.AutoPilotDriver();
            await autoPilotDriver.init();
            console.log('[Echo] Auto-pilot driver initialized');

            // Auto-resume if auto-pilot was running (e.g., after page refresh)
            if (isAutoPilot) {
                console.log('[Echo] Resuming auto-pilot after page refresh...');
                setTimeout(() => {
                    autoPilotDriver.start();
                }, 2000); // Wait 2s for page to stabilize
            }
        }

        // Set up IntersectionObserver for post detection
        if (isActive) {
            startObserver();
        }

        // Set up manual button injection system
        setupManualButtonSystem();

        // Listen for messages from popup
        chrome.runtime.onMessage.addListener(handleMessage);
    }

    // ==================== MANUAL COMMENT BUTTON SYSTEM ====================
    let commentBoxObserver = null;

    function setupManualButtonSystem() {
        console.log('[Echo] Setting up manual button system. isActive:', isActive, 'isAutoPilot:', isAutoPilot);

        // Watch for comment boxes appearing
        commentBoxObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if it's a comment box
                        const commentBoxes = node.matches?.(SELECTORS.commentForm) ? [node] : node.querySelectorAll?.(SELECTORS.commentForm) || [];
                        commentBoxes.forEach(box => {
                            console.log('[Echo] Comment box detected. isAutoPilot:', isAutoPilot, 'isActive:', isActive);
                            if (!isAutoPilot && isActive) {
                                console.log('[Echo] Injecting manual button');
                                injectManualButton(box);
                            }
                        });
                    }
                });
            });
        });

        commentBoxObserver.observe(document.body, { childList: true, subtree: true });

        // Also check existing comment boxes
        if (!isAutoPilot && isActive) {
            document.querySelectorAll(SELECTORS.commentForm).forEach(box => injectManualButton(box));
        }
    }

    function injectManualButton(commentBox) {
        if (isAutoPilot || commentBox.querySelector('.echo-manual-btn')) return;
        const editor = commentBox.querySelector(SELECTORS.commentEditor);
        if (!editor) return;

        const button = document.createElement('button');
        button.className = 'echo-manual-btn';
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg><span>Generate with Echo</span>`;
        button.title = 'Generate AI comment';
        button.type = 'button';
        button.addEventListener('click', async () => await handleManualGenerate(commentBox));

        const buttonGroup = commentBox.querySelector('.comments-comment-box__button-group, .comments-comment-texteditor__toolbar');
        if (buttonGroup) {
            buttonGroup.appendChild(button);
        } else {
            editor.parentElement.insertBefore(button, editor);
        }
    }

    async function handleManualGenerate(commentBox) {
        const button = commentBox.querySelector('.echo-manual-btn');
        if (!button) return;

        try {
            button.classList.add('echo-manual-btn--loading');
            button.disabled = true;

            const post = commentBox.closest(SELECTORS.feedPost);
            if (!post) throw new Error('Could not find post element');

            const postData = await extractPostData(post);
            if (!postData.content || postData.content.length < 10) throw new Error('No valid content found');

            const response = await chrome.runtime.sendMessage({ type: 'GENERATE_COMMENT', postData, quickTone });
            if (response.error) throw new Error(response.error);

            if (response.comment) {
                const editor = commentBox.querySelector(SELECTORS.commentEditor);
                if (editor) {
                    insertCommentText(editor, response.comment);
                    showNotification('✨ Comment generated!');
                }
            }
        } catch (error) {
            console.error('[Echo] Manual generation error:', error);
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            button.classList.remove('echo-manual-btn--loading');
            button.disabled = false;
        }
    }

    function removeAllManualButtons() {
        document.querySelectorAll('.echo-manual-btn').forEach(btn => btn.remove());
    }

    function insertCommentText(editor, comment) {
        // Focus and insert using exec command
        editor.focus();
        const success = document.execCommand('insertText', false, comment);

        if (!success || !editor.innerText.includes(comment.substring(0, 10))) {
            // Fallback to direct insertion
            editor.innerHTML = `<p>${comment}</p>`;
            editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: comment }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // Handle messages from popup/background
    function handleMessage(message, sender, sendResponse) {
        console.log('[Echo] Received message:', message);

        switch (message.type) {
            case 'TOGGLE_ACTIVE':
                isActive = message.isActive;
                if (isActive) {
                    startObserver();
                    showNotification('Echo is now active. Scroll your feed!');
                } else {
                    stopObserver();
                    removeAllIndicators();
                    showNotification('Echo paused');
                }
                break;

            case 'UPDATE_TONE':
                quickTone = message.quickTone;
                break;

            case 'TOGGLE_AUTOPILOT':
                isAutoPilot = message.isAutoPilot;
                console.log('[Echo] TOGGLE_AUTOPILOT:', isAutoPilot);

                if (isAutoPilot && autoPilotDriver) {
                    // CRITICAL: Stop observer to prevent conflict with driver
                    stopObserver();

                    // Remove all manual buttons when autopilot starts
                    removeAllManualButtons();

                    // Start auto-pilot
                    chrome.storage.local.set({ isAutoPilot: true });
                    autoPilotDriver.start();
                    showNotification('🐢 Auto-Pilot activated! Running slow mode.');
                } else if (autoPilotDriver) {
                    // FORCE STOP - set storage first (driver listens for this)
                    chrome.storage.local.set({ isAutoPilot: false });
                    autoPilotDriver.shouldStop = true;
                    autoPilotDriver.isRunning = false;
                    autoPilotDriver.stop();

                    // Restart observer for semi-auto mode
                    if (isActive) {
                        startObserver();
                    }

                    // Re-inject manual buttons in existing comment boxes
                    document.querySelectorAll(SELECTORS.commentForm).forEach(box => injectManualButton(box));

                    showNotification('Auto-Pilot STOPPED');
                }
                break;

            case 'GENERATE_COMPLETE':
                if (message.comment && currentPostElement) {
                    insertComment(currentPostElement, message.comment);
                }
                break;
        }
    }

    // Create root element for Echo UI
    function createEchoRoot() {
        if (document.getElementById('echo-extension-root')) return;

        const root = document.createElement('div');
        root.id = 'echo-extension-root';
        document.body.appendChild(root);
    }

    // Utility function for delays
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // IntersectionObserver for post detection (DISABLED - now using click-trigger)
    let observer = null;
    let commentButtonListeners = new Map();

    function startObserver() {
        console.log('[Echo] Semi-auto mode: Waiting for comment button clicks');

        // Add click listeners to all comment buttons
        attachCommentButtonListeners();

        // Watch for new posts appearing and attach listeners to their comment buttons
        const mutationObserver = new MutationObserver(() => {
            attachCommentButtonListeners();
        });

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function attachCommentButtonListeners() {
        const posts = document.querySelectorAll(SELECTORS.feedPost);

        posts.forEach(post => {
            const postId = post.getAttribute(SELECTORS.postUrn) || generatePostId(post);

            // Skip if already has listener or already processed
            if (commentButtonListeners.has(postId) || processedPosts.has(postId)) return;

            // Find comment button
            const buttonSelectors = SELECTORS.commentButton.split(', ');
            let commentBtn = null;

            for (const selector of buttonSelectors) {
                commentBtn = post.querySelector(selector);
                if (commentBtn) break;
            }

            if (!commentBtn) {
                // Fallback: find any button with "comment" in aria-label
                const allButtons = post.querySelectorAll('button');
                for (const btn of allButtons) {
                    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                    const text = btn.textContent?.toLowerCase() || '';
                    if (ariaLabel.includes('comment') || text.includes('comment')) {
                        commentBtn = btn;
                        break;
                    }
                }
            }

            if (commentBtn) {
                const handler = async () => {
                    // Wait for comment box to appear
                    await sleep(500);

                    // NOW trigger the generation
                    await handlePostVisible(post, postId);
                };

                commentBtn.addEventListener('click', handler, { once: true });
                commentButtonListeners.set(postId, handler);
            }
        });
    }

    function stopObserver() {
        // Disconnect mutation observer if it exists
        // The mutation observer is created inside startObserver, so we need to find a way to stop it.
        // For now, we'll just clear the comment button listeners.
        commentButtonListeners.forEach((handler, postId) => {
            const post = document.querySelector(`[${SELECTORS.postUrn}="${postId}"], #echo-post-${postId.split('-')[2]}-${postId.split('-')[3]}`);
            if (post) {
                const buttonSelectors = SELECTORS.commentButton.split(', ');
                let commentBtn = null;
                for (const selector of buttonSelectors) {
                    commentBtn = post.querySelector(selector);
                    if (commentBtn) break;
                }
                if (!commentBtn) {
                    const allButtons = post.querySelectorAll('button');
                    for (const btn of allButtons) {
                        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                        const text = btn.textContent?.toLowerCase() || '';
                        if (ariaLabel.includes('comment') || text.includes('comment')) {
                            commentBtn = btn;
                            break;
                        }
                    }
                }
                if (commentBtn) {
                    commentBtn.removeEventListener('click', handler);
                }
            }
        });
        commentButtonListeners.clear();
        console.log('[Echo] Observer stopped (click listeners removed)');
    }

    // Handle post becoming visible (NOW TRIGGERED BY COMMENT BUTTON CLICK)
    async function handlePostVisible(post, postId) {
        if (!isActive || processedPosts.has(postId)) return;

        console.log('[Echo] Processing post after comment click:', postId);
        processedPosts.add(postId);
        currentPostElement = post;

        // Add watching indicator (eye icon)
        addWatchingIndicator(post);

        // Extract post content
        const postData = await extractPostData(post);
        console.log('[Echo] Extracted post data:', postData);

        if (!postData.content || postData.content.length < 10) {
            console.log('[Echo] No content found in post or content too short');
            removeWatchingIndicator(post);
            return;
        }

        // Show "thinking" state
        showThinkingState(post);

        // Request comment generation from background script
        try {
            console.log('[Echo] Requesting comment generation...');
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData,
                quickTone
            });

            console.log('[Echo] Got response:', response);

            if (response?.comment) {
                await insertComment(post, response.comment);
            } else if (response?.error) {
                console.error('[Echo] API Error:', response.error);
                removeWatchingIndicator(post);
                removeThinkingState(post);
                showNotification(response.error, 'error');
            }
        } catch (error) {
            console.error('[Echo] Error processing post:', error);
            showNotification('Error generating comment', 'error');
            removeThinkingState(post);
            removeWatchingIndicator(post);
        }
    }

    // Extract data from a post
    async function extractPostData(post) {
        let authorName = '';
        let content = '';
        let hasImage = false;
        let imageData = null;

        // Get author name - try multiple selectors
        const authorSelectors = SELECTORS.authorName.split(', ');
        for (const selector of authorSelectors) {
            const authorEl = post.querySelector(selector);
            if (authorEl && authorEl.innerText.trim()) {
                authorName = authorEl.innerText.trim().split('\n')[0];
                break;
            }
        }

        // Get post content - try multiple selectors
        const bodySelectors = SELECTORS.postBody.split(', ');
        for (const selector of bodySelectors) {
            const bodyEl = post.querySelector(selector);
            if (bodyEl && bodyEl.innerText.trim()) {
                content = sanitizeContent(bodyEl.innerText);
                break;
            }
        }

        // Fallback: get any text from the post body area
        if (!content) {
            const fallbackEl = post.querySelector('.feed-shared-update-v2__description') ||
                post.querySelector('[class*="update-components-text"]');
            if (fallbackEl) {
                content = sanitizeContent(fallbackEl.innerText);
            }
        }

        // Extract image if present
        const imageExtractionResult = await extractImageFromPost(post);
        if (imageExtractionResult.hasImage) {
            hasImage = true;
            imageData = imageExtractionResult.imageData;
        }

        return { authorName, content, hasImage, imageData };
    }

    async function extractImageFromPost(post) {
        // Strategy 1: Single image
        const singleImage = post.querySelector('img.feed-shared-image__image');
        if (singleImage && singleImage.src) {
            console.log('[Echo] Found single image');
            return await captureImageAsBase64(singleImage);
        }

        // Strategy 2: Carousel (first slide only)
        const carouselImage = post.querySelector('.feed-shared-carousel__content img, .feed-shared-image-carousel img');
        if (carouselImage && carouselImage.src) {
            console.log('[Echo] Found carousel image');
            return await captureImageAsBase64(carouselImage);
        }

        return { hasImage: false, imageData: null };
    }

    async function captureImageAsBase64(imgElement) {
        try {
            if (typeof html2canvas === 'undefined') {
                console.warn('[Echo] html2canvas not loaded');
                return { hasImage: false, imageData: null };
            }

            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.left = '-9999px';
            container.style.width = '800px';
            container.style.height = 'auto';

            const img = imgElement.cloneNode(true);
            img.style.maxWidth = '800px';
            img.style.height = 'auto';
            container.appendChild(img);
            document.body.appendChild(container);

            await new Promise(resolve => {
                if (img.complete) resolve();
                else img.onload = resolve;
            });

            const canvas = await html2canvas(container, { backgroundColor: null, scale: 1 });
            document.body.removeChild(container);

            const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            return { hasImage: true, imageData: base64 };
        } catch (error) {
            console.error('[Echo] Image capture error:', error);
            return { hasImage: false, imageData: null };
        }
    }

    // Clean up post content
    function sanitizeContent(text) {
        return text
            .replace(/…see more/gi, '')
            .replace(/see more/gi, '')
            .replace(/…/g, '')
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 1500); // Limit content length
    }

    // Generate a unique ID for posts without data-urn
    function generatePostId(post) {
        const index = Array.from(document.querySelectorAll(SELECTORS.feedPost)).indexOf(post);
        return `echo-post-${index}-${Date.now()}`;
    }

    // Add watching indicator to post
    function addWatchingIndicator(post) {
        if (post.querySelector('.echo-watching')) return;

        const indicator = document.createElement('div');
        indicator.className = 'echo-watching';
        indicator.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z"/>
      </svg>
    `;
        indicator.title = 'Echo is reading this post';

        post.style.position = 'relative';
        post.appendChild(indicator);
    }

    function removeWatchingIndicator(post) {
        const indicator = post.querySelector('.echo-watching');
        if (indicator) indicator.remove();
    }

    function removeAllIndicators() {
        document.querySelectorAll('.echo-watching').forEach(el => el.remove());
        document.querySelectorAll('.echo-thinking').forEach(el => el.remove());
        document.querySelectorAll('.echo-retry-btn').forEach(el => el.remove());
    }

    // Open comment box for a post
    async function openCommentBox(post) {
        console.log('[Echo] Opening comment box...');

        // Try multiple selectors for comment button
        const buttonSelectors = SELECTORS.commentButton.split(', ');
        let commentBtn = null;

        for (const selector of buttonSelectors) {
            commentBtn = post.querySelector(selector);
            if (commentBtn) {
                console.log('[Echo] Found comment button with selector:', selector);
                break;
            }
        }

        // Fallback: find any button with "comment" in aria-label
        if (!commentBtn) {
            const allButtons = post.querySelectorAll('button');
            for (const btn of allButtons) {
                const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                const text = btn.textContent?.toLowerCase() || '';
                if (ariaLabel.includes('comment') || text.includes('comment')) {
                    commentBtn = btn;
                    console.log('[Echo] Found comment button via fallback search');
                    break;
                }
            }
        }

        if (!commentBtn) {
            console.log('[Echo] Comment button not found');
            return false;
        }

        // Random delay (1-3 seconds) to emulate human behavior
        await randomDelay(1000, 2000);

        // Click the comment button
        console.log('[Echo] Clicking comment button');
        commentBtn.click();

        // Wait for comment form to appear
        const formAppeared = await waitForCommentForm(post, 5000);
        console.log('[Echo] Comment form appeared:', formAppeared);

        return formAppeared;
    }

    // Wait for comment form with better detection
    async function waitForCommentForm(post, timeout = 5000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            // Check for comment editor
            const editorSelectors = [
                '.ql-editor',
                'div[contenteditable="true"][role="textbox"]',
                'div[data-placeholder*="comment"]',
                '.comments-comment-box__form div[contenteditable="true"]',
                '.comments-comment-texteditor div[contenteditable="true"]',
                'div[aria-label*="comment"][contenteditable="true"]'
            ];

            for (const selector of editorSelectors) {
                // Check in the entire document since comment box might be outside post
                const editor = document.querySelector(selector);
                if (editor && editor.offsetParent !== null) {
                    console.log('[Echo] Found editor with selector:', selector);
                    return true;
                }
            }

            await sleep(100);
        }

        return false;
    }

    // Show thinking state in comment box
    function showThinkingState(post) {
        // Find the comment editor anywhere on page
        const editor = findCommentEditor();
        if (!editor) {
            console.log('[Echo] Cannot show thinking state - editor not found');
            return;
        }

        // Add thinking placeholder
        const thinking = document.createElement('div');
        thinking.className = 'echo-thinking';
        thinking.innerHTML = 'Echo is thinking<span class="echo-dots">...</span>';

        const editorParent = editor.closest('.comments-comment-box') || editor.parentElement;
        if (editorParent) {
            editorParent.style.position = 'relative';
            editorParent.appendChild(thinking);
        }
    }

    function removeThinkingState(post) {
        document.querySelectorAll('.echo-thinking').forEach(el => el.remove());
    }

    // Find the active comment editor
    function findCommentEditor() {
        const selectors = [
            '.ql-editor[contenteditable="true"]',
            '.comments-comment-box div[contenteditable="true"]',
            '.comments-comment-texteditor div[contenteditable="true"]',
            'div[role="textbox"][contenteditable="true"]',
            'div[data-placeholder*="comment"][contenteditable="true"]'
        ];

        for (const selector of selectors) {
            const editor = document.querySelector(selector);
            if (editor && editor.offsetParent !== null) {
                return editor;
            }
        }
        return null;
    }

    // Insert comment into the editor using the QuillJS hack
    async function insertComment(post, comment) {
        console.log('[Echo] Inserting comment:', comment);

        removeWatchingIndicator(post);
        removeThinkingState(post);

        const editor = findCommentEditor();
        if (!editor) {
            console.log('[Echo] Comment editor not found for insertion');
            showNotification('Could not find comment editor', 'error');
            return;
        }

        console.log('[Echo] Found editor:', editor);

        // Random delay before typing (0.5-1 seconds)
        await randomDelay(500, 1000);

        // Focus the editor
        editor.focus();
        await sleep(100);

        // Clear any placeholder content
        const placeholderContent = ['<p><br></p>', '<br>', '<p></p>'];
        if (placeholderContent.includes(editor.innerHTML.trim()) || !editor.innerText.trim()) {
            editor.innerHTML = '';
        }

        // Try multiple insertion methods
        let insertionSuccess = false;

        // Method 1: execCommand (works with Quill)
        try {
            editor.focus();
            await sleep(50);
            insertionSuccess = document.execCommand('insertText', false, comment);
            console.log('[Echo] execCommand result:', insertionSuccess);
        } catch (e) {
            console.log('[Echo] execCommand failed:', e);
        }

        // Method 2: Direct innerHTML + events (if execCommand failed)
        if (!insertionSuccess || !editor.innerText.includes(comment.substring(0, 10))) {
            console.log('[Echo] Trying direct insertion method');
            editor.innerHTML = `<p>${comment}</p>`;

            // Dispatch input event
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: comment
            }));

            // Also try 'change' event
            editor.dispatchEvent(new Event('change', { bubbles: true }));

            // And 'keyup' for good measure
            editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
        }

        // Method 3: Simulate paste
        if (!editor.innerText.includes(comment.substring(0, 10))) {
            console.log('[Echo] Trying clipboard simulation');
            try {
                const clipboardData = new DataTransfer();
                clipboardData.setData('text/plain', comment);
                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: clipboardData
                });
                editor.dispatchEvent(pasteEvent);
            } catch (e) {
                console.log('[Echo] Paste simulation failed:', e);
            }
        }

        await sleep(200);

        // Verify insertion
        const inserted = editor.innerText.trim().length > 0;
        console.log('[Echo] Text inserted:', inserted, 'Content:', editor.innerText.substring(0, 50));

        if (inserted) {
            // Add completion visual cue
            showCompletionState(post);

            // Add retry button
            addRetryButton(post);

            // Log activity
            await logActivity(post);

            showNotification('Comment ready! Review and click Post.');
        } else {
            showNotification('Could not insert comment text', 'error');
        }
    }

    // Show completion state (green border)
    function showCompletionState(post) {
        const form = document.querySelector('.comments-comment-box') ||
            document.querySelector('.comments-comment-texteditor');
        if (!form) return;

        form.classList.add('echo-complete');

        setTimeout(() => {
            form.classList.remove('echo-complete');
        }, 3000);
    }

    // Add retry button
    function addRetryButton(post) {
        // Remove existing retry button
        document.querySelectorAll('.echo-retry-btn').forEach(el => el.remove());

        const form = document.querySelector('.comments-comment-box') ||
            document.querySelector('.comments-comment-texteditor');
        if (!form) return;

        const retryBtn = document.createElement('button');
        retryBtn.className = 'echo-retry-btn';
        retryBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="1 4 1 10 7 10"/>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
      </svg>
    `;
        retryBtn.title = 'Generate new comment';

        retryBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Clear editor
            const editor = findCommentEditor();
            if (editor) {
                editor.innerHTML = '<p><br></p>';
                editor.focus();
            }

            // Remove from processed to allow re-generation
            const postId = post.getAttribute(SELECTORS.postUrn) || '';
            processedPosts.delete(postId);

            // Re-trigger generation
            showThinkingState(post);

            const postData = extractPostData(post);
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'GENERATE_COMMENT',
                    postData,
                    quickTone,
                    retry: true
                });

                if (response?.comment) {
                    await insertComment(post, response.comment);
                }
            } catch (error) {
                console.error('[Echo] Retry error:', error);
                showNotification('Failed to regenerate comment', 'error');
                removeThinkingState(post);
            }
        });

        form.style.position = 'relative';
        form.appendChild(retryBtn);
    }

    // Log activity
    async function logActivity(post) {
        const postData = extractPostData(post);
        const authorName = postData.authorName || 'Someone';

        // Get current activity log
        const { activityLog } = await chrome.storage.local.get('activityLog');
        const log = activityLog || [];

        // Add new entry
        log.unshift({
            text: `Drafted comment for <strong>${authorName}</strong>`,
            timestamp: Date.now()
        });

        // Keep only last 10 items
        await chrome.storage.local.set({ activityLog: log.slice(0, 10) });

        // Notify popup to update
        chrome.runtime.sendMessage({ type: 'ACTIVITY_UPDATE' }).catch(() => { });
    }

    // Show notification
    function showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.querySelector('.echo-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `echo-notification echo-notification-${type}`;
        notification.textContent = message;

        document.getElementById('echo-extension-root')?.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('echo-notification-hide');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Utility: Random delay
    function randomDelay(min, max) {
        const delay = Math.random() * (max - min) + min;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // Utility: Sleep
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
