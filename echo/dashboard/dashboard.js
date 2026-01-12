// Echo Dashboard - Command Center (No Supabase)
// All data stored locally in chrome.storage.local

class EchoDashboard {
    constructor() {
        this.elements = {};
        this.chart = null;
        this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.loadSettings();
        await this.loadStats();
        await this.loadCreators();
        await this.loadActivityLogs();
        this.updateChart();
    }

    cacheElements() {
        // Navigation
        this.elements.navItems = document.querySelectorAll('.nav-item');
        this.elements.tabContents = document.querySelectorAll('.tab-content');

        // Stats
        this.elements.totalComments = document.getElementById('total-comments');
        this.elements.timeSaved = document.getElementById('time-saved');
        this.elements.creatorsCount = document.getElementById('creators-count');
        this.elements.autoPilotStatus = document.getElementById('auto-pilot-status');
        this.elements.logsBody = document.getElementById('logs-body');

        // Creators
        this.elements.creatorName = document.getElementById('creator-name');
        this.elements.creatorUrl = document.getElementById('creator-url');
        this.elements.creatorPriority = document.getElementById('creator-priority');
        this.elements.addCreatorBtn = document.getElementById('add-creator-btn');
        this.elements.creatorsList = document.getElementById('creators-list');

        // Settings
        this.elements.dailyLimit = document.getElementById('daily-limit');
        this.elements.dailyCount = document.getElementById('daily-count');
        this.elements.dailyCountLimit = document.getElementById('daily-count-limit');
        this.elements.saveSettings = document.getElementById('save-settings');
        this.elements.exportData = document.getElementById('export-data');
        this.elements.clearLogs = document.getElementById('clear-logs');
        this.elements.resetDaily = document.getElementById('reset-daily');
    }

    bindEvents() {
        // Tab navigation
        this.elements.navItems.forEach(item => {
            item.addEventListener('click', () => this.switchTab(item.dataset.tab));
        });

        // Creators
        if (this.elements.addCreatorBtn) {
            this.elements.addCreatorBtn.addEventListener('click', () => this.addCreator());
        }

        // Settings
        if (this.elements.saveSettings) {
            this.elements.saveSettings.addEventListener('click', () => this.saveSettings());
        }
        if (this.elements.exportData) {
            this.elements.exportData.addEventListener('click', () => this.exportData());
        }
        if (this.elements.clearLogs) {
            this.elements.clearLogs.addEventListener('click', () => this.clearLogs());
        }
        if (this.elements.resetDaily) {
            this.elements.resetDaily.addEventListener('click', () => this.resetDailyCount());
        }
    }

