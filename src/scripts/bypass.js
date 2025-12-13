/**
 * Network Mode Management Module
 * Управление сетевым режимом
 */

const Bypass = {
  isRunning: false,
  isAvailable: false,
  currentMode: 'general',

  elements: {
    toggle: null,
    indicator: null,
    detailsBtn: null,
    modal: null,
    modalClose: null,
    githubLink: null,
    modeSelect: null,
    modeRow: null
  },

  async init() {
    this.elements.toggle = document.getElementById('bypassToggle');
    this.elements.indicator = document.getElementById('bypassIndicator');
    this.elements.detailsBtn = document.getElementById('bypassDetailsBtn');
    this.elements.modal = document.getElementById('bypassModal');
    this.elements.modalClose = document.getElementById('bypassModalClose');
    this.elements.githubLink = document.getElementById('openZapretGithub');
    this.elements.modeSelect = document.getElementById('bypassModeSelect');
    this.elements.modeRow = document.getElementById('bypassModeRow');

    // Привязка событий
    if (this.elements.toggle) {
      this.elements.toggle.addEventListener('change', (e) => this.onToggleChange(e));
    }

    if (this.elements.modeSelect) {
      this.elements.modeSelect.addEventListener('change', (e) => this.onModeChange(e));
    }

    if (this.elements.detailsBtn) {
      this.elements.detailsBtn.addEventListener('click', () => this.openModal());
    }

    if (this.elements.modalClose) {
      this.elements.modalClose.addEventListener('click', () => this.closeModal());
    }

    if (this.elements.modal) {
      this.elements.modal.addEventListener('click', (e) => {
        if (e.target === this.elements.modal) {
          this.closeModal();
        }
      });
    }

    if (this.elements.githubLink) {
      this.elements.githubLink.addEventListener('click', (e) => {
        e.preventDefault();
        const url = 'https://github.com/Flowseal/zapret-discord-youtube/releases';
        if (window.electronAPI && window.electronAPI.openExternal) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
      });
    }

    // Загружаем режимы и настройки
    await this.loadModes();
    await this.loadSettings();

    // Слушаем события от main процесса
    if (window.electronAPI) {
      window.electronAPI.onNetworkStatus((data) => {
        this.updateStatus(data);
      });
    }
  },

  async loadModes() {
    if (window.electronAPI && window.electronAPI.getBypassModes) {
      const modes = await window.electronAPI.getBypassModes();

      if (this.elements.modeSelect && modes.length > 0) {
        this.elements.modeSelect.innerHTML = '';

        modes.forEach(mode => {
          const option = document.createElement('option');
          option.value = mode.id;
          option.textContent = mode.name;
          option.title = mode.description;
          this.elements.modeSelect.appendChild(option);
        });
      }
    }
  },

  async loadSettings() {
    if (window.electronAPI) {
      const settings = await window.electronAPI.getSettings();

      // Устанавливаем состояние переключателя
      if (this.elements.toggle) {
        this.elements.toggle.checked = settings.bypassEnabled !== false;
      }

      // Устанавливаем текущий режим
      if (this.elements.modeSelect && settings.bypassMode) {
        this.currentMode = settings.bypassMode;
        this.elements.modeSelect.value = settings.bypassMode;
      }

      // Показываем/скрываем выбор режима в зависимости от состояния
      this.updateModeRowVisibility(settings.bypassEnabled !== false);

      // Проверяем статус
      const status = await window.electronAPI.getBypassStatus();
      this.isRunning = status.running;
      this.isAvailable = status.available;
      this.updateIndicator();
    }
  },

  async onToggleChange(e) {
    const enabled = e.target.checked;

    // Обновляем видимость выбора режима
    this.updateModeRowVisibility(enabled);

    if (window.electronAPI) {
      await window.electronAPI.setSetting('bypassEnabled', enabled);

      if (enabled) {
        Toast.show('Сетевой режим включён', 'success');
      } else {
        Toast.show('Сетевой режим выключён');
      }
    }
  },

  async onModeChange(e) {
    const mode = e.target.value;
    this.currentMode = mode;

    if (window.electronAPI) {
      await window.electronAPI.setSetting('bypassMode', mode);
      Toast.show(`Режим: ${e.target.options[e.target.selectedIndex].text}`, 'success');
    }
  },

  updateModeRowVisibility(visible) {
    if (this.elements.modeRow) {
      this.elements.modeRow.style.display = visible ? 'flex' : 'none';
    }
  },

  updateStatus(data) {
    this.isRunning = data.running;

    if (data.error) {
      Toast.show(data.error, 'error');
    }

    if (data.mode) {
      this.currentMode = data.mode;
      if (this.elements.modeSelect) {
        this.elements.modeSelect.value = data.mode;
      }
    }

    this.updateIndicator();
  },

  updateIndicator() {
    if (this.elements.indicator) {
      if (this.isRunning) {
        this.elements.indicator.classList.add('active');
        this.elements.indicator.title = 'Сетевой режим активен';
      } else {
        this.elements.indicator.classList.remove('active');
        this.elements.indicator.title = 'Сетевой режим неактивен';
      }
    }
  },

  openModal() {
    if (this.elements.modal) {
      this.elements.modal.classList.add('open');
    }
  },

  closeModal() {
    if (this.elements.modal) {
      this.elements.modal.classList.remove('open');
    }
  }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => Bypass.init());
