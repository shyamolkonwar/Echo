// Echo - Popup Script
// Handles UI interactions and storage management

class EchoPopup {
    constructor() {
        this.elements = {};
        this.currentPlatform = 'linkedin'; // Default state
        this.init();
    }

    async init() {
        // Migrate storage to v2 schema if needed
        await this.migrateStorageToV2();

        this.cacheElements();
        this.bindEvents();
        await this.loadSettings();
        await this.checkOnboarding();
        this.updateActivityLog();
        this.initPlatformBar();
        this.initSettingsNav();
    }

    cacheElements() {
        // Views
        this.elements.mainView = document.getElementById('main-view');
        this.elements.settingsView = document.getElementById('settings-view');
        this.elements.onboardingView = document.getElementById('onboarding-view');

        // Header controls
        this.elements.settingsBtn = document.getElementById('settings-btn');
        this.elements.backBtn = document.getElementById('back-btn');

        // Platform Bar
        this.elements.platformIcons = document.querySelectorAll('.platform-icon');
        this.elements.contextCards = document.querySelectorAll('.context-card');

        // Context Controls (Dynamic per platform)
        // We'll query these dynamically in methods since there are multiples

        // Footer
        this.elements.openDashboard = document.getElementById('open-dashboard');
        this.elements.activityLog = document.getElementById('activity-log');

        // Settings Modal Elements
        this.elements.settingsNavItems = document.querySelectorAll('.nav-item');
        this.elements.settingsSections = document.querySelectorAll('.settings-section');
        this.elements.saveSettings = document.getElementById('save-settings');
        this.elements.cancelSettings = document.getElementById('cancel-settings');

        // Form Inputs
        this.elements.apiKey = document.getElementById('api-key');
        this.elements.toggleKeyVisibility = document.getElementById('toggle-key-visibility');
        this.elements.apiFormat = document.getElementById('api-format');
        this.elements.apiEndpoint = document.getElementById('api-endpoint');
        this.elements.apiModel = document.getElementById('api-model');
        this.elements.accountType = document.getElementById('account-type');
        this.elements.profileIdentity = document.getElementById('profile-identity');
        this.elements.profileNarrative = document.getElementById('profile-narrative');
        this.elements.profileCommunicationStyle = document.getElementById('profile-communication-style');
        this.elements.profileWritingStyle = document.getElementById('profile-writing-style');
        this.elements.profileCommentStrategy = document.getElementById('profile-comment-strategy');
        this.elements.profileSignaturePhrases = document.getElementById('profile-signature-phrases');
        this.elements.profileBannedPhrases = document.getElementById('profile-banned-phrases');
        this.elements.profileVoiceExamples = document.getElementById('profile-voice-examples');

        // Platform Configs
        this.elements.linkedinLength = document.getElementById('linkedin-length');
        this.elements.linkedinCreatorsOnly = document.getElementById('linkedin-creators-only');

        this.elements.subredditFilter = document.getElementById('subreddit-filter');
        this.elements.subredditBlacklist = document.getElementById('subreddit-blacklist');
        this.elements.redditIgnoreHiring = document.getElementById('reddit-ignore-hiring');

        this.elements.xBlacklist = document.getElementById('x-blacklist');

        // System Configs
        this.elements.delayTimer = document.getElementById('delay-timer');
        this.elements.scrollSpeed = document.getElementById('scroll-speed');

        // Onboarding
        this.elements.onboardingSteps = document.querySelectorAll('.onboarding-step');
        this.elements.onboardApiFormat = document.getElementById('onboard-api-format');
        this.elements.onboardApiKey = document.getElementById('onboard-api-key');
        this.elements.onboardApiEndpoint = document.getElementById('onboard-api-endpoint');
        this.elements.onboardApiModel = document.getElementById('onboard-api-model');
        this.elements.completeOnboarding = document.getElementById('complete-onboarding');
    }