    switchTab(tabId) {
        // Update nav
        this.elements.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabId);
        });

        // Update content
        this.elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabId}-tab`);
        });

        // Load tab-specific data
        if (tabId === 'stats') {
            this.loadActivityLogs();
            this.updateChart();
        } else if (tabId === 'creators') {
            this.loadCreators();
        }
    }

    // ==================== SETTINGS ====================
    async loadSettings() {
        const settings = await chrome.storage.local.get([
            'dailyLimit',
            'dailyCommentCount',
            'dailyCountDate',
            'isAutoPilot'
        ]);

        // Daily limit
        if (this.elements.dailyLimit) {
            this.elements.dailyLimit.value = settings.dailyLimit || 30;
        }

        // Auto-pilot status
        if (this.elements.autoPilotStatus) {
            this.elements.autoPilotStatus.textContent = settings.isAutoPilot ? 'ON' : 'OFF';
        }

        // Update daily count display
        this.updateDailyCountDisplay(settings);
    }

    updateDailyCountDisplay(settings) {
        const today = new Date().toDateString();
        const isToday = settings.dailyCountDate === today;
        const count = isToday ? (settings.dailyCommentCount || 0) : 0;
        const limit = settings.dailyLimit || 30;

        if (this.elements.dailyCount) {
            this.elements.dailyCount.textContent = count;
        }
        if (this.elements.dailyCountLimit) {
            this.elements.dailyCountLimit.textContent = limit;
        }
    }

    async saveSettings() {
        const dailyLimit = parseInt(this.elements.dailyLimit?.value) || 30;

        await chrome.storage.local.set({ dailyLimit });

        if (this.elements.dailyCountLimit) {
            this.elements.dailyCountLimit.textContent = dailyLimit;
        }

        this.showToast('Settings saved!', 'success');
    }

    async resetDailyCount() {
        await chrome.storage.local.set({
            dailyCommentCount: 0,
            dailyCountDate: new Date().toDateString()
        });

        if (this.elements.dailyCount) {
            this.elements.dailyCount.textContent = '0';
        }

        this.showToast('Daily count reset!', 'success');
    }

    // ==================== STATS ====================
    async loadStats() {
        const data = await chrome.storage.local.get([
            'activityLog',
            'watchedCreators'
        ]);

        const logs = data.activityLog || [];
        const creators = data.watchedCreators || [];

        // Total comments
        if (this.elements.totalComments) {
            this.elements.totalComments.textContent = logs.length;
        }

        // Time saved (assume 2 min per comment)
        if (this.elements.timeSaved) {
            const minutes = logs.length * 2;
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            this.elements.timeSaved.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        }

        // Creators count
        if (this.elements.creatorsCount) {
            this.elements.creatorsCount.textContent = creators.length;
        }
    }

    // ==================== ACTIVITY LOGS ====================
    async loadActivityLogs() {
        const { activityLog } = await chrome.storage.local.get('activityLog');
        const logs = activityLog || [];

        if (logs.length === 0) {
            this.elements.logsBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="5">No activity yet. Start commenting to see logs here.</td>
                </tr>
            `;
            return;
        }

        this.elements.logsBody.innerHTML = logs.slice(0, 50).map(log => `
            <tr>
                <td>${this.formatTime(log.timestamp)}</td>
                <td>${log.authorName || '-'}</td>
                <td>${(log.text || '-').replace(/<[^>]*>/g, '').substring(0, 50)}...</td>
                <td>${(log.comment || '-').substring(0, 40)}...</td>
                <td><span class="status-badge ${(log.status || 'posted').toLowerCase()}">${log.status || 'Posted'}</span></td>
            </tr>
        `).join('');
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    // ==================== CHART ====================
    async updateChart() {
        const ctx = document.getElementById('activity-chart');
        if (!ctx) return;

        // Get last 7 days labels
        const labels = [];
        const data = [];
        const dateKeys = [];

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
            dateKeys.push(date.toDateString());
            data.push(0);
        }

        // Get activity log
        const { activityLog } = await chrome.storage.local.get('activityLog');
        const logs = activityLog || [];

        // Count by day
        logs.forEach(log => {
            const logDate = new Date(log.timestamp).toDateString();
            const dayIndex = dateKeys.indexOf(logDate);
            if (dayIndex !== -1) {
                data[dayIndex]++;
            }
        });

        // Destroy existing chart
        if (this.chart) {
            this.chart.destroy();
        }

        // Create new chart
        if (typeof Chart !== 'undefined') {
            this.chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Comments',
                        data,
                        backgroundColor: 'rgba(10, 102, 194, 0.8)',
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1 }
                        }
                    }
                }
            });
        }
    }

    // ==================== CREATORS ====================
    async loadCreators() {
        const { watchedCreators } = await chrome.storage.local.get('watchedCreators');
        const creators = watchedCreators || [];

        if (creators.length === 0) {
            this.elements.creatorsList.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <line x1="19" y1="8" x2="19" y2="14" />
                        <line x1="22" y1="11" x2="16" y2="11" />
                    </svg>
                    <p>No creators added yet</p>
                    <span>Add creators above to start tracking their posts</span>
                </div>
            `;
            return;
        }

        this.elements.creatorsList.innerHTML = creators.map((creator, index) => `
            <div class="creator-item" data-index="${index}">
                <div class="creator-info">
                    <div class="creator-avatar">${creator.name.charAt(0).toUpperCase()}</div>
                    <div class="creator-details">
                        <h3>${creator.name}</h3>
                        <span>${creator.profileUrl || 'No URL'}</span>
                    </div>
                </div>
                <div class="creator-actions">
                    <span class="priority-badge ${creator.priority?.toLowerCase()}">${creator.priority || 'Low'}</span>
                    <button class="delete-btn" data-index="${index}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        // Bind delete buttons
        this.elements.creatorsList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => this.deleteCreator(parseInt(btn.dataset.index)));
        });
    }

    async addCreator() {
        const name = this.elements.creatorName.value.trim();
        const url = this.elements.creatorUrl.value.trim();
        const priority = this.elements.creatorPriority.value;

        if (!name) {
            this.showToast('Please enter a creator name', 'error');
            return;
        }

        const { watchedCreators } = await chrome.storage.local.get('watchedCreators');
        const creators = watchedCreators || [];

        // Check for duplicate
        if (creators.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            this.showToast('Creator already exists', 'error');
            return;
        }

        creators.push({
            name,
            profileUrl: url,
            priority,
            addedAt: Date.now()
        });

        await chrome.storage.local.set({ watchedCreators: creators });

        // Clear form
        this.elements.creatorName.value = '';
        this.elements.creatorUrl.value = '';

        // Reload
        this.loadCreators();
        this.loadStats();
        this.showToast('Creator added!', 'success');
    }

    async deleteCreator(index) {
        const { watchedCreators } = await chrome.storage.local.get('watchedCreators');
        const creators = watchedCreators || [];

        if (index >= 0 && index < creators.length) {
            creators.splice(index, 1);
            await chrome.storage.local.set({ watchedCreators: creators });
            this.loadCreators();
            this.loadStats();
            this.showToast('Creator removed', 'success');
        }
    }

    // ==================== DATA MANAGEMENT ====================
    async exportData() {
        const data = await chrome.storage.local.get(null);

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `echo-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast('Data exported!', 'success');
    }

    async clearLogs() {
        if (!confirm('Are you sure you want to clear all activity logs?')) return;

        await chrome.storage.local.set({ activityLog: [] });
        this.loadActivityLogs();
        this.loadStats();
        this.updateChart();
        this.showToast('Logs cleared!', 'success');
    }

    // ==================== UI HELPERS ====================
    showToast(message, type = 'info') {
        // Remove existing
        document.querySelectorAll('.echo-toast').forEach(el => el.remove());

        const toast = document.createElement('div');
        toast.className = `toast echo-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new EchoDashboard();
});
