const path = require('path');
const { SCREENSHOT_SETTINGS } = require('./config/constants');

class ScreenshotManager {
  constructor(logger, io, debugMode) {
    this.log = logger;
    this.io = io;
    this.debugMode = debugMode;
    this.screenshots = [];
  }

  async sendLivePreview(page, screenName, viewportType, step, screen) {
    if (!this.debugMode || !this.io) return;

    try {
      console.log(`📸 Taking preview screenshot for ${screenName} - ${step}`);

      // For previews, use the current viewport settings
      const screenshot = await page.screenshot({
        encoding: 'base64',
        type: 'jpeg',
        quality: SCREENSHOT_SETTINGS.PREVIEW_QUALITY,
        fullPage: screen.screenshotType === 'Full Page'
      });

      const previewData = {
        image: `data:image/jpeg;base64,${screenshot}`,
        screenName,
        viewportType,
        step,
        timestamp: Date.now(),
        screenshotType: screen.screenshotType || 'Full Page'
      };

      console.log(`📤 Emitting preview (${screenshot.length} chars)`);
      this.io.emit('preview', previewData);

    } catch (error) {
      console.error(`❌ sendLivePreview error:`, error.message);
    }
  }

  async takeFinalScreenshot(page, screen, viewportType) {
    await page.waitForTimeout(1000);

    const filename = `${screen.fileName}-${viewportType}.png`;
    const screenshotPath = path.join(__dirname, '..', 'snapshots', filename);

    try {
      if (screen.screenshotType === 'Screenshot of Selector') {
        await this.takeElementBasedScreenshot(page, screen, screenshotPath, viewportType);
      } else {
        await this.takeStandardScreenshot(page, screen, screenshotPath, viewportType);
      }

      this.screenshots.push({
        filename,
        path: screenshotPath,
        url: `/snapshots/${filename}`,
        screen: screen.fileName,
        viewport: viewportType,
        screenshotType: screen.screenshotType || 'Full Page'
      });

      this.log(`📸 Screenshot saved: ${filename}`);
    } catch (error) {
      this.log(`❌ Failed to take screenshot: ${error.message}`);
      throw error;
    }

    return screenshotPath;
  }