    bindEvents() {
        // Settings Toggle
        this.elements.settingsBtn?.addEventListener('click', () => this.toggleSettings(true));
        this.elements.backBtn?.addEventListener('click', () => this.toggleSettings(false));
        this.elements.cancelSettings?.addEventListener('click', () => this.toggleSettings(false));
        this.elements.saveSettings?.addEventListener('click', () => this.saveSettings());

        // API Key Visibility
        this.elements.toggleKeyVisibility?.addEventListener('click', () => this.toggleKeyVisibility());

        // Open Dashboard
        this.elements.openDashboard?.addEventListener('click', () => this.openDashboard());

        // Onboarding Navigation
        document.querySelectorAll('[data-next]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nextStep = e.target.getAttribute('data-next');
                this.showOnboardingStep(nextStep);
            });
        });

        // Complete Onboarding
        this.elements.completeOnboarding?.addEventListener('click', () => this.completeOnboarding());

        // Platform Context Controls (Delegate event handling)
        document.body.addEventListener('change', (e) => {
            if (e.target.matches('#master-toggle')) this.handleMasterToggle(e);
            if (e.target.matches('#autopilot-toggle')) this.handleAutopilotToggle(e, 'linkedin');
            if (e.target.matches('.reddit-master-toggle')) this.handleMasterToggle(e); // Treat as same for now or separate
            if (e.target.matches('.reddit-autopilot-toggle')) this.handleAutopilotToggle(e, 'reddit');
        });

        // Settings Navigation
        this.elements.settingsNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.getAttribute('data-section');
                if (section) this.showSettingsSection(section);
            });
        });
    }

    // ==================== VIEW MANAGEMENT ====================

    toggleSettings(show) {
        if (show) {
            this.elements.settingsView.classList.add('active');
            this.elements.mainView.style.display = 'none';
        } else {
            this.elements.settingsView.classList.remove('active');
            this.elements.mainView.style.display = 'block';
        }
    }

    showView(viewName) {
        // Reset all views
        this.elements.mainView.classList.remove('active');
        this.elements.onboardingView.classList.remove('active');
        this.elements.settingsView.classList.remove('active');

        if (viewName === 'onboarding') {
            this.elements.onboardingView.classList.add('active');
        } else if (viewName === 'main') {
            this.elements.mainView.classList.add('active');
            this.elements.mainView.style.display = 'block';
        }
    }

    initSettingsNav() {
        // Handled in bindEvents via delegate or direct bind
    }

    showSettingsSection(sectionId) {
        // Update Nav State
        this.elements.settingsNavItems.forEach(item => {
            if (item.getAttribute('data-section') === sectionId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update Section Visibility
        this.elements.settingsSections.forEach(sec => {
            if (sec.getAttribute('data-section') === sectionId) {
                sec.classList.add('active');
            } else {
                sec.classList.remove('active');
            }
        });
    }

    // ==================== PLATFORM BAR ====================

    async initPlatformBar() {
        this.elements.platformIcons.forEach(icon => {
            icon.addEventListener('click', async (e) => {
                const platform = e.currentTarget.getAttribute('data-platform');
                await this.switchPlatform(platform);
            });
        });

        // Auto-detect currently active tab
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.url) {
                if (tab.url.includes('reddit.com')) {
                    await this.switchPlatform('reddit');
                } else if (tab.url.includes('x.com') || tab.url.includes('twitter.com')) {
                    await this.switchPlatform('x');
                } else {
                    await this.switchPlatform('linkedin');
                }
            } else {
                await this.switchPlatform('linkedin'); // Default
            }
        } catch (err) {
            await this.switchPlatform('linkedin');
        }
    }

    async switchPlatform(platform) {
        this.currentPlatform = platform;

        // Update Icons
        this.elements.platformIcons.forEach(icon => {
            if (icon.getAttribute('data-platform') === platform) {
                icon.classList.add('active');
            } else {
                icon.classList.remove('active');
            }
        });

        // Update Context Cards
        this.elements.contextCards.forEach(card => {
            if (card.getAttribute('data-platform') === platform) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });

        // Save selection
        await chrome.storage.local.set({ currentPlatform: platform });
    }


    // ==================== SETTINGS LOGIC ====================

    async loadSettings() {
        const data = await chrome.storage.local.get([
            'apiKey', 'apiFormat', 'apiEndpoint', 'apiModel', 'userProfile', 'platforms', 'isActive', 'delayTimer', 'scrollSpeed'
        ]);

        const platforms = data.platforms || {
            linkedin: { enabled: true, autopilot: false, responseLength: 2 },
            reddit: { enabled: true, autopilot: false, subreddits: [] },
            x: { enabled: true, blacklist: [] }
        };

        // 1. General Settings
        if (this.elements.apiKey) this.elements.apiKey.value = data.apiKey || '';

        if (this.elements.apiFormat) this.elements.apiFormat.value = data.apiFormat || 'openai-compatible';
        if (this.elements.apiEndpoint) this.elements.apiEndpoint.value = data.apiEndpoint || '';
        if (this.elements.apiModel) this.elements.apiModel.value = data.apiModel || '';

        const userProfile = {
            accountType: 'personal',
            identity: '',
            narrative: '',
            communicationStyle: '',
            writingStyle: '',
            commentStrategy: '',
            signaturePhrases: '',
            bannedPhrases: '',
            voiceExamples: '',
            ...(data.userProfile || {})
        };
        if (this.elements.accountType) this.elements.accountType.value = userProfile.accountType;
        if (this.elements.profileIdentity) this.elements.profileIdentity.value = userProfile.identity;
        if (this.elements.profileNarrative) this.elements.profileNarrative.value = userProfile.narrative;
        if (this.elements.profileCommunicationStyle) this.elements.profileCommunicationStyle.value = userProfile.communicationStyle;
        if (this.elements.profileWritingStyle) this.elements.profileWritingStyle.value = userProfile.writingStyle;
        if (this.elements.profileCommentStrategy) this.elements.profileCommentStrategy.value = userProfile.commentStrategy;
        if (this.elements.profileSignaturePhrases) this.elements.profileSignaturePhrases.value = userProfile.signaturePhrases;
        if (this.elements.profileBannedPhrases) this.elements.profileBannedPhrases.value = userProfile.bannedPhrases;
        if (this.elements.profileVoiceExamples) this.elements.profileVoiceExamples.value = userProfile.voiceExamples;

        if (this.elements.delayTimer) this.elements.delayTimer.value = data.delayTimer || 2;
        if (this.elements.scrollSpeed) this.elements.scrollSpeed.value = data.scrollSpeed || 2;

        // 2. LinkedIn Configs
        if (platforms.linkedin) {
            this.elements.linkedinLength.value = platforms.linkedin.responseLength || 2;
            if (this.elements.linkedinCreatorsOnly) {
                this.elements.linkedinCreatorsOnly.checked = platforms.linkedin.creatorsOnly || false;
            }
        }

        // 3. Reddit Configs
        if (platforms.reddit) {
            this.elements.subredditFilter.value = (platforms.reddit.subreddits || []).join(', ');
            this.elements.subredditBlacklist.value = (platforms.reddit.blacklist || []).join(', ');
            if (this.elements.redditIgnoreHiring) {
                this.elements.redditIgnoreHiring.checked = platforms.reddit.ignoreHiring || false;
            }
        }

        // 4. Update Context Controls (Toggles)
        const masterToggle = document.getElementById('master-toggle');
        if (masterToggle) masterToggle.checked = data.isActive || false;
        this.updateStatusIndicator(data.isActive || false);

        // Autopilot Toggle (LinkedIn only - Reddit no longer has autopilot)
        const webAutopilot = document.getElementById('autopilot-toggle');
        if (webAutopilot && platforms.linkedin) webAutopilot.checked = platforms.linkedin.autopilot || false;

        // 5. X Configs
        if (platforms.x) {
            if (this.elements.xBlacklist) this.elements.xBlacklist.value = (platforms.x.blacklist || []).join(', ');
        }
    }

    async saveSettings() {
        const apiKey = this.elements.apiKey.value.trim();
        const apiFormat = this.elements.apiFormat.value;
        const apiEndpoint = this.elements.apiEndpoint.value.trim();
        const apiModel = this.elements.apiModel.value.trim();
        const delayTimer = parseInt(this.elements.delayTimer.value) || 2;
        const scrollSpeed = parseInt(this.elements.scrollSpeed.value) || 2;

        if (!apiKey || !apiEndpoint) {
            this.showToast('Add both an API key and complete endpoint URL.', 'error');
            return;
        }

        const userProfile = {
            accountType: this.elements.accountType?.value || 'personal',
            identity: this.elements.profileIdentity?.value?.trim() || '',
            narrative: this.elements.profileNarrative?.value?.trim() || '',
            communicationStyle: this.elements.profileCommunicationStyle?.value?.trim() || '',
            writingStyle: this.elements.profileWritingStyle?.value?.trim() || '',
            commentStrategy: this.elements.profileCommentStrategy?.value?.trim() || '',
            signaturePhrases: this.elements.profileSignaturePhrases?.value?.trim() || '',
            bannedPhrases: this.elements.profileBannedPhrases?.value?.trim() || '',
            voiceExamples: this.elements.profileVoiceExamples?.value?.trim() || ''
        };

        if (!await this.requestEndpointPermission(apiEndpoint)) return;

        // Get existing platforms data to merge
        const { platforms } = await chrome.storage.local.get('platforms');
        const updatedPlatforms = platforms || { linkedin: {}, reddit: {} };

        // Update LinkedIn
        updatedPlatforms.linkedin = {
            ...updatedPlatforms.linkedin,
            responseLength: parseInt(this.elements.linkedinLength.value) || 2,
            creatorsOnly: this.elements.linkedinCreatorsOnly.checked
        };

        // Update Reddit
        updatedPlatforms.reddit = {
            ...updatedPlatforms.reddit,
            subreddits: this.elements.subredditFilter.value.split(',').map(s => s.trim()).filter(Boolean),
            blacklist: this.elements.subredditBlacklist.value.split(',').map(s => s.trim()).filter(Boolean),
            ignoreHiring: this.elements.redditIgnoreHiring.checked
        };

        // Update X
        updatedPlatforms.x = {
            ...updatedPlatforms.x,
            blacklist: this.elements.xBlacklist?.value?.split(',').map(s => s.trim()).filter(Boolean) || []
        };

        await chrome.storage.local.set({
            apiKey,
            apiFormat,
            apiEndpoint,
            apiModel,
            userProfile,
            delayTimer,
            scrollSpeed,
            platforms: updatedPlatforms
        });

        this.showToast('Settings saved successfully!');
        this.toggleSettings(false);
    }

    async requestEndpointPermission(endpoint) {
        let url;
        try {
            url = new URL(endpoint);
        } catch {
            this.showToast('Enter a valid HTTP or HTTPS endpoint URL.', 'error');
            return false;
        }

        if (!['https:', 'http:'].includes(url.protocol)) {
            this.showToast('The endpoint must use HTTP or HTTPS.', 'error');
            return false;
        }

        const originPattern = `${url.protocol}//${url.hostname}/*`;
        try {
            const granted = await chrome.permissions.request({ origins: [originPattern] });
            if (!granted) {
                this.showToast('Endpoint access was not granted.', 'error');
            }
            return granted;
        } catch (error) {
            console.error('[Popup] Endpoint permission error:', error);
            this.showToast('Could not request access to that endpoint.', 'error');
            return false;
        }
    }

    // ==================== INTERACTION HANDLERS ====================

    async handleMasterToggle(e) {
        const isActive = e.target.checked;
        await chrome.storage.local.set({ isActive });
        this.updateStatusIndicator(isActive);

        // Notify Content Script
        this.sendMessageToActiveTab({ type: 'TOGGLE_ACTIVE', isActive });
    }

    async handleAutopilotToggle(e, platform) {
        const isAutoPilot = e.target.checked;

        // Update storage
        const { platforms } = await chrome.storage.local.get('platforms');
        if (platforms && platforms[platform]) {
            platforms[platform].autopilot = isAutoPilot;
            await chrome.storage.local.set({ platforms });
        }

        // Notify Content Script
        this.sendMessageToActiveTab({ type: 'TOGGLE_AUTOPILOT', isAutoPilot, platform });

        if (isAutoPilot) {
            this.showToast(`${platform === 'linkedin' ? 'LinkedIn' : 'Reddit'} Auto-Pilot Enabled`);
        }
    }


    // ==================== UTILS ====================

    updateStatusIndicator(isActive) {
        const indicator = document.getElementById('status-indicator');
        const text = indicator?.querySelector('.status-text');

        // Also update Reddit status indicator if visible
        const redditIndicator = document.getElementById('reddit-status-indicator');
        const redditText = redditIndicator?.querySelector('.status-text');

        if (isActive) {
            indicator?.classList.add('active');
            if (text) text.textContent = 'ACTIVE';

            redditIndicator?.classList.add('active');
            if (redditText) redditText.textContent = 'ACTIVE';
        } else {
            indicator?.classList.remove('active');
            if (text) text.textContent = 'PAUSED';

            redditIndicator?.classList.remove('active');
            if (redditText) redditText.textContent = 'PAUSED';
        }
    }

    async sendMessageToActiveTab(message) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                chrome.tabs.sendMessage(tab.id, message).catch(() => {
                    // Content script might not be loaded, which is expected on non-supported pages
                });
            }
        } catch (err) {
            // Ignore errors
        }
    }

    showToast(message, type = 'success') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        if (type === 'error') toast.style.background = '#DC2626';

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    toggleKeyVisibility() {
        const input = this.elements.apiKey;
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    }


    openDashboard() {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    }

    async updateActivityLog() {
        const { activityLog } = await chrome.storage.local.get('activityLog');
        const log = activityLog || [];

        if (!this.elements.activityLog) return;

        if (log.length === 0) {
            this.elements.activityLog.innerHTML = '<div class="activity-empty">No activity yet. Enable Echo and browse LinkedIn.</div>';
            return;
        }

        const html = log.slice(0, 5).map(item => `
            <div class="activity-item">
                <svg class="activity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div>
                   <div class="activity-text">${item.text}</div>
                   <div class="activity-time">${this.formatTime(item.timestamp)}</div>
                </div>
            </div>
        `).join('');

        this.elements.activityLog.innerHTML = html;
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    // ==================== ONBOARDING ====================
    async checkOnboarding() {
        const { onboardingComplete } = await chrome.storage.local.get('onboardingComplete');
        if (!onboardingComplete) {
            this.showView('onboarding');
        }
    }

    showOnboardingStep(step) {
        this.elements.onboardingSteps.forEach(el => el.style.display = 'none');
        const stepEl = document.querySelector(`.onboarding-step[data-step="${step}"]`);
        if (stepEl) stepEl.style.display = 'block';
    }

    async completeOnboarding() {
        const apiKey = this.elements.onboardApiKey.value.trim();
        const apiFormat = this.elements.onboardApiFormat.value;
        const apiEndpoint = this.elements.onboardApiEndpoint.value.trim();
        const apiModel = this.elements.onboardApiModel.value.trim();

        if (!apiKey || !apiEndpoint) {
            this.showToast('Add both an API key and complete endpoint URL.', 'error');
            this.showOnboardingStep('2');
            return;
        }

        if (!await this.requestEndpointPermission(apiEndpoint)) return;

        // Initialize v2 schema
        const settings = {
            apiKey,
            apiFormat,
            apiEndpoint,
            apiModel,
            userProfile: {
                accountType: 'personal',
                identity: '',
                narrative: '',
                communicationStyle: '',
                writingStyle: '',
                commentStrategy: '',
                signaturePhrases: '',
                bannedPhrases: '',
                voiceExamples: ''
            },
            onboardingComplete: true,
            isActive: true,
            platforms: {
                linkedin: { enabled: true, autopilot: false, responseLength: 2 },
                reddit: { enabled: true, autopilot: false, subreddits: [] },
                x: { enabled: true, blacklist: [] }
            }
        };

        await chrome.storage.local.set(settings);
        this.showToast('Setup complete!');
        this.showView('main');
        await this.loadSettings();
    }

    // ==================== MIGRATION ====================
    async migrateStorageToV2() {
        const current = await chrome.storage.local.get([
            'apiFormat', 'apiEndpoint', 'apiModel', 'userProfile', 'platforms'
        ]);
        const existing = current.platforms || {};
        const newSchema = {
            apiFormat: current.apiFormat || 'openai-compatible',
            apiEndpoint: current.apiEndpoint || '',
            apiModel: current.apiModel || '',
            userProfile: {
                accountType: current.userProfile?.accountType || 'personal',
                identity: current.userProfile?.identity || '',
                narrative: current.userProfile?.narrative || '',
                communicationStyle: current.userProfile?.communicationStyle || '',
                writingStyle: current.userProfile?.writingStyle || '',
                commentStrategy: current.userProfile?.commentStrategy || '',
                signaturePhrases: current.userProfile?.signaturePhrases || '',
                bannedPhrases: current.userProfile?.bannedPhrases || '',
                voiceExamples: current.userProfile?.voiceExamples || ''
            },
            platforms: {
                linkedin: {
                    enabled: existing.linkedin?.enabled ?? true,
                    autopilot: existing.linkedin?.autopilot ?? false,
                    responseLength: existing.linkedin?.responseLength || 2,
                    creatorsOnly: existing.linkedin?.creatorsOnly ?? false
                },
                reddit: {
                    enabled: existing.reddit?.enabled ?? true,
                    autopilot: false,
                    subreddits: existing.reddit?.subreddits || [],
                    blacklist: existing.reddit?.blacklist || [],
                    ignoreHiring: existing.reddit?.ignoreHiring ?? false
                },
                x: {
                    enabled: existing.x?.enabled ?? true,
                    blacklist: existing.x?.blacklist || []
                }
            }
        };

        await chrome.storage.local.set(newSchema);
        await chrome.storage.local.remove([
            'apiProvider', 'azureBaseUrl', 'azureModel', 'selectedSkill', 'commentAgentMemory',
            'quickTone', 'redditQuickTone', 'xQuickTone', 'userTone', 'voiceDna'
        ]);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.echoPopup = new EchoPopup();
});
