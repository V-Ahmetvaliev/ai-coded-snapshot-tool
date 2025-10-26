module.exports = {
  ACTION_TYPES: [
    'Delay',
    'Adjust Styling',
    'Execute JS',
    'Fill Form',
    'Remove Element',
    'Show Element',
    'Click Selector',
    'Hover Selector',
    'Scroll Into View',
    'Scroll Horizontally'
  ],

  SCREENSHOT_TYPES: [
    'Full Page',
    'Viewport Only',
    'Screenshot of Selector'
  ],

  PUPPETEER_CONFIG: {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--max_old_space_size=4096'
    ]
  },

  SCREENSHOT_SETTINGS: {
    PREVIEW_QUALITY: 60,
    FINAL_QUALITY: 100,
    BATCH_SIZE: 8,
    DEFAULT_VIEWPORT: {
      desktop: { width: 1920, height: 1080 },
      mobile: { width: 436, height: 1080 }
    }
  }
};
