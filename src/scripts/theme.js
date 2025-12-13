/**
 * Theme Management Module
 */

const Theme = {
  overlay: document.getElementById('themeOverlay'),
  toggleBtn: document.getElementById('themeToggle'),
  themeSelect: document.getElementById('themeSelect'),
  icon: null,

  async init() {
    this.icon = this.toggleBtn.querySelector('.icon');
    
    // Загружаем сохранённую тему
    if (window.electronAPI) {
      const settings = await window.electronAPI.getSettings();
      this.apply(settings.theme, false);
    } else {
      const saved = localStorage.getItem('robbob_theme') || 'dark';
      this.apply(saved, false);
    }

    // Слушатели событий
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.themeSelect.addEventListener('change', (e) => this.set(e.target.value, true));
  },

  apply(theme, animate = false) {
    if (animate) {
      this.overlay.style.background = theme === 'light' ? '#f8fafc' : '#0a0b0f';
      this.overlay.classList.add('active');
      
      setTimeout(() => this.applyStyles(theme), 300);
      setTimeout(() => this.overlay.classList.remove('active'), 600);
    } else {
      this.applyStyles(theme);
    }
  },

  applyStyles(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      this.icon.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      this.icon.textContent = '🌙';
    }
    
    // Синхронизируем select
    this.themeSelect.value = theme;
    
    // Сохраняем
    this.save(theme);
  },

  async save(theme) {
    if (window.electronAPI) {
      await window.electronAPI.setSetting('theme', theme);
    } else {
      localStorage.setItem('robbob_theme', theme);
    }
  },

  async toggle() {
    let current;
    if (window.electronAPI) {
      const settings = await window.electronAPI.getSettings();
      current = settings.theme;
    } else {
      current = localStorage.getItem('robbob_theme') || 'dark';
    }
    
    const newTheme = current === 'dark' ? 'light' : 'dark';
    this.apply(newTheme, true);
  },

  set(theme, animate = true) {
    this.apply(theme, animate);
  }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => Theme.init());
