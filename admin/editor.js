/**
 * RobBob News Editor Script
 * Manages news creation and JSON generation
 */

class NewsEditor {
  constructor() {
    this.newsData = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      news: []
    };

    this.initElements();
    this.loadFromLocalStorage();
    this.attachEventListeners();
    this.updateDisplay();
  }

  initElements() {
    this.form = document.getElementById('newsForm');
    this.titleInput = document.getElementById('title');
    this.emojiSelect = document.getElementById('emoji');
    this.contentInput = document.getElementById('content');
    this.dateInput = document.getElementById('date');
    this.linkInput = document.getElementById('link');
    this.pinnedCheckbox = document.getElementById('pinned');
    this.outputDiv = document.getElementById('output');
    this.newsList = document.getElementById('newsList');
    this.newsCount = document.getElementById('newsCount');
    this.clearBtn = document.getElementById('clearBtn');
    this.copyBtn = document.getElementById('copyBtn');
    this.downloadBtn = document.getElementById('downloadBtn');

    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    this.dateInput.value = today;
  }

  attachEventListeners() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addNews();
    });

    this.clearBtn.addEventListener('click', () => {
      this.form.reset();
      const today = new Date().toISOString().split('T')[0];
      this.dateInput.value = today;
    });

    this.copyBtn.addEventListener('click', () => {
      this.copyToClipboard();
    });

    this.downloadBtn.addEventListener('click', () => {
      this.downloadJSON();
    });
  }

  addNews() {
    const newsItem = {
      id: 'news-' + Date.now(),
      title: this.titleInput.value.trim(),
      emoji: this.emojiSelect.value,
      content: this.contentInput.value.trim(),
      date: this.dateInput.value || new Date().toISOString().split('T')[0],
      pinned: this.pinnedCheckbox.checked,
      link: this.linkInput.value.trim() || null
    };

    // Validate
    if (!newsItem.title || !newsItem.content) {
      this.showToast('Заполните обязательные поля', 'error');
      return;
    }

    // Add to array
    this.newsData.news.unshift(newsItem);
    this.newsData.lastUpdated = new Date().toISOString();

    // Save and update
    this.saveToLocalStorage();
    this.updateDisplay();
    this.form.reset();
    
    // Reset date to today
    const today = new Date().toISOString().split('T')[0];
    this.dateInput.value = today;

    this.showToast('Новость добавлена! 🎉', 'success');
  }

  deleteNews(id) {
    if (!confirm('Удалить эту новость?')) return;

    this.newsData.news = this.newsData.news.filter(item => item.id !== id);
    this.newsData.lastUpdated = new Date().toISOString();
    
    this.saveToLocalStorage();
    this.updateDisplay();
    this.showToast('Новость удалена', 'info');
  }

  editNews(id) {
    const newsItem = this.newsData.news.find(item => item.id === id);
    if (!newsItem) return;

    // Fill form with news data
    this.titleInput.value = newsItem.title;
    this.emojiSelect.value = newsItem.emoji;
    this.contentInput.value = newsItem.content;
    this.dateInput.value = newsItem.date;
    this.linkInput.value = newsItem.link || '';
    this.pinnedCheckbox.checked = newsItem.pinned;

    // Delete the old one (will be re-added on submit)
    this.deleteNews(id);
    
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateDisplay() {
    this.updateNewsList();
    this.updateOutput();
    this.updateCount();
  }

  updateNewsList() {
    if (this.newsData.news.length === 0) {
      this.newsList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.4);">
          <div style="font-size: 48px; margin-bottom: 12px;">📰</div>
          <p>Новостей пока нет</p>
          <p style="font-size: 12px; margin-top: 8px;">Добавьте первую новость с помощью формы выше</p>
        </div>
      `;
      return;
    }

    this.newsList.innerHTML = this.newsData.news.map(item => {
      const emoji = this.getEmojiChar(item.emoji);
      const pinnedBadge = item.pinned ? '<span class="badge">Закреплено</span>' : '';
      
      return `
        <div class="news-item">
          <div class="news-item-info">
            <div class="news-item-title">
              ${emoji} ${this.escapeHtml(item.title)}
              ${pinnedBadge}
            </div>
            <div class="news-item-date">${item.date}</div>
          </div>
          <div class="news-item-actions">
            <button class="icon-btn" onclick="editor.editNews('${item.id}')" title="Редактировать">✏️</button>
            <button class="icon-btn delete" onclick="editor.deleteNews('${item.id}')" title="Удалить">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  updateOutput() {
    const json = JSON.stringify(this.newsData, null, 2);
    this.outputDiv.textContent = json;
  }

  updateCount() {
    this.newsCount.textContent = this.newsData.news.length;
  }

  getEmojiChar(emoji) {
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
    return emojiMap[emoji] || '📌';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem('robbob_admin_news', JSON.stringify(this.newsData));
    } catch (err) {
      console.error('Failed to save to localStorage:', err);
    }
  }

  loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('robbob_admin_news');
      if (saved) {
        this.newsData = JSON.parse(saved);
      }
    } catch (err) {
      console.error('Failed to load from localStorage:', err);
    }
  }

  copyToClipboard() {
    const json = JSON.stringify(this.newsData, null, 2);
    
    navigator.clipboard.writeText(json).then(() => {
      this.showToast('JSON скопирован в буфер обмена! 📋', 'success');
    }).catch(err => {
      console.error('Failed to copy:', err);
      // Fallback method
      const textarea = document.createElement('textarea');
      textarea.value = json;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        this.showToast('JSON скопирован в буфер обмена! 📋', 'success');
      } catch (err) {
        this.showToast('Не удалось скопировать', 'error');
      }
      document.body.removeChild(textarea);
    });
  }

  downloadJSON() {
    const json = JSON.stringify(this.newsData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'news.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.showToast('Файл news.json скачан! 💾', 'success');
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    if (type === 'error') {
      toast.style.background = '#ef4444';
    } else if (type === 'info') {
      toast.style.background = '#3b82f6';
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }
}

// Initialize editor when DOM is ready
let editor;
document.addEventListener('DOMContentLoaded', () => {
  editor = new NewsEditor();
});
