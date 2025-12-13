/**
 * Background Slideshow Module
 * Cycles through background images on all pages
 */

const Slideshow = {
  currentIndex: 1,
  totalImages: 5,
  interval: null,
  intervalTime: 10000, // 10 seconds

  init() {
    // Use .launcher container for full-launcher background
    this.element = document.querySelector('.launcher');
    if (!this.element) return;

    // Set initial background class
    this.element.classList.add(`bg-${this.currentIndex}`);

    // Start automatic slideshow
    this.start();
  },

  start() {
    if (this.interval) return;
    
    this.interval = setInterval(() => {
      this.next();
    }, this.intervalTime);
  },

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  },

  next() {
    if (!this.element) return;

    // Remove current background class
    this.element.classList.remove(`bg-${this.currentIndex}`);

    // Move to next image
    this.currentIndex++;
    if (this.currentIndex > this.totalImages) {
      this.currentIndex = 1;
    }

    // Add new background class
    this.element.classList.add(`bg-${this.currentIndex}`);
  },

  prev() {
    if (!this.element) return;

    // Remove current background class
    this.element.classList.remove(`bg-${this.currentIndex}`);

    // Move to previous image
    this.currentIndex--;
    if (this.currentIndex < 1) {
      this.currentIndex = this.totalImages;
    }

    // Add new background class
    this.element.classList.add(`bg-${this.currentIndex}`);
  },

  goTo(index) {
    if (!this.element || index < 1 || index > this.totalImages) return;

    // Remove current background class
    this.element.classList.remove(`bg-${this.currentIndex}`);

    // Set new index
    this.currentIndex = index;

    // Add new background class
    this.element.classList.add(`bg-${this.currentIndex}`);
  }
};

// Initialize slideshow when DOM is ready
document.addEventListener('DOMContentLoaded', () => Slideshow.init());
