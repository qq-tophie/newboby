/**
 * Modals Module
 */

const Modals = {
  init() {
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAll();
      }
    });

    // Закрытие по клику на backdrop
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.close(modal.id);
        }
      });
    });
  },

  open(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
    }
  },

  close(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('open');
    }
  },

  closeAll() {
    document.querySelectorAll('.modal.open').forEach(modal => {
      modal.classList.remove('open');
    });
  }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => Modals.init());
