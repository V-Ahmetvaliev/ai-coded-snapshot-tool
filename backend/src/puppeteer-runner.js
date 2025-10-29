const puppeteer = require('puppeteer');
const { PUPPETEER_CONFIG, SCREENSHOT_SETTINGS } = require('./config/constants');
const ActionExecutor = require('./action-executor');
const ScreenshotManager = require('./screenshot-manager');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class SnapshotRunner {
  constructor(io, debugMode = false, isBatchMode = false) {
    this.logs = [];
    this.io = io;
    this.debugMode = debugMode;
    this.isBatchMode = isBatchMode;
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    this.logs.push(logMessage);

    if (this.io) {
      this.io.emit('log', logMessage);
    }
  }

  buildFullUrl(baseUrl, screenUrl) {
    if (!screenUrl || screenUrl.trim() === '') {
      return '';
    }

    let fullUrl = '';

    if (screenUrl.startsWith('http://') || screenUrl.startsWith('https://')) {
      fullUrl = screenUrl;
    } else {
      if (!baseUrl || baseUrl.trim() === '') {
        this.log(`⚠️ Warning: Relative URL "${screenUrl}" provided but no base URL configured`);
        fullUrl = screenUrl;
      } else {
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const cleanScreenUrl = screenUrl.startsWith('/') ? screenUrl : '/' + screenUrl;
        fullUrl = cleanBaseUrl + cleanScreenUrl;
      }
    }

    try {
      new URL(fullUrl);
      return fullUrl;
    } catch (error) {
      this.log(`❌ Invalid URL generated: "${fullUrl}" from base="${baseUrl}" + screen="${screenUrl}"`);
      return '';
    }
  }

  async executeActionsWithPreviews(page, actions, actionType, screenName, viewportName, screen, viewportType) {
    if (!actions || actions.length === 0) return;

    for (const action of actions) {
      await this.actionExecutor.executeAction(page, action, viewportType);

      if (this.debugMode) {
        await this.screenshotManager.sendLivePreview(page, screenName, viewportName, `after-${actionType}-action`, screen);
      }
    }
  }

  // ✅ NEW: Process a single screen with its own browser instance
  async processScreen(screen, config, screenIndex, totalScreens, paddingLength) {
    let browser = null;

    try {
      // ✅ Check if at least one viewport is enabled
      const enableDesktop = screen.enableDesktop !== false;
      const enableMobile = screen.enableMobile !== false;

      if (!enableDesktop && !enableMobile) {
        this.log(`[${screen.fileName}] ⚠️ Both viewports disabled - skipping screen`);
        return {
          success: true,
          screen: screen.fileName,
          screenshots: [],
          skipped: true
        };
      }

      this.log(`[${screen.fileName}] 🚀 Launching dedicated browser instance...`);
      if (!enableDesktop) {
        this.log(`[${screen.fileName}] ℹ️ Desktop viewport disabled - mobile only`);
      }
      if (!enableMobile) {
        this.log(`[${screen.fileName}] ℹ️ Mobile viewport disabled - desktop only`);
      }

      browser = await puppeteer.launch(PUPPETEER_CONFIG);

      const actionExecutor = new ActionExecutor(this.log.bind(this));
      const screenshotManager = new ScreenshotManager(
        this.log.bind(this),
        this.io,
        this.debugMode,
        this.isBatchMode
      );

      const screenWithIndex = {
        ...screen,
        screenIndex: screenIndex,
        paddingLength: paddingLength
      };

      const fullUrl = this.buildFullUrl(config.baseUrl, screen.url);

      if (!fullUrl) {
        throw new Error(`Invalid URL for screen: ${screen.fileName}`);
      }

      // ✅ Process only enabled viewports
      const viewportTasks = [];

      if (enableDesktop) {
        viewportTasks.push(
          this.processScreenViewport(browser, screenWithIndex, config, 'desktop', actionExecutor, screenshotManager)
        );
      }

      if (enableMobile) {
        viewportTasks.push(
          this.processScreenViewport(browser, screenWithIndex, config, 'mobile', actionExecutor, screenshotManager)
        );
      }

      const results = await Promise.allSettled(viewportTasks);

      const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success !== false).length;
      const failed = results.filter(r => r.status === 'rejected' || r.value?.success === false).length;

      const viewportCount = enableDesktop && enableMobile ? 'both' : enableDesktop ? 'desktop only' : 'mobile only';
      this.log(`[${screen.fileName}] ✅ Browser instance completed (${viewportCount}) - ${successful} successful, ${failed} failed`);

      const screenshots = screenshotManager.getScreenshots();

      return {
        success: failed === 0,
        screen: screen.fileName,
        screenshots: screenshots,
        results: results
      };

    } catch (error) {
      this.log(`[${screen.fileName}] ❌ Browser instance error: ${error.message}`);
      return {
        success: false,
        screen: screen.fileName,
        error: error.message
      };
    } finally {
      if (browser) {
        try {
          await browser.close();
          this.log(`[${screen.fileName}] 🔒 Browser instance closed`);
        } catch (e) {
          this.log(`[${screen.fileName}] ⚠️ Failed to close browser: ${e.message}`);
        }
      }
    }
  }


  async processScreenViewport(browser, screen, config, viewportType, actionExecutor, screenshotManager) {
    let page = await browser.newPage();
    const viewportName = viewportType === 'desktop' ? 'Desktop' : 'Mobile';

    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        attempt++;

        if (attempt > 1) {
          this.log(`[${screen.fileName}] ${viewportName}: Retry attempt ${attempt}/${maxRetries + 1}`);
        }

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

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

        this.log(`[${screen.fileName}] ${viewportName}: Setting viewport ${width}x${height} with deviceScaleFactor: 1`);
        await page.setViewport({
          width,
          height,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
          isLandscape: false
        });

        const actualViewport = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        }));

        this.log(`[${screen.fileName}] ${viewportName}: Verified viewport - ${actualViewport.width}x${actualViewport.height}, DPR: ${actualViewport.devicePixelRatio}`);

        if (actualViewport.width !== width || actualViewport.devicePixelRatio !== 1) {
          this.log(`[${screen.fileName}] ${viewportName}: ⚠️ Viewport mismatch - forcing reset`);

          await page.setViewport({
            width,
            height,
            deviceScaleFactor: 1,
            isMobile: false,
            hasTouch: false
          });

          await sleep(500);
        }

        await screenshotManager.sendLivePreview(page, screen.fileName, viewportName, 'initializing', screen);

        const fullUrl = this.buildFullUrl(config.baseUrl, screen.url);

        if (!fullUrl) {
          throw new Error(`Invalid or missing URL for screen "${screen.fileName}"`);
        }

        this.log(`[${screen.fileName}] ${viewportName}: Navigating to ${fullUrl}`);

        await page.goto(fullUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        const initialDelay = this.isBatchMode ? 3000 : 2000;
        await sleep(initialDelay);

        await screenshotManager.sendLivePreview(page, screen.fileName, viewportName, 'page-loaded', screen);

        if (config.enableLazyLoading !== false) {
          await screenshotManager.triggerLazyLoadingAndAnimations(page, screen.fileName, viewportName, screen);
        }

        const specificActions = viewportType === 'desktop' ? screen.desktopActions : screen.mobileActions;

        this.log(`Executing ${screen.sharedActions?.length || 0} shared action(s) for ${viewportName}`);
        await this.executeActionsWithPreviews(page, screen.sharedActions, 'shared', screen.fileName, viewportName, screen, viewportType, actionExecutor, screenshotManager);

        this.log(`Executing ${specificActions?.length || 0} ${viewportType} action(s) for ${viewportName}`);
        await this.executeActionsWithPreviews(page, specificActions, viewportType, screen.fileName, viewportName, screen, viewportType, actionExecutor, screenshotManager);

        const hasStoredScrollPosition = actionExecutor.hasScrollPosition(viewportType);

        if (hasStoredScrollPosition) {
          const scrollPosition = actionExecutor.getScrollPosition(viewportType);
          this.log(`[${screen.fileName}] ${viewportName}: Restoring scroll position to ${scrollPosition}px`);

          await page.evaluate((pos) => {
            window.scrollTo(0, pos);
          }, scrollPosition);

          const scrollDelay = this.isBatchMode ? 1500 : 1000;
          await sleep(scrollDelay);
        }

        await screenshotManager.takeFinalScreenshot(page, screen, viewportType);

        this.log(`[${screen.fileName}] ${viewportName}: ✅ Screenshot completed`);

        break;

      } catch (error) {
        this.log(`[${screen.fileName}] ${viewportName}: ❌ Error (Attempt ${attempt}/${maxRetries + 1}) - ${error.message}`);

        if (attempt > maxRetries) {
          this.log(`[${screen.fileName}] ${viewportName}: ⚠️ SKIPPED after ${maxRetries + 1} attempts`);

          return {
            success: false,
            screen: screen.fileName,
            viewport: viewportName,
            error: error.message
          };
        }

        this.log(`[${screen.fileName}] ${viewportName}: Waiting 3 seconds before retry...`);
        await sleep(3000);

        try {
          await page.close();
        } catch (e) {
          // Ignore
        }

        page = await browser.newPage();
      }
    }

    try {
      await page.close();
    } catch (e) {
      this.log(`[${screen.fileName}] ${viewportName}: Warning - failed to close page: ${e.message}`);
    }

    return { success: true, screen: screen.fileName, viewport: viewportName };
  }

  // Fixed: Pass actionExecutor and screenshotManager
  async executeActionsWithPreviews(page, actions, actionType, screenName, viewportName, screen, viewportType, actionExecutor, screenshotManager) {
    if (!actions || actions.length === 0) return;

    for (const action of actions) {
      await actionExecutor.executeAction(page, action, viewportType);

      if (this.debugMode) {
        await screenshotManager.sendLivePreview(page, screenName, viewportName, `after-${actionType}-action`, screen);
      }
    }
  }

  // ✅ NEW: Run with concurrency limit
  async runSnapshot(config) {
    try {
      const CONCURRENCY_LIMIT = 8;

      this.log(`🚀 Starting snapshot process with ${CONCURRENCY_LIMIT} concurrent browser instances...`);

      const totalScreens = config.screens.length;
      const paddingLength = totalScreens.toString().length;

      const allScreenshots = [];
      const failedScreens = [];
      let completedCount = 0;

      for (let i = 0; i < totalScreens; i += CONCURRENCY_LIMIT) {
        const batch = config.screens.slice(i, i + CONCURRENCY_LIMIT);
        const batchNumber = Math.floor(i / CONCURRENCY_LIMIT) + 1;
        const totalBatches = Math.ceil(totalScreens / CONCURRENCY_LIMIT);

        this.log(`\n${'='.repeat(60)}`);
        this.log(`📦 Starting batch ${batchNumber}/${totalBatches} (${batch.length} screens)`);
        this.log(`${'='.repeat(60)}\n`);

        const batchPromises = batch.map((screen, batchIndex) => {
          // ✅ Use screen.screenIndex if already set, otherwise calculate
          const screenIndex = screen.screenIndex !== undefined && screen.screenIndex !== null
            ? screen.screenIndex
            : i + batchIndex + 1;

          // ✅ Use screen.paddingLength if already set, otherwise calculate
          const padding = screen.paddingLength !== undefined && screen.paddingLength !== null
            ? screen.paddingLength
            : paddingLength;

          const fullUrl = this.buildFullUrl(config.baseUrl, screen.url);

          if (!fullUrl) {
            this.log(`⚠️ Skipping screen with no URL: ${screen.fileName}`);
            return Promise.resolve({ success: false, screen: screen.fileName, error: 'No URL' });
          }

          return this.processScreen(screen, config, screenIndex, totalScreens, padding);
        });

        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, idx) => {
          completedCount++;

          if (result.status === 'fulfilled' && result.value?.success) {
            if (result.value.screenshots) {
              allScreenshots.push(...result.value.screenshots);
            }
            this.log(`✅ [${completedCount}/${totalScreens}] ${result.value.screen} completed successfully`);
          } else {
            const error = result.status === 'rejected' ? result.reason.message : result.value?.error;
            failedScreens.push({
              screen: result.value?.screen || batch[idx].fileName,
              error: error || 'Unknown error'
            });
            this.log(`❌ [${completedCount}/${totalScreens}] ${batch[idx].fileName} failed: ${error}`);
          }
        });

        if (i + CONCURRENCY_LIMIT < totalScreens) {
          this.log(`\n⏸️ Waiting 2 seconds before next batch...\n`);
          await sleep(2000);
        }
      }

      const successful = totalScreens - failedScreens.length;

      this.log(`\n${'='.repeat(60)}`);
      this.log(`📊 Final Summary`);
      this.log(`${'='.repeat(60)}`);
      this.log(`✅ Successful: ${successful}`);
      this.log(`❌ Failed: ${failedScreens.length}`);
      this.log(`${'='.repeat(60)}\n`);

      if (failedScreens.length > 0) {
        this.log(`⚠️ Failed Screens:`);
        failedScreens.forEach((failure, idx) => {
          this.log(`  ${idx + 1}. ${failure.screen}: ${failure.error}`);
        });
      }

      return {
        logs: this.logs,
        screenshots: allScreenshots,
        summary: {
          total: totalScreens,
          successful,
          failed: failedScreens.length,
          failedScreens
        }
      };

    } catch (error) {
      this.log(`❌ Fatal error: ${error.message}`);
      throw error;
    }
  }

}

module.exports = async (config, io, debugMode = false) => {
  const isBatchMode = config.screens && config.screens.length > 1;
  const runner = new SnapshotRunner(io, debugMode, isBatchMode);
  return await runner.runSnapshot(config);
};
