/**
 * News Service Module
 * Fetches news from GitHub Gist and manages caching
 */

const NewsService = {
  // Configure your GitHub Gist URL here
  // Format: https://gist.githubusercontent.com/USERNAME/GIST_ID/raw/news.json
  GIST_URL: 'https://gist.githubusercontent.com/yamineki/GIST_ID_HERE/raw/news.json',
  
  CACHE_KEY: 'robbob_cached_news',
  LAST_SEEN_KEY: 'robbob_last_seen_news',
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  
  /**
   * Fetch news from GitHub Gist with caching
   */
  async fetchNews() {
    try {
      // Add timestamp to bypass cache
      const url = this.GIST_URL + '?t=' + Date.now();
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch news');
      }
      
      const data = await response.json();
      this.cacheNews(data);
      return data.news || [];
    } catch (err) {
      console.error('Error fetching news:', err);
      // Return cached news on error
      return this.getCachedNews();
    }
  },
  
  /**
   * Cache news data to localStorage
   */
  cacheNews(data) {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: data
      }));
    } catch (e) {
      console.error('Error caching news:', e);
    }
  },
  
  /**
   * Get cached news from localStorage
   */
  getCachedNews() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.data?.news || [];
      }
    } catch (e) {
      console.error('Error reading cached news:', e);
    }
    return this.getDefaultNews();
  },
  
  /**
   * Check if cache is still valid
   */
  isCacheValid() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return (Date.now() - parsed.timestamp) < this.CACHE_DURATION;
      }
    } catch (e) {}
    return false;
  },
  
  /**
   * Get news (from cache if valid, otherwise fetch)
   */
  async getNews() {
    if (this.isCacheValid()) {
      return this.getCachedNews();
    }
    return await this.fetchNews();
  },
  
  /**
   * Check for new news items since last seen
   */
  getNewNewsCount(news) {
    const lastSeenIds = this.getLastSeenNewsIds();
    const newItems = news.filter(item => !lastSeenIds.includes(item.id));
    return newItems.length;
  },
  
  /**
   * Get last seen news IDs
   */
  getLastSeenNewsIds() {
    try {
      const stored = localStorage.getItem(this.LAST_SEEN_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return [];
  },
  
  /**
   * Mark all news as seen
   */
  markAllAsSeen(news) {
    try {
      const ids = news.map(item => item.id);
      localStorage.setItem(this.LAST_SEEN_KEY, JSON.stringify(ids));
    } catch (e) {
      console.error('Error marking news as seen:', e);
    }
  },
  
  /**
   * Get emoji from emoji name
   */
  getEmoji(emojiName) {
    const emojiMap = {
      'rocket': '🚀',
      'shield': '🛡️',
      'zap': '⚡',
      'star': '⭐',
      'fire': '🔥',
      'gift': '🎁',
      'warning': '⚠️',
      'info': 'ℹ️',
      'check': '✅',
      'new': '🆕',
      'update': '📦',
      'bug': '🐛',
      'fix': '🔧',
      'sparkles': '✨',
      'game': '🎮',
      'network': '🌐'
    };
    return emojiMap[emojiName] || '📰';
  },
  
  /**
   * Format date for display
   */
  formatDate(dateString) {
    try {
      const date = new Date(dateString);
      const options = { day: 'numeric', month: 'long', year: 'numeric' };
      return date.toLocaleDateString('ru-RU', options);
    } catch (e) {
      return dateString;
    }
  },
  
  /**
   * Default news when no data available
   */
  getDefaultNews() {
    return [
      {
        id: 'default-1',
        title: 'Добро пожаловать в RobBob!',
        emoji: 'rocket',
        content: 'Первый релиз RobBob Launcher с улучшенным сетевым режимом!',
        date: new Date().toISOString().split('T')[0],
        pinned: true,
        link: null
      },
      {
        id: 'default-2',
        title: 'Безопасное подключение',
        emoji: 'shield',
        content: 'Сетевой режим активируется автоматически вместе с лаунчером.',
        date: new Date().toISOString().split('T')[0],
        pinned: false,
        link: null
      },
      {
        id: 'default-3',
        title: 'Быстрый запуск',
        emoji: 'zap',
        content: 'Оптимизирован запуск Roblox для максимальной скорости.',
        date: new Date().toISOString().split('T')[0],
        pinned: false,
        link: null
      }
    ];
  },
  
  /**
   * Render news cards to container
   */
  renderNews(news, container) {
    if (!container) return;
    
    // Sort: pinned first, then by date
    const sorted = [...news].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.date) - new Date(a.date);
    });
    
    container.innerHTML = sorted.map(item => `
      <div class="news-card ${item.pinned ? 'pinned' : ''}" data-id="${item.id}">
        <div class="news-header">
          <span class="news-emoji">${this.getEmoji(item.emoji)}</span>
          <h3 class="news-title">${this.escapeHtml(item.title)}</h3>
          ${item.pinned ? '<span class="news-pin">📌</span>' : ''}
        </div>
        <p class="news-content">${this.escapeHtml(item.content)}</p>
        <div class="news-footer">
          <span class="news-date">${this.formatDate(item.date)}</span>
          ${item.link ? `<a class="news-link" href="#" data-url="${item.link}">Подробнее →</a>` : ''}
        </div>
      </div>
    `).join('');
    
    // Add click handlers for links
    container.querySelectorAll('.news-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.dataset.url;
        if (url && window.electronAPI && window.electronAPI.openExternal) {
          window.electronAPI.openExternal(url);
        } else if (url) {
          window.open(url, '_blank');
        }
      });
    });
  },
  
  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  /**
   * Show notification popup for new news
   */
  showNotification(count, latestNews) {
    // Remove existing notification
    const existing = document.querySelector('.news-notification');
    if (existing) existing.remove();
    
    if (count <= 0 || !latestNews) return;
    
    const notification = document.createElement('div');
    notification.className = 'news-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-icon">${this.getEmoji(latestNews.emoji)}</div>
        <div class="notification-text">
          <div class="notification-title">${count > 1 ? `${count} новых новостей` : 'Новая новость'}</div>
          <div class="notification-preview">${this.escapeHtml(latestNews.title)}</div>
        </div>
        <button class="notification-close">✕</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Click to go to news
    notification.querySelector('.notification-content').addEventListener('click', (e) => {
      if (!e.target.classList.contains('notification-close')) {
        // Navigate to news page
        const newsBtn = document.querySelector('[data-page="page-news"]');
        if (newsBtn) newsBtn.click();
        notification.remove();
      }
    });
    
    // Close button
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    });
    
    // Auto-hide after 8 seconds
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
      }
    }, 8000);
  },
  
  /**
   * Initialize news system
   */
  async init() {
    const container = document.getElementById('newsContainer');
    
    // Show loading state
    if (container) {
      container.innerHTML = '<div class="news-loading">Загрузка новостей...</div>';
    }
    
    // Fetch news
    const news = await this.getNews();
    
    // Check for new items
    const newCount = this.getNewNewsCount(news);
    
    // Render news
    this.renderNews(news, container);
    
    // Show notification if there are new items
    if (newCount > 0) {
      const latestNew = news.find(item => !this.getLastSeenNewsIds().includes(item.id));
      this.showNotification(newCount, latestNew);
    }
    
    // Update nav badge
    this.updateNavBadge(newCount);
    
    // Mark as seen when user views news page
    const newsNavBtn = document.querySelector('[data-page="page-news"]');
    if (newsNavBtn) {
      newsNavBtn.addEventListener('click', () => {
        this.markAllAsSeen(news);
        this.updateNavBadge(0);
      });
    }
    
    return news;
  },
  
  /**
   * Update navigation badge with new news count
   */
  updateNavBadge(count) {
    const newsBtn = document.querySelector('[data-page="page-news"]');
    if (!newsBtn) return;
    
    // Remove existing badge
    const existingBadge = newsBtn.querySelector('.nav-badge');
    if (existingBadge) existingBadge.remove();
    
    // Add badge if count > 0
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.textContent = count > 9 ? '9+' : count;
      newsBtn.appendChild(badge);
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Delay news loading slightly to not block initial render
  setTimeout(() => {
    NewsService.init().catch(err => {
      console.error('Failed to initialize news:', err);
    });
  }, 500);
});
