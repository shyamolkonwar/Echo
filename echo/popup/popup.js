// Echo Chrome Extension - Popup Script
// Handles UI interactions and storage management

class EchoPopup {
    constructor() {
        this.elements = {};
        this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.loadSettings();
        await this.checkOnboarding();
        this.updateActivityLog();
    }

    cacheElements() {
        // Views
        this.elements.mainView = document.getElementById('main-view');
        this.elements.settingsView = document.getElementById('settings-view');
        this.elements.onboardingView = document.getElementById('onboarding-view');

        // Header
        this.elements.settingsBtn = document.getElementById('settings-btn');
        this.elements.backBtn = document.getElementById('back-btn');

        // Main View
        this.elements.statusIndicator = document.getElementById('status-indicator');
        this.elements.masterToggle = document.getElementById('master-toggle');
        this.elements.autopilotIndicator = document.getElementById('autopilot-indicator');
        this.elements.autopilotToggle = document.getElementById('autopilot-toggle');
        this.elements.openDashboard = document.getElementById('open-dashboard');
        this.elements.activityLog = document.getElementById('activity-log');
        this.elements.toneOptions = document.querySelectorAll('input[name="quick-tone"]');

        // Settings
        this.elements.apiKey = document.getElementById('api-key');
        this.elements.toggleKeyVisibility = document.getElementById('toggle-key-visibility');
        this.elements.apiProvider = document.querySelectorAll('input[name="api-provider"]');
        this.elements.userTone = document.getElementById('user-tone');
        this.elements.responseLength = document.getElementById('response-length');
        this.elements.delayTimer = document.getElementById('delay-timer');
        this.elements.saveSettings = document.getElementById('save-settings');

        // Platform Selector
        this.elements.platformOptions = document.querySelectorAll('input[name="platform"]');
        this.elements.redditSettings = document.getElementById('reddit-settings');
        this.elements.subredditInput = document.getElementById('subreddit-input');

        // Onboarding
        this.elements.onboardingSteps = document.querySelectorAll('.onboarding-step');
        this.elements.onboardProvider = document.getElementById('onboard-provider');
        this.elements.onboardApiKey = document.getElementById('onboard-api-key');
        this.elements.onboardVoice = document.getElementById('onboard-voice');
        this.elements.completeOnboarding = document.getElementById('complete-onboarding');
    }

