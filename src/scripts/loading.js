/**
 * Loading Screen Controller with Self-Update Support
 */
const Loading = {
  progress: 0,
  steps: [
    { progress: 10, status: 'Проверка обновлений...' },
    { progress: 30, status: 'Загрузка настроек...' },
    { progress: 50, status: 'Проверка сетевых модулей...' },
    { progress: 70, status: 'Подключение к серверам...' },
    { progress: 90, status: 'Подготовка интерфейса...' },
    { progress: 100, status: 'Готово!' }
  ],
  currentStep: 0,
  updateAvailable: null,
  isUpdating: false,

  init() {
    this.progressBar = document.getElementById('loadingProgress');
    this.statusText = document.getElementById('loadingStatus');
    this.loadingScreen = document.getElementById('loadingScreen');
    this.launcher = document.getElementById('launcher');
    this.loadingContent = document.querySelector('.loading-content');
  },

  setProgress(percent, status) {
    if (this.progressBar) {
      this.progressBar.style.width = percent + '%';
    }
    if (this.statusText && status) {
      this.statusText.textContent = status;
    }
    this.progress = percent;
  },

  nextStep() {
    if (this.currentStep < this.steps.length) {
      const step = this.steps[this.currentStep];
      this.setProgress(step.progress, step.status);
      this.currentStep++;
    }
  },

  async start() {
    this.init();

    // Step 1: Check for launcher updates
    this.nextStep();
    await this.checkForUpdates();
    
    // If update is being applied, don't continue
    if (this.isUpdating) return;
    
    await this.delay(100);

    // Step 2: Load settings
    this.nextStep();
    await this.delay(150);

    // Step 3: Check network modules - may need to download
    this.nextStep();
    if (window.electronAPI && window.electronAPI.checkBypassFiles) {
      try {
        const status = await window.electronAPI.checkBypassFiles();
        if (status.needsDownload) {
          // Нужно скачать сетевые модули
          this.setProgress(50, 'Загрузка сетевых модулей...');
          const result = await Updater.startDownload();
          if (!result) {
            console.log('Download failed, continuing without network mode');
          }
        }
      } catch (e) {
        console.log('Check bypass files error:', e);
      }
    }
    await this.delay(150);

    // Step 4: Connect
    this.nextStep();
    if (window.electronAPI) {
      try {
        await window.electronAPI.getBypassStatus();
      } catch (e) {
        console.log('Network check error:', e);
      }
    }
    await this.delay(150);

    // Step 5: Prepare UI
    this.nextStep();
    await this.delay(100);

    // Step 6: Done
    this.nextStep();
    await this.delay(100);

    // Show launcher
    this.finish();
  },

  /**
   * Check for launcher updates - АВТОМАТИЧЕСКИ скачивает без вопросов
   */
  async checkForUpdates() {
    if (!window.electronAPI || !window.electronAPI.checkLauncherUpdate) {
      return;
    }

    try {
      const result = await window.electronAPI.checkLauncherUpdate();
      
      if (result && result.hasUpdate && result.downloadUrl) {
        this.updateAvailable = result;
        // Автоматически начинаем скачивание без вопросов
        this.startUpdate(result.downloadUrl);
        return; // Update is downloading
      }
    } catch (e) {
      console.log('Update check error:', e);
    }
  },

  /**
   * Start the update process - АВТОМАТИЧЕСКОЕ скачивание
   */
  async startUpdate(downloadUrl) {
    this.isUpdating = true;
    
    // Показываем экран автоматической загрузки обновления
    if (this.loadingContent) {
      const versionText = this.updateAvailable
        ? `${this.updateAvailable.currentVersion} → ${this.updateAvailable.latestVersion}`
        : '';
        
      this.loadingContent.innerHTML = `
        <div class="loading-logo">ROBBOB</div>
        <div class="loading-subtitle">Скачивание обновления...</div>
        ${versionText ? `<div class="update-version-info">${versionText}</div>` : ''}
        <div class="loading-bar">
          <div class="loading-progress" id="loadingProgress" style="width: 0%"></div>
        </div>
        <div class="loading-status" id="loadingStatus">Подключение к серверу...</div>
      `;
      
      this.progressBar = document.getElementById('loadingProgress');
      this.statusText = document.getElementById('loadingStatus');
    }

    // Listen for update progress
    if (window.electronAPI && window.electronAPI.onUpdateProgress) {
      window.electronAPI.onUpdateProgress((data) => {
        this.setProgress(data.percent, data.status);
      });
    }

    // Start download
    try {
      const result = await window.electronAPI.downloadLauncherUpdate(downloadUrl);
      
      if (!result.success) {
        this.showUpdateError(result.error || 'Ошибка обновления');
      }
      // If successful, app will restart automatically
    } catch (e) {
      this.showUpdateError(e.message);
    }
  },

  /**
   * Show update error
   */
  showUpdateError(message) {
    if (this.loadingContent) {
      // Обновление обязательно - только кнопка повторить
      this.loadingContent.innerHTML = `
        <div class="loading-logo">ROBBOB</div>
        <div class="update-error">
          <div class="error-icon">✕</div>
          <div class="error-message">${message}</div>
          <button class="update-btn primary" id="retryUpdateBtn">Попробовать снова</button>
        </div>
        <div class="update-notice">Обновление обязательно для продолжения работы</div>
      `;

      document.getElementById('retryUpdateBtn').addEventListener('click', () => {
        if (this.updateAvailable) {
          this.startUpdate(this.updateAvailable.downloadUrl);
        }
      });
    }
  },

  /**
   * Continue without updating
   */
  continueWithoutUpdate() {
    this.isUpdating = false;
    this.updateAvailable = null;
    
    // Reset UI
    if (this.loadingContent) {
      this.loadingContent.innerHTML = `
        <div class="loading-logo">ROBBOB</div>
        <div class="loading-subtitle">Запуск лаунчера...</div>
        <div class="loading-bar">
          <div class="loading-progress" id="loadingProgress" style="width: 0%"></div>
        </div>
        <div class="loading-status" id="loadingStatus">Загрузка...</div>
      `;
      
      this.progressBar = document.getElementById('loadingProgress');
      this.statusText = document.getElementById('loadingStatus');
    }
    
    // Continue loading
    this.currentStep = 1; // Skip update check
    this.continueLoading();
  },

  /**
   * Continue loading after update check
   */
  async continueLoading() {
    // Step 2: Load settings
    this.nextStep();
    await this.delay(150);

    // Step 3: Check network modules
    this.nextStep();
    if (window.electronAPI && window.electronAPI.checkBypassFiles) {
      try {
        const status = await window.electronAPI.checkBypassFiles();
        if (status.needsDownload) {
          this.setProgress(50, 'Загрузка сетевых модулей...');
          const result = await Updater.startDownload();
          if (!result) {
            console.log('Download failed, continuing without network mode');
          }
        }
      } catch (e) {
        console.log('Check bypass files error:', e);
      }
    }
    await this.delay(150);

    // Step 4: Connect
    this.nextStep();
    await this.delay(150);

    // Step 5: Prepare UI
    this.nextStep();
    await this.delay(100);

    // Step 6: Done
    this.nextStep();
    await this.delay(100);

    // Show launcher
    this.finish();
  },

  finish() {
    // Show launcher
    if (this.launcher) {
      this.launcher.style.display = 'flex';
    }

    // Hide loading screen with animation
    if (this.loadingScreen) {
      this.loadingScreen.classList.add('hidden');

      // Remove from DOM after animation
      setTimeout(() => {
        if (this.loadingScreen) {
          this.loadingScreen.remove();
        }
      }, 500);
    }
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Start loading when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  Loading.start();
});
