/**
 * Auto-Updater Module
 * Скачивание компонентов с GitHub
 */

const Updater = {
  // GitHub репозиторий для загрузки файлов
  GITHUB_REPO: 'yamineki/roboby-files', // Измените на ваш репозиторий
  GITHUB_API: 'https://api.github.com/repos',

  elements: {
    overlay: null,
    progress: null,
    status: null,
    percentage: null
  },

  init() {
    this.createOverlay();
  },

  createOverlay() {
    // Создаём оверлей для загрузки
    const overlay = document.createElement('div');
    overlay.id = 'updateOverlay';
    overlay.className = 'update-overlay';
    overlay.innerHTML = `
      <div class="update-content">
        <div class="update-logo">ROBBOB</div>
        <div class="update-title">Загрузка компонентов</div>
        <div class="update-bar">
          <div class="update-progress" id="updateProgress"></div>
        </div>
        <div class="update-info">
          <span class="update-status" id="updateStatus">Проверка обновлений...</span>
          <span class="update-percentage" id="updatePercentage">0%</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    this.elements.overlay = overlay;
    this.elements.progress = document.getElementById('updateProgress');
    this.elements.status = document.getElementById('updateStatus');
    this.elements.percentage = document.getElementById('updatePercentage');
  },

  show() {
    if (this.elements.overlay) {
      this.elements.overlay.classList.add('visible');
    }
  },

  hide() {
    if (this.elements.overlay) {
      this.elements.overlay.classList.remove('visible');
      setTimeout(() => {
        this.elements.overlay.remove();
      }, 300);
    }
  },

  setProgress(percent, status) {
    if (this.elements.progress) {
      this.elements.progress.style.width = percent + '%';
    }
    if (this.elements.percentage) {
      this.elements.percentage.textContent = Math.round(percent) + '%';
    }
    if (this.elements.status && status) {
      this.elements.status.textContent = status;
    }
  },

  // Проверить нужна ли загрузка
  async checkForUpdates() {
    if (!window.electronAPI) return { needsDownload: false };

    try {
      const result = await window.electronAPI.checkBypassFiles();
      return result;
    } catch (e) {
      console.error('Update check error:', e);
      return { needsDownload: false };
    }
  },

  // Начать загрузку
  async startDownload() {
    if (!window.electronAPI) return false;

    this.show();
    this.setProgress(0, 'Подготовка к загрузке...');

    try {
      // Слушаем прогресс загрузки
      window.electronAPI.onDownloadProgress((data) => {
        this.setProgress(data.percent, data.status);
      });

      // Запускаем загрузку
      const result = await window.electronAPI.downloadBypassFiles();

      if (result.success) {
        this.setProgress(100, 'Загрузка завершена!');
        await this.delay(500);
        this.hide();
        return true;
      } else {
        this.setProgress(0, 'Ошибка: ' + (result.error || 'Неизвестная ошибка'));
        await this.delay(3000);
        this.hide();
        return false;
      }
    } catch (e) {
      console.error('Download error:', e);
      this.setProgress(0, 'Ошибка загрузки');
      await this.delay(2000);
      this.hide();
      return false;
    }
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Добавляем стили для оверлея
const style = document.createElement('style');
style.textContent = `
  .update-overlay {
    position: fixed;
    inset: 0;
    background: linear-gradient(135deg, #0a0b0f 0%, #1a1b2e 50%, #0a0b0f 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
  }

  .update-overlay.visible {
    opacity: 1;
    visibility: visible;
  }

  .update-content {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 40px;
  }

  .update-logo {
    font-size: 48px;
    font-weight: 900;
    letter-spacing: 6px;
    color: #ffffff;
    text-shadow: 0 0 30px rgba(168,85,247,0.7);
  }

  .update-title {
    color: rgba(255,255,255,0.9);
    font-size: 18px;
    font-weight: 500;
  }

  .update-bar {
    width: 350px;
    height: 6px;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .update-progress {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #a855f7, #22c55e);
    border-radius: 3px;
    transition: width 0.2s ease;
  }

  .update-info {
    display: flex;
    justify-content: space-between;
    width: 350px;
    color: rgba(255,255,255,0.6);
    font-size: 13px;
  }

  .update-status {
    text-align: left;
  }

  .update-percentage {
    font-weight: 600;
    color: #a855f7;
  }
`;
document.head.appendChild(style);

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  Updater.init();
});