    bindEvents() {
        // Navigation
        this.elements.settingsBtn.addEventListener('click', () => this.showView('settings'));
        this.elements.backBtn.addEventListener('click', () => this.showView('main'));

        // Master Toggle
        this.elements.masterToggle.addEventListener('change', (e) => this.handleToggle(e));

        // Quick Tone
        this.elements.toneOptions.forEach(option => {
            option.addEventListener('change', (e) => this.handleToneChange(e));
        });

        // API Key Visibility
        this.elements.toggleKeyVisibility.addEventListener('click', () => this.toggleKeyVisibility());

        // Save Settings
        this.elements.saveSettings.addEventListener('click', () => this.saveSettings());

        // Auto-Pilot Toggle
        this.elements.autopilotToggle.addEventListener('change', (e) => this.handleAutoPilotToggle(e));

        // Open Dashboard
        this.elements.openDashboard.addEventListener('click', () => this.openDashboard());

        // Onboarding Navigation
        document.querySelectorAll('[data-next]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nextStep = e.target.getAttribute('data-next');
                this.showOnboardingStep(nextStep);
            });
        });

        // Complete Onboarding
        this.elements.completeOnboarding.addEventListener('click', () => this.completeOnboarding());

        // Platform Selector
        this.elements.platformOptions.forEach(option => {
            option.addEventListener('change', (e) => this.handlePlatformChange(e));
        });

        // Subreddit Input (auto-save on blur)
        if (this.elements.subredditInput) {
            this.elements.subredditInput.addEventListener('blur', () => this.saveRedditSettings());
        }
    }

    showView(view) {
        this.elements.mainView.classList.remove('active');
        this.elements.settingsView.classList.remove('active');
        this.elements.onboardingView.classList.remove('active');

        if (view === 'main') {
            this.elements.mainView.classList.add('active');
        } else if (view === 'settings') {
            this.elements.settingsView.classList.add('active');
        } else if (view === 'onboarding') {
            this.elements.onboardingView.classList.add('active');
        }
    }

    async checkOnboarding() {
        const { onboardingComplete } = await chrome.storage.local.get('onboardingComplete');
        if (!onboardingComplete) {
            this.showView('onboarding');
        }
    }

    showOnboardingStep(step) {
        this.elements.onboardingSteps.forEach(el => {
            el.style.display = 'none';
        });
        const stepEl = document.querySelector(`.onboarding-step[data-step="${step}"]`);
        if (stepEl) {
            stepEl.style.display = 'block';
        }
    }

    async completeOnboarding() {
        const apiKey = this.elements.onboardApiKey.value.trim();
        const provider = this.elements.onboardProvider.value;
        const voice = this.elements.onboardVoice.value.trim();

        if (!apiKey) {
            this.showToast('Please enter your API key', 'error');
            this.showOnboardingStep('2');
            return;
        }

        if (!voice) {
            this.showToast('Please describe your voice', 'error');
            return;
        }

        // Save settings
        await chrome.storage.local.set({
            apiKey: apiKey,
            apiProvider: provider,
            userTone: voice,
            responseLength: 2,
            delayTimer: 2,
            isActive: false,
            quickTone: 'professional',
            onboardingComplete: true
        });

        this.showToast('Setup complete! Welcome to Echo.');
        this.showView('main');
        await this.loadSettings();
    }

    async loadSettings() {
        const settings = await chrome.storage.local.get([
            'apiKey',
            'apiProvider',
            'userTone',
            'voiceDna',  // Keep for migration
            'responseLength',
            'delayTimer',
            'isActive',
            'isAutoPilot',
            'quickTone',
            'platform',
            'reddit_watched_subreddits'
        ]);

        // Populate settings form
        if (settings.apiKey) {
            this.elements.apiKey.value = settings.apiKey;
        }

        if (settings.apiProvider) {
            this.elements.apiProvider.forEach(radio => {
                radio.checked = radio.value === settings.apiProvider;
            });
        }

        // Load userTone (fallback to voiceDna for migration)
        const userTone = settings.userTone || settings.voiceDna || '';
        if (this.elements.userTone) {
            this.elements.userTone.value = userTone;
        }

        if (settings.responseLength) {
            this.elements.responseLength.value = settings.responseLength;
        }

        if (settings.delayTimer) {
            this.elements.delayTimer.value = settings.delayTimer;
        }

        // Set toggle state
        this.elements.masterToggle.checked = settings.isActive || false;
        this.updateStatusIndicator(settings.isActive || false);

        // Set autopilot toggle state
        if (this.elements.autopilotToggle) {
            this.elements.autopilotToggle.checked = settings.isAutoPilot || false;
        }

        // Set quick tone
        if (settings.quickTone) {
            this.elements.toneOptions.forEach(option => {
                option.checked = option.value === settings.quickTone;
            });
        }

        // Set platform
        const platform = settings.platform || 'linkedin';
        this.elements.platformOptions.forEach(option => {
            option.checked = option.value === platform;
        });

        // Show/hide Reddit settings
        if (this.elements.redditSettings) {
            this.elements.redditSettings.style.display = platform === 'reddit' ? 'block' : 'none';
        }

        // Load Reddit subreddits
        if (settings.reddit_watched_subreddits && this.elements.subredditInput) {
            this.elements.subredditInput.value = settings.reddit_watched_subreddits.join(', ');
        }
    }

    async saveSettings() {
        const apiKey = this.elements.apiKey.value.trim();
        const apiProvider = Array.from(this.elements.apiProvider).find(r => r.checked)?.value || 'openai';
        const userTone = this.elements.userTone?.value.trim() || '';
        const responseLength = parseInt(this.elements.responseLength.value);
        const delayTimer = parseInt(this.elements.delayTimer.value);

        if (!apiKey) {
            this.showToast('Please enter your API key', 'error');
            return;
        }

        await chrome.storage.local.set({
            apiKey,
            apiProvider,
            userTone,
            responseLength,
            delayTimer
        });

        this.showToast('Settings saved!');
        this.showView('main');
    }

    async handleToggle(e) {
        const isActive = e.target.checked;
        await chrome.storage.local.set({ isActive });
        this.updateStatusIndicator(isActive);

        // Notify content script
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const platform = tab?.url?.includes('reddit.com') ? 'reddit' : 'linkedin';

            if (tab?.id && (tab?.url?.includes('linkedin.com') || tab?.url?.includes('reddit.com'))) {
                chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ACTIVE', isActive }).catch(() => {
                    // Content script not loaded on this page, which is fine
                });
            }
        } catch (err) {
            // Tab query failed, ignore
        }

        this.addActivity(isActive ? 'Echo activated' : 'Echo paused');
    }

    updateStatusIndicator(isActive) {
        if (isActive) {
            this.elements.statusIndicator.classList.add('active');
            this.elements.statusIndicator.querySelector('.status-text').textContent = 'ACTIVE';
        } else {
            this.elements.statusIndicator.classList.remove('active');
            this.elements.statusIndicator.querySelector('.status-text').textContent = 'PAUSED';
        }
    }

    async handleToneChange(e) {
        const quickTone = e.target.value;
        await chrome.storage.local.set({ quickTone });

        // Notify content script
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id && (tab?.url?.includes('linkedin.com') || tab?.url?.includes('reddit.com'))) {
                chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_TONE', quickTone }).catch(() => {
                    // Content script not loaded
                });
            }
        } catch (err) {
            // Ignore
        }
    }

    async handlePlatformChange(e) {
        const platform = e.target.value;
        await chrome.storage.local.set({ platform });

        // Show/hide Reddit settings
        if (this.elements.redditSettings) {
            this.elements.redditSettings.style.display = platform === 'reddit' ? 'block' : 'none';
        }

        this.showToast(`Platform switched to ${platform === 'reddit' ? 'Reddit' : 'LinkedIn'}`);
    }

    async saveRedditSettings() {
        if (!this.elements.subredditInput) return;

        const input = this.elements.subredditInput.value.trim();
        const subreddits = input
            .split(',')
            .map(s => s.trim().toLowerCase().replace(/^r\//, ''))
            .filter(s => s.length > 0);

        await chrome.storage.local.set({ reddit_watched_subreddits: subreddits });
        this.showToast('Subreddits saved!');
    }

    async handleAutoPilotToggle(e) {
        const isAutoPilot = e.target.checked;
        await chrome.storage.local.set({ isAutoPilot });

        // Notify content script to start/stop auto-pilot
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const isSupported = tab?.url?.includes('linkedin.com') || tab?.url?.includes('reddit.com');

            if (tab?.id && isSupported) {
                chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_AUTOPILOT', isAutoPilot }).catch(() => {
                    this.showToast('Open a supported platform to use Auto-Pilot', 'error');
                    e.target.checked = false;
                });
            } else {
                this.showToast('Open LinkedIn or Reddit to use Auto-Pilot', 'error');
                e.target.checked = false;
                await chrome.storage.local.set({ isAutoPilot: false });
            }
        } catch (err) {
            this.showToast('Failed to start Auto-Pilot', 'error');
        }

        if (isAutoPilot) {
            this.showToast('Auto-Pilot started! Scroll your feed.');
        }
    }

    openDashboard() {
        chrome.tabs.create({
            url: chrome.runtime.getURL('dashboard/dashboard.html')
        });
    }

    toggleKeyVisibility() {
        const input = this.elements.apiKey;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
    }

    async updateActivityLog() {
        const { activityLog } = await chrome.storage.local.get('activityLog');
        const log = activityLog || [];

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

    async addActivity(text) {
        const { activityLog } = await chrome.storage.local.get('activityLog');
        const log = activityLog || [];

        log.unshift({
            text,
            timestamp: Date.now()
        });

        // Keep only last 10 items
        await chrome.storage.local.set({ activityLog: log.slice(0, 10) });
        this.updateActivityLog();
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    showToast(message, type = 'success') {
        // Remove existing toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;

        if (type === 'error') {
            toast.style.background = '#DC2626';
        }

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// Listen for activity updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ACTIVITY_UPDATE') {
        const popup = window.echoPopup;
        if (popup) {
            popup.updateActivityLog();
        }
    }
});

// Initialize popup
window.echoPopup = new EchoPopup();
