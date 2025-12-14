/**
 * Telegram Gate Module
 * 
 * Manages Telegram authentication gate that blocks launcher access
 * until user joins the required Telegram channel.
 */

const TelegramGate = {
  elements: {
    overlay: null,
    statusText: null,
    joinButton: null,
    checkButton: null,
    exitButton: null,
    spinner: null
  },

  sessionId: null,
  checkInterval: null,
  isVerified: false,

  /**
   * Initialize the Telegram Gate
   */
  async init() {
    // Get DOM elements
    this.elements.overlay = document.getElementById('telegramGateOverlay');
    this.elements.statusText = document.getElementById('telegramGateStatus');
    this.elements.joinButton = document.getElementById('telegramJoinBtn');
    this.elements.checkButton = document.getElementById('telegramCheckBtn');
    this.elements.exitButton = document.getElementById('telegramExitBtn');
    this.elements.spinner = document.getElementById('telegramGateSpinner');

    if (!this.elements.overlay) {
      console.error('Telegram gate overlay not found in DOM');
      return;
    }

    // Bind event listeners
    if (this.elements.joinButton) {
      this.elements.joinButton.addEventListener('click', () => this.onJoinClick());
    }

    if (this.elements.checkButton) {
      this.elements.checkButton.addEventListener('click', () => this.onCheckClick());
    }

    if (this.elements.exitButton) {
      this.elements.exitButton.addEventListener('click', () => this.onExitClick());
    }

    // Check authentication status
    await this.checkAuthStatus();
  },

  /**
   * Check if user is authenticated
   */
  async checkAuthStatus() {
    if (!window.electronAPI || !window.electronAPI.getTelegramStatus) {
      console.warn('Telegram API not available');
      this.hide();
      return;
    }

    this.showSpinner(true);
    this.updateStatus('Проверка авторизации...');

    try {
      const status = await window.electronAPI.getTelegramStatus();

      if (status.allowed) {
        // User is authenticated
        this.isVerified = true;
        this.hide();
      } else {
        // User needs to authenticate
        this.show();
        this.updateStatus('Для использования лаунчера необходимо вступить в Telegram канал');
      }
    } catch (err) {
      console.error('Failed to check Telegram status:', err);
      this.updateStatus('Ошибка проверки авторизации');
    } finally {
      this.showSpinner(false);
    }
  },

  /**
   * Handle Join button click
   */
  async onJoinClick() {
    if (!window.electronAPI) return;

    this.showSpinner(true);
    this.updateStatus('Открытие Telegram бота...');

    try {
      const result = await window.electronAPI.startTelegramVerification();

      if (result.success) {
        this.sessionId = result.sessionId;
        this.updateStatus(
          'Telegram бот открыт. Следуйте инструкциям в боте, затем нажмите "Проверить".'
        );
        
        // Start auto-checking
        this.startAutoCheck();
      } else {
        this.updateStatus(`Ошибка: ${result.error || 'Не удалось открыть бота'}`);
      }
    } catch (err) {
      console.error('Failed to start verification:', err);
      this.updateStatus('Ошибка при открытии бота');
    } finally {
      this.showSpinner(false);
    }
  },

  /**
   * Handle Check button click
   */
  async onCheckClick() {
    if (!window.electronAPI) return;

    // If no session, start new one
    if (!this.sessionId) {
      await this.onJoinClick();
      return;
    }

    await this.checkSession();
  },

  /**
   * Check session status
   */
  async checkSession() {
    if (!this.sessionId || !window.electronAPI) return;

    this.showSpinner(true);
    this.updateStatus('Проверка подписки...');

    try {
      const result = await window.electronAPI.checkTelegramSession(this.sessionId);

      if (result.status === 'verified') {
        // Verification successful!
        this.stopAutoCheck();
        this.updateStatus('✅ Авторизация успешна! Запуск лаунчера...');
        
        setTimeout(() => {
          this.isVerified = true;
          this.hide();
          
          // Reinitialize app now that gate is passed
          if (window.App && window.App.init) {
            // App is already initialized, just continue
          }
        }, 1500);
      } else if (result.status === 'pending') {
        this.updateStatus('Ожидание подтверждения... Вступите в канал и отправьте /check боту.');
      } else if (result.status === 'expired') {
        this.stopAutoCheck();
        this.sessionId = null;
        this.updateStatus('Сессия истекла. Нажмите "Присоединиться" для повторной попытки.');
      } else {
        this.updateStatus('Неизвестный статус. Попробуйте снова.');
      }
    } catch (err) {
      console.error('Failed to check session:', err);
      this.updateStatus('Ошибка проверки сессии');
    } finally {
      this.showSpinner(false);
    }
  },

  /**
   * Start auto-checking session status
   */
  startAutoCheck() {
    this.stopAutoCheck();
    
    this.checkInterval = setInterval(() => {
      this.checkSession();
    }, 3000); // Check every 3 seconds
  },

  /**
   * Stop auto-checking
   */
  stopAutoCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  },

  /**
   * Handle Exit button click
   */
  async onExitClick() {
    if (window.electronAPI && window.electronAPI.forceExit) {
      await window.electronAPI.forceExit();
    } else {
      window.close();
    }
  },

  /**
   * Show the overlay
   */
  show() {
    if (this.elements.overlay) {
      this.elements.overlay.style.display = 'flex';
      
      // Disable interaction with main content
      const launcher = document.getElementById('launcher');
      if (launcher) {
        launcher.style.pointerEvents = 'none';
        launcher.style.filter = 'blur(8px)';
      }
    }
  },

  /**
   * Hide the overlay
   */
  hide() {
    if (this.elements.overlay) {
      this.elements.overlay.style.display = 'none';
      
      // Re-enable interaction with main content
      const launcher = document.getElementById('launcher');
      if (launcher) {
        launcher.style.pointerEvents = 'auto';
        launcher.style.filter = 'none';
      }
    }
    
    this.stopAutoCheck();
  },

  /**
   * Update status text
   */
  updateStatus(text) {
    if (this.elements.statusText) {
      this.elements.statusText.textContent = text;
    }
  },

  /**
   * Show/hide spinner
   */
  showSpinner(show) {
    if (this.elements.spinner) {
      this.elements.spinner.style.display = show ? 'block' : 'none';
    }
  },

  /**
   * Check if gate is passed
   */
  isPassed() {
    return this.isVerified;
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TelegramGate.init());
} else {
  TelegramGate.init();
}

// Export for use in other modules
window.TelegramGate = TelegramGate;
