const puppeteer = require('puppeteer');
const ActionExecutor = require('./action-executor');
const ScreenshotManager = require('./screenshot-manager');
const { PUPPETEER_CONFIG, SCREENSHOT_SETTINGS } = require('./config/constants');

class SnapshotRunner {
  constructor(io, debugMode = false) {
    this.browser = null;
    this.logs = [];
    this.io = io;
    this.debugMode = debugMode;
    this.actionExecutor = new ActionExecutor(this.log.bind(this));
    this.screenshotManager = new ScreenshotManager(this.log.bind(this), io, debugMode);
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    this.logs.push(logMessage);
    console.log(logMessage);

    if (this.debugMode && this.io) {
      this.io.emit('log', logMessage);
    }
  }

  async processScreenViewport(browser, screen, config, viewportType) {
    const page = await browser.newPage();
    const viewportName = viewportType === 'desktop' ? 'Desktop' : 'Mobile';

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      // **FIXED: Authenticate BEFORE setting viewport and navigating**
      if (config.username && config.password) {
        this.log(`[${screen.fileName}] ${viewportName}: Setting up authentication for ${config.username}`);
        await page.authenticate({
          username: config.username,
          password: config.password
        });
      }

      const width = viewportType === 'desktop' ?
        parseInt(config.desktopWidth, 10) || SCREENSHOT_SETTINGS.DEFAULT_VIEWPORT.desktop.width :
        parseInt(config.mobileWidth, 10) || SCREENSHOT_SETTINGS.DEFAULT_VIEWPORT.mobile.width;
      const height = viewportType === 'desktop' ?
        parseInt(config.desktopHeight, 10) || SCREENSHOT_SETTINGS.DEFAULT_VIEWPORT.desktop.height :
        parseInt(config.mobileHeight, 10) || SCREENSHOT_SETTINGS.DEFAULT_VIEWPORT.mobile.height;

      this.log(`[${screen.fileName}] ${viewportName}: Setting viewport ${width}x${height}`);
      await page.setViewport({ width, height });

      await this.screenshotManager.sendLivePreview(page, screen.fileName, viewportName, 'initializing', screen);

      this.log(`[${screen.fileName}] ${viewportName}: Navigating to ${screen.url} with authentication`);

      // Navigate with longer timeout for auth
      await page.goto(screen.url, {
        waitUntil: 'networkidle0',
        timeout: 90000  // Increased timeout for auth
      });

      await this.screenshotManager.sendLivePreview(page, screen.fileName, viewportName, 'loaded', screen);

      if (config.enableLazyLoading !== false) {
        await this.screenshotManager.triggerLazyLoadingAndAnimations(page, screen.fileName, viewportName, screen);
      }

      await this.screenshotManager.sendLivePreview(page, screen.fileName, viewportName, 'lazy-loaded', screen);

      // **FIXED: Pass viewport type to action executor**
      const specificActions = viewportType === 'desktop' ? screen.desktopActions : screen.mobileActions;
      await this.executeActionsWithPreviews(page, screen.sharedActions, 'shared', screen.fileName, viewportName, screen, viewportType);
      await this.executeActionsWithPreviews(page, specificActions, viewportType, screen.fileName, viewportName, screen, viewportType);

      // **FIXED: Check for stored scroll position for this specific viewport**
      const hasStoredScrollPosition = this.actionExecutor.hasScrollPosition(viewportType);

      if (!hasStoredScrollPosition) {
        // No scroll actions for this viewport - reset to top as usual
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1000);
        await this.screenshotManager.sendLivePreview(page, screen.fileName, viewportName, 'final-top', screen);
      } else {
        // **Scroll actions performed for this viewport - preserve viewport-specific position**
        this.log(`[${screen.fileName}] ${viewportName}: Preserving scroll position using viewport-specific coordinates`);

        // Wait extra time for any page settling
        await page.waitForTimeout(2000);

        // Attempt to restore scroll position for this viewport
        const restored = await this.actionExecutor.restoreScrollPosition(page, viewportType);

        if (restored) {
          // Extra wait after restoration
          await page.waitForTimeout(1000);
        }

        // Final verification and debug info
        const finalPos = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollX: window.scrollX,
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight
        }));

        const storedPos = this.actionExecutor.getScrollPosition(viewportType);
        this.log(`[${screen.fileName}] ${viewportName}: Final position (${finalPos.scrollX}, ${finalPos.scrollY}) vs stored (${storedPos?.scrollX}, ${storedPos?.scrollY})`);

        await this.screenshotManager.sendLivePreview(page, screen.fileName, viewportName, 'final-scrolled', screen);
      }

      await this.screenshotManager.takeFinalScreenshot(page, screen, viewportType);

      this.log(`[${screen.fileName}] ${viewportName}: ✅ Screenshot completed`);

    } catch (error) {
      this.log(`[${screen.fileName}] ${viewportName}: ❌ Error - ${error.message}`);
      throw error;
    } finally {
      await page.close();
    }
  }

  async executeActionsWithPreviews(page, actions, label, screenName, viewportName, screen, viewportType) {
    if (!actions || actions.length === 0) {
      this.log(`No ${label} actions to execute for ${viewportName}`);
      return;
    }

    this.log(`Executing ${actions.length} ${label} action(s) for ${viewportName}`);

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      await this.actionExecutor.executeAction(page, action, viewportType);

      // Send preview after significant actions in debug mode
      if (this.debugMode && ['Adjust Styling', 'Execute JS', 'Show Element', 'Remove Element', 'Scroll Into View'].includes(action.type)) {
        await this.screenshotManager.sendLivePreview(page, screenName, viewportName, `action-${i}-${action.type.toLowerCase()}`, screen);
      }

      // **After scroll actions, re-verify position for this viewport**
      if (action.type === 'Scroll Into View') {
        await page.waitForTimeout(500);

        // Double-check and re-store position after action preview for this viewport
        const currentPos = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollX: window.scrollX,
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          timestamp: Date.now()
        }));

        this.actionExecutor.scrollPositions[viewportType] = currentPos;
        this.log(`Re-stored scroll position for ${viewportType} after action: ${currentPos.scrollY}px`);
      }
    }
  }

  async runSnapshot(config) {
    try {
      this.log('🚀 Starting Puppeteer browser...');

      this.browser = await puppeteer.launch(PUPPETEER_CONFIG);

      const screenshotTasks = [];

      for (const screen of config.screens) {
        if (!screen.url) {
          this.log(`⚠️ Skipping screen with no URL: ${screen.fileName}`);
          continue;
        }

        // **Clear scroll positions for each new screen**
        this.actionExecutor.clearScrollPositions();

        screenshotTasks.push(
          this.processScreenViewport(this.browser, screen, config, 'desktop'),
          this.processScreenViewport(this.browser, screen, config, 'mobile')
        );
      }

      this.log(`📸 Starting ${screenshotTasks.length} parallel screenshot tasks...`);

      const results = [];

      for (let i = 0; i < screenshotTasks.length; i += SCREENSHOT_SETTINGS.BATCH_SIZE) {
        const batch = screenshotTasks.slice(i, i + SCREENSHOT_SETTINGS.BATCH_SIZE);
        this.log(`Processing batch ${Math.floor(i/SCREENSHOT_SETTINGS.BATCH_SIZE) + 1}/${Math.ceil(screenshotTasks.length/SCREENSHOT_SETTINGS.BATCH_SIZE)} (${batch.length} tasks)`);

        try {
          const batchResults = await Promise.allSettled(batch);
          results.push(...batchResults);

          const successful = batchResults.filter(r => r.status === 'fulfilled').length;
          const failed = batchResults.filter(r => r.status === 'rejected').length;
          this.log(`Batch completed: ${successful} successful, ${failed} failed`);

        } catch (error) {
          this.log(`❌ Batch error: ${error.message}`);
        }
      }

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed > 0) {
        this.log(`⚠️ Completed with ${successful} successful and ${failed} failed screenshots`);
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            this.log(`❌ Task ${index + 1} failed: ${result.reason.message}`);
          }
        });
      } else {
        this.log(`✅ All ${successful} screenshots completed successfully!`);
      }

      return {
        logs: this.logs,
        screenshots: this.screenshotManager.getScreenshots(),
        summary: {
          total: screenshotTasks.length,
          successful,
          failed
        }
      };

    } catch (error) {
      this.log(`❌ Fatal error: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.log('🔒 Browser closed');
      }
    }
  }
}

module.exports = async (config, io, debugMode = false) => {
  const runner = new SnapshotRunner(io, debugMode);
  return await runner.runSnapshot(config);
};
