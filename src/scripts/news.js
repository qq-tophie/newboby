/**
 * News System Module
 * Fetches and displays news from GitHub Gist
 */

const NewsService = {
  // Default news URL - can be changed to your GitHub Gist URL
  NEWS_URL: 'https://gist.githubusercontent.com/YOUR_USERNAME/YOUR_GIST_ID/raw/news.json',
  CACHE_KEY: 'robbob_cached_news',
  CACHE_TIMESTAMP_KEY: 'robbob_news_timestamp',
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

  /**
   * Fetch news from the server
   */
  async fetchNews() {
    try {
      // Add cache buster to prevent caching
      const url = this.NEWS_URL + '?t=' + Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch news');
      }

      const data = await response.json();
      
      if (data && data.news && Array.isArray(data.news)) {
        this.cacheNews(data);
        return data.news;
      }

      return this.getCachedNews();
    } catch (err) {
      console.warn('Failed to fetch news from server:', err);
      return this.getCachedNews();
    }
  },

  /**
   * Cache news data locally
   */
  cacheNews(data) {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(this.CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (err) {
      console.error('Failed to cache news:', err);
    }
  },

  /**
   * Get cached news
   */
  getCachedNews() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        return data.news || [];
      }
    } catch (err) {
      console.error('Failed to get cached news:', err);
    }
    return this.getDefaultNews();
  },

  /**
   * Check if cache is valid
   */
  isCacheValid() {
    const timestamp = localStorage.getItem(this.CACHE_TIMESTAMP_KEY);
    if (!timestamp) return false;

    const age = Date.now() - parseInt(timestamp, 10);
    return age < this.CACHE_DURATION;
  },

  /**
   * Get default news (fallback)
   */
  getDefaultNews() {
    return [
      {
        id: 'welcome',
        title: 'Добро пожаловать в RobBob Launcher!',
        emoji: '🎉',
        content: 'Наслаждайтесь быстрым доступом к Roblox с улучшенным соединением.',
        date: new Date().toISOString().split('T')[0],
        pinned: true,
        link: null
      },
      {
        id: 'bypass-info',
        title: 'Улучшенный сетевой режим',
        emoji: '🛡️',
        content: 'Сетевой режим включён по умолчанию для стабильного соединения.',
        date: new Date().toISOString().split('T')[0],
        pinned: false,
        link: null
      }
    ];
  },

  /**
   * Format date for display
   */
  formatDate(dateString) {
    try {
      const date = new Date(dateString);
      const options = { day: 'numeric', month: 'long', year: 'numeric' };
      return date.toLocaleDateString('ru-RU', options);
    } catch (err) {
      return dateString;
    }
  },

  /**
   * Get emoji HTML
   */
  getEmojiHTML(emoji) {
    const emojiMap = {
      'rocket': '🚀',
      'shield': '🛡️',
      'zap': '⚡',
      'star': '⭐',
      'fire': '🔥',
      'party': '🎉',
      'warning': '⚠️',
      'info': 'ℹ️',
      'check': '✅',
      'update': '🔄'
    };

    return emojiMap[emoji] || emoji;
  },

  /**
   * Render news item
   */
  renderNewsItem(newsItem) {
    const emoji = this.getEmojiHTML(newsItem.emoji || 'info');
    const date = this.formatDate(newsItem.date);
    const pinned = newsItem.pinned ? '<span class="news-pinned">Закреплено</span>' : '';

    return `
      <div class="news-card ${newsItem.pinned ? 'pinned' : ''}" data-id="${newsItem.id}">
        <div class="news-header">
          <span class="news-emoji">${emoji}</span>
          <div class="news-meta">
            <h3 class="news-title">${this.escapeHtml(newsItem.title)}</h3>
            <span class="news-date">${date}</span>
          </div>
          ${pinned}
        </div>
        <p class="news-content">${this.escapeHtml(newsItem.content)}</p>
        ${newsItem.link ? `<a href="#" class="news-link" data-url="${this.escapeHtml(newsItem.link)}">Подробнее →</a>` : ''}
      </div>
    `;
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
   * Load and display news
   */
  async loadNews() {
    const container = document.getElementById('newsContainer');
    if (!container) return;

    // Show loading state
    container.innerHTML = `
      <div class="news-loading">
        <div class="loading-spinner"></div>
        <span>Загрузка новостей...</span>
      </div>
    `;

    try {
      // Try to fetch fresh news, fall back to cache
      let news;
      if (this.isCacheValid()) {
        news = this.getCachedNews();
      } else {
        news = await this.fetchNews();
      }

      if (!news || news.length === 0) {
        container.innerHTML = `
          <div class="news-empty">
            <span>📰</span>
            <p>Новостей пока нет</p>
          </div>
        `;
        return;
      }

      // Sort news: pinned first, then by date
      news.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.date) - new Date(a.date);
      });

      // Render news items
      container.innerHTML = news.map(item => this.renderNewsItem(item)).join('');

      // Add click handlers for external links
      container.querySelectorAll('.news-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const url = link.getAttribute('data-url');
          if (url) {
            if (window.electronAPI && window.electronAPI.openExternal) {
              window.electronAPI.openExternal(url);
            } else {
              window.open(url, '_blank');
            }
          }
        });
      });

    } catch (err) {
      console.error('Failed to load news:', err);
      container.innerHTML = `
        <div class="news-error">
          <span>⚠️</span>
          <p>Не удалось загрузить новости</p>
          <button class="btn ghost" onclick="NewsService.loadNews()">Повторить</button>
        </div>
      `;
    }
  },

  /**
   * Initialize news system
   */
  init() {
    // Load news when the news page becomes visible
    const newsPage = document.getElementById('page-news');
    if (!newsPage) return;

    // Create an observer to load news when page is shown
    const observer = new MutationObserver(() => {
      if (newsPage.classList.contains('active')) {
        this.loadNews();
      }
    });

    observer.observe(newsPage, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Also load immediately if news page is already active
    if (newsPage.classList.contains('active')) {
      this.loadNews();
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  NewsService.init();
});
