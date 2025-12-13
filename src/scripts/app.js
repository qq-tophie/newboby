/**
 * Main Application Module
 */

// Toast Notifications
const Toast = {
  show(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 200ms ease';
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }
};

// Main App
const App = {
  async init() {
    this.setupWindowControls();
    this.setupPlayButtons();
    this.setupLoginModal();
    this.setupExternalLinks();
    this.startPingSimulation();
  },

  // Управление окном (для Electron)
  setupWindowControls() {
    const minBtn = document.getElementById('minBtn');
    const maxBtn = document.getElementById('maxBtn');
    const closeBtn = document.getElementById('closeBtn');

    if (window.electronAPI) {
      minBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
      maxBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
      closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());
    } else {
      // Для браузерной версии
      minBtn.addEventListener('click', () => Toast.show('Свёрнуто (только в приложении)'));
      maxBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      });
      closeBtn.addEventListener('click', () => {
        if (confirm('Закрыть приложение?')) {
          window.close();
        }
      });
    }
  },

  // Кнопки запуска Roblox
  setupPlayButtons() {
    const playBtn = document.getElementById('playBtn');
    const playBtnFooter = document.getElementById('playBtnFooter');

    const launch = async () => {
      if (window.electronAPI) {
        await window.electronAPI.launchRoblox();
        Toast.show('Запуск Roblox...', 'success');
      } else {
        // Браузерный fallback
        try {
          window.location.href = 'roblox-player:1+launchmode';
          Toast.show('Запуск Roblox...', 'success');
        } catch (e) {
          Toast.show('Не удалось запустить Roblox', 'error');
        }
      }
    };

    playBtn.addEventListener('click', launch);
    playBtnFooter.addEventListener('click', launch);
  },

  // Текущий профиль
  currentProfile: null,

  // Модальное окно входа
  setupLoginModal() {
    const openBtn = document.getElementById('openLogin');
    const cancelBtn = document.getElementById('loginCancel');
    const confirmBtn = document.getElementById('loginConfirm');
    const nickInput = document.getElementById('nickInput');

    // Загружаем сохранённый профиль при старте
    this.loadSavedProfile();

    openBtn.addEventListener('click', () => Modals.open('loginModal'));
    cancelBtn.addEventListener('click', () => Modals.close('loginModal'));

    confirmBtn.addEventListener('click', async () => {
      const nick = nickInput.value.trim();
      if (nick) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Загрузка...';

        try {
          if (window.electronAPI && window.electronAPI.getRobloxProfile) {
            const profile = await window.electronAPI.getRobloxProfile(nick);

            if (profile.success) {
              // Сохраняем профиль
              if (window.electronAPI) {
                await window.electronAPI.setSetting('robloxProfile', profile);
              }

              this.displayProfile(profile);
              Toast.show(`Добро пожаловать, ${profile.displayName}!`, 'success');
              Modals.close('loginModal');
            } else {
              Toast.show(profile.error || 'Пользователь не найден', 'error');
            }
          } else {
            Toast.show(`Вход выполнен: ${nick}`, 'success');
            Modals.close('loginModal');
          }
        } catch (err) {
          Toast.show('Ошибка подключения к Roblox', 'error');
        }

        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Войти';
      }
    });

    // Enter для подтверждения
    nickInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      }
    });

    // Настройка модального окна профиля
    this.setupProfileModal();
  },

  // Настройка модального окна профиля
  setupProfileModal() {
    const closeBtn = document.getElementById('profileModalClose');
    const openRobloxBtn = document.getElementById('openRobloxProfile');
    const logoutBtn = document.getElementById('profileLogout');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => Modals.close('profileModal'));
    }

    if (openRobloxBtn) {
      openRobloxBtn.addEventListener('click', () => {
        if (this.currentProfile) {
          const url = `https://www.roblox.com/users/${this.currentProfile.userId}/profile`;
          if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
          } else {
            window.open(url, '_blank');
          }
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        // Удаляем профиль
        this.currentProfile = null;
        if (window.electronAPI) {
          await window.electronAPI.setSetting('robloxProfile', null);
        }

        // Скрываем контейнер профиля, показываем кнопку входа
        const profileContainer = document.getElementById('userProfile');
        const openBtn = document.getElementById('openLogin');

        if (profileContainer) {
          profileContainer.style.display = 'none';
          profileContainer.innerHTML = '';
        }
        if (openBtn) {
          openBtn.style.display = 'flex';
        }

        Modals.close('profileModal');
        Toast.show('Вы вышли из аккаунта', 'info');
      });
    }
  },

  // Загрузить сохранённый профиль
  async loadSavedProfile() {
    if (window.electronAPI) {
      const settings = await window.electronAPI.getSettings();
      if (settings.robloxProfile) {
        this.displayProfile(settings.robloxProfile);
      }
    }
  },

  // Форматировать дату
  formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('ru-RU', options);
  },

  // Отобразить профиль в topbar
  displayProfile(profile) {
    const openBtn = document.getElementById('openLogin');
    const profileContainer = document.getElementById('userProfile');

    // Сохраняем текущий профиль
    this.currentProfile = profile;

    if (profileContainer) {
      profileContainer.innerHTML = `
        <img src="${profile.avatarUrl}" alt="Avatar" class="profile-avatar" onerror="this.style.display='none'">
        <span class="profile-name">${profile.displayName}</span>
      `;
      profileContainer.style.display = 'flex';
      profileContainer.style.cursor = 'pointer';

      // Клик открывает модальное окно профиля
      profileContainer.onclick = () => {
        this.showProfileModal(profile);
      };
    }

    // Скрываем кнопку "Войти" после успешного входа
    if (openBtn) {
      openBtn.style.display = 'none';
    }
  },

  // Показать модальное окно профиля
  showProfileModal(profile) {
    const avatarContainer = document.getElementById('profileAvatarLarge');
    const displayNameEl = document.getElementById('profileDisplayName');
    const usernameEl = document.getElementById('profileUsername');
    const createdEl = document.getElementById('profileCreated');

    if (avatarContainer) {
      // Используем полный аватар если есть, иначе headshot
      const avatarUrl = profile.fullAvatarUrl || profile.avatarUrl;
      avatarContainer.innerHTML = avatarUrl
        ? `<img src="${avatarUrl}" alt="Avatar" onerror="this.parentElement.innerHTML=''">`
        : '';
    }

    if (displayNameEl) {
      displayNameEl.textContent = profile.displayName || 'Игрок';
    }

    if (usernameEl) {
      usernameEl.textContent = `@${profile.username || 'unknown'}`;
    }

    if (createdEl) {
      createdEl.textContent = this.formatDate(profile.created);
    }

    Modals.open('profileModal');
  },

  // Внешние ссылки
  setupExternalLinks() {
    const catalogBtn = document.getElementById('openCatalog');

    catalogBtn.addEventListener('click', () => {
      const url = 'https://www.roblox.com/games/7041939546/Catalog-Avatar-Creator';
      if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    });
  },

  // Симуляция пинга
  startPingSimulation() {
    const pingLabel = document.getElementById('pingLabel');
    
    const updatePing = () => {
      const ping = 40 + Math.floor(Math.random() * 40);
      pingLabel.textContent = `${ping}ms`;
    };

    updatePing();
    setInterval(updatePing, 4000);
  }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => App.init());