  async takeStandardScreenshot(page, screen, screenshotPath, viewportType) {
    const scrollInfo = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight
    }));

    this.log(`Taking standard screenshot at scroll position: ${scrollInfo.scrollY}px`);

    await page.screenshot({
      path: screenshotPath,
      fullPage: screen.screenshotType === 'Full Page',
      type: 'png'
    });
  }

  async takeElementBasedScreenshot(page, screen, screenshotPath, viewportType) {
    if (!screen.selectorToScreenshot) {
      throw new Error('Selector is required for Screenshot of Selector');
    }

    // **STEP 1: Enable request interception to block unwanted navigation**
    await page.setRequestInterception(true);

    // Block navigation requests during screenshot process
    const requestHandler = (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        this.log(`🚫 Blocking navigation to: ${request.url()}`);
        request.abort();
      } else {
        request.continue();
      }
    };

    page.on('request', requestHandler);

    // **STEP 2: Prevent JavaScript-triggered navigation**
    await page.evaluate(() => {
      // Override methods that can cause navigation
      const originalAssign = window.location.assign;
      const originalReplace = window.location.replace;
      const originalReload = window.location.reload;

      window.location.assign = function(url) {
        console.log('Blocked location.assign to:', url);
      };

      window.location.replace = function(url) {
        console.log('Blocked location.replace to:', url);
      };

      window.location.reload = function() {
        console.log('Blocked location.reload');
      };

      // Block form submissions
      document.addEventListener('submit', function(e) {
        console.log('Blocked form submission');
        e.preventDefault();
        e.stopPropagation();
      }, true);

      // Block hash changes that might trigger navigation
      window.addEventListener('hashchange', function(e) {
        console.log('Blocked hashchange');
        e.preventDefault();
        e.stopPropagation();
      }, true);

      // Store original methods for later restoration (optional)
      window.__originalLocationMethods = {
        assign: originalAssign,
        replace: originalReplace,
        reload: originalReload
      };
    });

    try {
      this.log(`Taking element-based screenshot for selector: ${screen.selectorToScreenshot}`);

      // Wait for element to be present
      await page.waitForSelector(screen.selectorToScreenshot, { timeout: 10000 });

      // Extended wait for page stability
      this.log('Waiting for page stability after blocking navigation...');
      await page.waitForTimeout(3000);

      // Get element dimensions
      const elementInfo = await page.evaluate(selector => {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`Element not found: ${selector}`);
        }

        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left
        };
      }, screen.selectorToScreenshot);

      this.log(`Element dimensions: ${elementInfo.width}x${elementInfo.height}`);

      // Calculate viewport with compensation
      const heightCompensation = parseInt(screen.heightCompensation || 0);
      const targetHeight = Math.max(200, Math.round(elementInfo.height + heightCompensation));
      const targetWidth = Math.max(300, Math.round(elementInfo.width));

      // Store original viewport
      const originalViewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }));

      this.log(`Setting viewport to ${targetWidth}x${targetHeight} (compensation: ${heightCompensation}px)`);

      // Set new viewport
      await page.setViewport({
        width: targetWidth,
        height: targetHeight,
        deviceScaleFactor: 1
      });

      // Wait for viewport change
      await page.waitForTimeout(2000);

      // Center element in new viewport
      await page.evaluate((selector, targetHeight) => {
        const element = document.querySelector(selector);
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const viewportCenter = targetHeight / 2;
        const scrollOffset = elementCenter - viewportCenter;

        window.scrollTo(0, window.scrollY + scrollOffset);
      }, screen.selectorToScreenshot, targetHeight);

      // Final wait
      await page.waitForTimeout(1500);

      // Log final state
      const finalScrollInfo = await page.evaluate(() => ({
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        url: window.location.href
      }));

      this.log(`Final state - viewport: ${finalScrollInfo.viewportWidth}x${finalScrollInfo.viewportHeight}, scroll: ${finalScrollInfo.scrollY}px`);

      // Take screenshot
      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
        type: 'png'
      });

      // Send final preview
      if (this.debugMode) {
        await this.sendLivePreview(page, screen.fileName, viewportType, 'element-final-stable', screen);
      }

      // Restore original viewport
      await page.setViewport({
        width: originalViewport.width,
        height: originalViewport.height,
        deviceScaleFactor: 1
      });

    } finally {
      // **STEP 3: Clean up - remove request interception and restore navigation**
      page.off('request', requestHandler);

      // Optionally restore original navigation methods
      await page.evaluate(() => {
        if (window.__originalLocationMethods) {
          window.location.assign = window.__originalLocationMethods.assign;
          window.location.replace = window.__originalLocationMethods.replace;
          window.location.reload = window.__originalLocationMethods.reload;
          delete window.__originalLocationMethods;
        }
      });

      await page.setRequestInterception(false);
      this.log('Navigation blocking disabled - screenshot complete');
    }
  }



  async triggerLazyLoadingAndAnimations(page, screenName, viewportName, screen) {
    this.log(`[${screenName}] ${viewportName}: 🔄 Triggering lazy loading and animations...`);

    try {
      await this.sendLivePreview(page, screenName, viewportName, 'lazy-start', screen);

      const initialPageInfo = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight
      }));

      this.log(`[${screenName}] ${viewportName}: Initial page height: ${initialPageInfo.scrollHeight}px`);

      await page.evaluate(async () => {
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        let totalHeight = Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        );

        const viewportHeight = window.innerHeight;
        let currentHeight = totalHeight;

        for (let pass = 0; pass < 2; pass++) {
          console.log(`Pass ${pass + 1}: Scrolling through ${totalHeight}px`);

          for (let position = 0; position <= totalHeight; position += viewportHeight / 4) {
            window.scrollTo(0, Math.min(position, totalHeight));
            window.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('resize'));
            await delay(200);

            const newHeight = Math.max(
              document.body.scrollHeight,
              document.body.offsetHeight,
              document.documentElement.clientHeight,
              document.documentElement.scrollHeight,
              document.documentElement.offsetHeight
            );

            if (newHeight > totalHeight) {
              totalHeight = newHeight;
            }
          }

          window.scrollTo(0, totalHeight);
          window.dispatchEvent(new Event('scroll'));
          await delay(1000);

          const finalHeight = Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.clientHeight,
            document.documentElement.scrollHeight,
            document.documentElement.offsetHeight
          );

          if (finalHeight > currentHeight) {
            totalHeight = finalHeight;
            currentHeight = finalHeight;
          } else {
            break;
          }
        }

        for (let position = totalHeight; position >= 0; position -= viewportHeight / 3) {
          window.scrollTo(0, Math.max(position, 0));
          window.dispatchEvent(new Event('scroll'));
          await delay(150);
        }

        window.scrollTo(0, 0);
        window.dispatchEvent(new Event('scroll'));
        await delay(500);
      });

      this.log(`[${screenName}] ${viewportName}: ⏳ Waiting for first network idle...`);
      try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        this.log(`[${screenName}] ${viewportName}: ✅ First network idle completed`);
        await this.sendLivePreview(page, screenName, viewportName, 'network-idle-1', screen);
      } catch (e) {
        this.log(`[${screenName}] ${viewportName}: ⚠️ First network idle timeout`);
      }

      await page.waitForTimeout(1500);

      this.log(`[${screenName}] ${viewportName}: ⏳ Waiting for second network idle...`);
      try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        this.log(`[${screenName}] ${viewportName}: ✅ Second network idle completed`);
        await this.sendLivePreview(page, screenName, viewportName, 'network-idle-2', screen);
      } catch (e) {
        this.log(`[${screenName}] ${viewportName}: ⚠️ Second network idle timeout`);
      }

      const finalPageInfo = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight
      }));

      if (finalPageInfo.scrollHeight > initialPageInfo.scrollHeight) {
        this.log(`[${screenName}] ${viewportName}: ✅ Lazy content loaded (${initialPageInfo.scrollHeight}px → ${finalPageInfo.scrollHeight}px)`);
      } else {
        this.log(`[${screenName}] ${viewportName}: ✅ Page scroll completed`);
      }

    } catch (error) {
      this.log(`[${screenName}] ${viewportName}: ⚠️ Lazy loading failed: ${error.message}`);
    }
  }

  getScreenshots() {
    return this.screenshots;
  }
}

module.exports = ScreenshotManager;
