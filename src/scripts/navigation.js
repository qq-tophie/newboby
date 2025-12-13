/**
 * Navigation Module
 */

const Navigation = {
  navItems: null,
  pages: null,

  init() {
    this.navItems = document.querySelectorAll('.nav-item');
    this.pages = document.querySelectorAll('.page');

    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.dataset.page;
        if (targetId) {
          this.navigateTo(targetId);
        }
      });
    });
  },

  navigateTo(pageId) {
    // Обновляем активный пункт навигации
    this.navItems.forEach(n => n.classList.remove('active'));
    const activeNav = document.querySelector(`[data-page="${pageId}"]`);
    if (activeNav) {
      activeNav.classList.add('active');
    }

    // Показываем нужную страницу
    this.pages.forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      targetPage.classList.add('active');
    }
  },

  getCurrentPage() {
    const activePage = document.querySelector('.page.active');
    return activePage ? activePage.id : null;
  }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => Navigation.init());
