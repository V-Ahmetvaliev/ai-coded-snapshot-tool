const path = require('path');
const { SCREENSHOT_SETTINGS } = require('./config/constants');
const fs = require("fs");
const sleep = require('node:timers/promises').setTimeout;

class ScreenshotManager {
  constructor(log, io = null, debugMode = false, isBatchMode = false) {
    this.log = log;
    this.io = io;
    this.debugMode = debugMode;
    this.isBatchMode = isBatchMode;
    this.screenshots = [];
  }

  getDelayMultiplier() {
    return this.isBatchMode ? 2.5 : 1;
  }

  async sendLivePreview(page, screenName, viewportType, step, screen) {
    if (!this.debugMode || !this.io) return;

    try {
      console.log(`📸 Taking preview screenshot for ${screenName} - ${step}`);

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

  // ✅ NEW: Ensure viewport folders exist
  async ensureViewportFolders() {
    const snapshotsDir = path.join(__dirname, '..', 'snapshots');
    const desktopDir = path.join(snapshotsDir, 'desktop');
    const mobileDir = path.join(snapshotsDir, 'mobile');

    try {
      await fs.mkdir(snapshotsDir, { recursive: true });
      await fs.mkdir(desktopDir, { recursive: true });
      await fs.mkdir(mobileDir, { recursive: true });
      this.log(`📁 Ensured viewport folders exist: desktop/ and mobile/`);
    } catch (error) {
      this.log(`⚠️ Error creating viewport folders: ${error.message}`);
    }
  }

  // ✅ UPDATED: Generate screenshot path with viewport folder
  generateScreenshotPath(screen, viewportType) {
    const snapshotsDir = path.join(__dirname, '..', 'snapshots');

    // Add viewport subfolder
    const viewportFolder = viewportType === 'desktop' ? 'desktop' : 'mobile';
    const viewportDir = path.join(snapshotsDir, viewportFolder);

    const paddingLength = screen.paddingLength || 2;
    const screenIndex = screen.screenIndex !== undefined ? screen.screenIndex : 1;
    const paddedIndex = String(screenIndex).padStart(paddingLength, '0');
    const viewportName = viewportType === 'desktop' ? 'desktop' : 'mobile';
    const fileName = `${paddedIndex}. ${screen.fileName} ${viewportName}.png`;

    return path.join(viewportDir, fileName);
  }

  async takeFinalScreenshot(page, screen, viewportType) {
    // ✅ Ensure folders exist before taking screenshot
    await this.ensureViewportFolders();
    await sleep(1000);

    // ✅ Build numbered filename
    const prefix = screen.screenIndex
      ? String(screen.screenIndex).padStart(screen.paddingLength || 1, '0') + '. '
      : '';

    const filename = `${prefix}${screen.fileName} ${viewportType}.png`;
    const screenshotPath = this.generateScreenshotPath(screen, viewportType);

    this.log(`Taking final screenshot: ${path.basename(screenshotPath)}`);

    try {
      if (screen.screenshotType === 'Screenshot of Selector') {
        await this.takeElementBasedScreenshot(page, screen, screenshotPath, viewportType);
      } else {
        await this.takeStandardScreenshot(page, screen, screenshotPath, viewportType);
      }

      this.screenshots.push({
        screen: screen.fileName,
        viewport: viewportType,
        path: screenshotPath,
        timestamp: new Date().toISOString()
      });

      this.log(`✅ Screenshot saved: ${viewportType}/${path.basename(screenshotPath)}`);
    } catch (error) {
      this.log(`❌ Screenshot failed: ${error.message}`);
      throw error;
    }

    return screenshotPath;
  }

  async takeStandardScreenshot(page, screen, screenshotPath, viewportType) {
    const scrollInfo = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio
    }));

    this.log(`Taking standard screenshot at scroll position: ${scrollInfo.scrollY}px`);

    const delayMultiplier = this.getDelayMultiplier();
    await sleep(500 * delayMultiplier);

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

    await page.setRequestInterception(true);

    const requestHandler = (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        this.log(`🚫 Blocking navigation to: ${request.url()}`);
        request.abort();
      } else {
        request.continue();
      }
    };

    page.on('request', requestHandler);

    await page.evaluate(() => {
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

      document.addEventListener('submit', function(e) {
        console.log('Blocked form submission');
        e.preventDefault();
        e.stopPropagation();
      }, true);

      window.addEventListener('hashchange', function(e) {
        console.log('Blocked hashchange');
        e.preventDefault();
        e.stopPropagation();
      }, true);

      window.__originalLocationMethods = {
        assign: originalAssign,
        replace: originalReplace,
        reload: originalReload
      };
    });

    try {
      this.log(`Taking element-based screenshot for selector: ${screen.selectorToScreenshot}`);
      const delayMultiplier = this.getDelayMultiplier();

      await page.waitForSelector(screen.selectorToScreenshot, { timeout: 10000 });
      await sleep(1000);

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

      const heightCompensation = parseInt(screen.heightCompensation || 0);
      const targetHeight = Math.max(200, Math.round(elementInfo.height + heightCompensation));
      const targetWidth = Math.max(300, Math.round(elementInfo.width));

      const originalViewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }));

      this.log(`Setting viewport to ${targetWidth}x${targetHeight} (compensation: ${heightCompensation}px)`);

      await page.setViewport({
        width: targetWidth,
        height: targetHeight,
        deviceScaleFactor: 1,
        isMobile: false
      });

      await sleep(1000 * delayMultiplier);

      await page.evaluate((selector, targetHeight) => {
        const element = document.querySelector(selector);
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const viewportCenter = targetHeight / 2;
        const scrollOffset = elementCenter - viewportCenter;

        window.scrollTo(0, window.scrollY + scrollOffset);
      }, screen.selectorToScreenshot, targetHeight);

      await sleep(1500 * delayMultiplier);

      // ✅ Get element position in viewport AFTER scrolling
      const elementPositionInViewport = await page.evaluate(selector => {
        const element = document.querySelector(selector);
        if (!element) {
          return { top: 0, left: 0, width: 0, height: 0 };
        }

        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        };
      }, screen.selectorToScreenshot);

      const finalScrollInfo = await page.evaluate(() => ({
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        url: window.location.href
      }));

      this.log(`Final state - viewport: ${finalScrollInfo.viewportWidth}x${finalScrollInfo.viewportHeight}, scroll: ${finalScrollInfo.scrollY}px`);
      this.log(`Element position in viewport: (${elementPositionInViewport.left}, ${elementPositionInViewport.top}), size: ${elementPositionInViewport.width}x${elementPositionInViewport.height}`);

      // ✅ Get crop values
      const cropEnabled = screen.enableCrop === true;

      const cropLeft = cropEnabled && viewportType === 'desktop'
        ? (parseInt(screen.desktopCropLeft) || 0)
        : cropEnabled && viewportType === 'mobile'
          ? (parseInt(screen.mobileCropLeft) || 0)
          : 0;

      const cropRight = cropEnabled && viewportType === 'desktop'
        ? (parseInt(screen.desktopCropRight) || 0)
        : cropEnabled && viewportType === 'mobile'
          ? (parseInt(screen.mobileCropRight) || 0)
          : 0;

      const cropTop = cropEnabled && viewportType === 'desktop'
        ? (parseInt(screen.desktopCropTop) || 0)
        : cropEnabled && viewportType === 'mobile'
          ? (parseInt(screen.mobileCropTop) || 0)
          : 0;

      const cropBottom = cropEnabled && viewportType === 'desktop'
        ? (parseInt(screen.desktopCropBottom) || 0)
        : cropEnabled && viewportType === 'mobile'
          ? (parseInt(screen.mobileCropBottom) || 0)
          : 0;

      // ✅ Take screenshot with crop applied to element position
      if (cropEnabled && (cropLeft || cropRight || cropTop || cropBottom)) {
        // Calculate clip region: element position in viewport + crop offsets
        const clipX = Math.max(0, elementPositionInViewport.left + cropLeft);
        const clipY = Math.max(0, elementPositionInViewport.top + cropTop);
        const clipWidth = Math.max(1, elementPositionInViewport.width - cropLeft - cropRight);
        const clipHeight = Math.max(1, elementPositionInViewport.height - cropTop - cropBottom);

        this.log(`[${viewportType}] Element in viewport at (${elementPositionInViewport.left}, ${elementPositionInViewport.top}), size ${elementPositionInViewport.width}x${elementPositionInViewport.height}`);
        this.log(`[${viewportType}] Applying crop - L:${cropLeft} R:${cropRight} T:${cropTop} B:${cropBottom}`);
        this.log(`[${viewportType}] Clip region: x=${clipX}, y=${clipY}, width=${clipWidth}, height=${clipHeight}`);

        if (clipWidth > 0 && clipHeight > 0) {
          await page.screenshot({
            path: screenshotPath,
            fullPage: false,
            type: 'png',
            clip: {
              x: clipX,
              y: clipY + finalScrollInfo.scrollY,
              width: clipWidth,
              height: clipHeight
            }
          });
        } else {
          this.log(`[${viewportType}] ⚠️ Invalid clip dimensions, taking full screenshot`);
          await page.screenshot({
            path: screenshotPath,
            fullPage: false,
            type: 'png'
          });
        }
      } else {
        // No crop - standard screenshot
        this.log(`[${viewportType}] Taking full viewport screenshot ${targetWidth}x${targetHeight}`);
        await page.screenshot({
          path: screenshotPath,
          fullPage: false,
          type: 'png'
        });
      }

      if (this.debugMode) {
        await this.sendLivePreview(page, screen.fileName, viewportType, 'element-final-stable', screen);
      }

      await page.setViewport({
        width: originalViewport.width,
        height: originalViewport.height,
        deviceScaleFactor: 1,
        isMobile: false
      });

    } finally {
      page.off('request', requestHandler);

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
    this.log(`[${screenName}] ${viewportName}: 🔄 Triggering lazy loading with optimized scrolling...`);

    try {
      await this.sendLivePreview(page, screenName, viewportName, 'lazy-start', screen);

      const initialPageInfo = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight
      }));

      this.log(`[${screenName}] ${viewportName}: Initial page height: ${initialPageInfo.scrollHeight}px`);

      // Disable lazy loading libraries
      await this.disableLazyLoading(page);

      // ✅ FASTER VERSION: Reduced passes and faster scrolling
      await page.evaluate(async () => {
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Fast smooth scroll helper
        const smoothScrollTo = async (targetY, duration = 300) => { // Reduced from 600-800ms
          const startY = window.scrollY;
          const distance = targetY - startY;
          const startTime = performance.now();

          return new Promise(resolve => {
            const scroll = (currentTime) => {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);

              // Easing function (ease-in-out)
              const easing = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

              window.scrollTo(0, startY + distance * easing);

              if (progress < 1) {
                requestAnimationFrame(scroll);
              } else {
                resolve();
              }
            };

            requestAnimationFrame(scroll);
          });
        };

        let totalHeight = Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        );

        const viewportHeight = window.innerHeight;
        let currentHeight = totalHeight;

        // ✅ REDUCED TO 2 PASSES ONLY (was 3)
        for (let pass = 0; pass < 2; pass++) {
          console.log(`Smooth scroll pass ${pass + 1}/2 through ${totalHeight}px`);

          // ✅ LARGER STEPS: 100% viewport instead of 80%
          const scrollSteps = Math.ceil(totalHeight / viewportHeight);

          for (let step = 0; step <= scrollSteps; step++) {
            const targetPosition = Math.min((step * viewportHeight), totalHeight);

            // ✅ FASTER: 300ms instead of 600ms
            await smoothScrollTo(targetPosition, 300);

            window.dispatchEvent(new Event('scroll'));

            // ✅ REDUCED WAIT: 150ms instead of 400ms
            await delay(150);

            const newHeight = Math.max(
              document.body.scrollHeight,
              document.body.offsetHeight,
              document.documentElement.clientHeight,
              document.documentElement.scrollHeight,
              document.documentElement.offsetHeight
            );

            if (newHeight > totalHeight) {
              console.log(`Page grew from ${totalHeight}px to ${newHeight}px`);
              totalHeight = newHeight;
            }
          }

          // Smooth scroll to bottom
          await smoothScrollTo(totalHeight, 400); // Reduced from 800ms
          window.dispatchEvent(new Event('scroll'));
          await delay(500); // Reduced from 1500ms

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
            console.log(`Height updated to ${totalHeight}px, continuing...`);
          } else {
            console.log(`Height stable at ${totalHeight}px, stopping early`);
            break; // ✅ STOP EARLY if height doesn't change
          }
        }

        // ✅ FASTER SCROLL UP: Skip smooth scroll up entirely
        console.log('Instant scroll back to top...');
        await smoothScrollTo(0, 800); // Reduced from 800ms
        window.dispatchEvent(new Event('scroll'));
        await delay(300); // Just one quick delay
      });

      // Wait for images to load
      await this.waitForAllImages(page, screenName, viewportName);

      await sleep(1000 * this.getDelayMultiplier());

      const finalPageInfo = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight
      }));

      if (finalPageInfo.scrollHeight > initialPageInfo.scrollHeight) {
        this.log(`[${screenName}] ${viewportName}: ✅ Lazy content loaded (${initialPageInfo.scrollHeight}px → ${finalPageInfo.scrollHeight}px)`);
      } else {
        this.log(`[${screenName}] ${viewportName}: ✅ Page scroll completed (height: ${finalPageInfo.scrollHeight}px)`);
      }

    } catch (error) {
      this.log(`[${screenName}] ${viewportName}: ⚠️ Lazy loading failed: ${error.message}`);
    }
  }

  // ✅ NEW: Disable lazy loading libraries
  async disableLazyLoading(page) {
    await page.evaluate(() => {
      // Disable native lazy loading
      document.querySelectorAll('img[loading="lazy"]').forEach(img => {
        img.loading = 'eager';
      });

      // Disable lazysizes library
      if (window.lazySizes) {
        window.lazySizes.config.lazyClass = 'do-not-lazy-load';
      }
      if (window.lazySizesConfig) {
        window.lazySizesConfig.lazyClass = 'do-not-lazy-load';
      }

      // Force load all images with common lazy load attributes
      const lazySelectors = [
        'img[data-src]',
        'img[data-lazy-src]',
        'img[data-original]',
        'img.lazyload',
        'img.lazy',
        'img.b-lazy'
      ];

      lazySelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(img => {
          const src = img.dataset.src || img.dataset.lazySrc || img.dataset.original;
          if (src) {
            img.src = src;
            img.classList.remove('lazyload', 'lazy', 'b-lazy');
          }
          if (img.dataset.srcset) {
            img.srcset = img.dataset.srcset;
          }
        });
      });
    });
  }

  // ✅ NEW: Comprehensive image loading wait
  async waitForAllImages(page, screenName, viewportName) {
    this.log(`[${screenName}] ${viewportName}: Waiting for all images to load...`);

    let attempt = 0;
    const maxAttempts = 5;

    while (attempt < maxAttempts) {
      attempt++;
      this.log(`[${screenName}] ${viewportName}: Image loading attempt ${attempt}/${maxAttempts}`);

      const imageStats = await page.evaluate(() => {
        const images = Array.from(document.images);
        let loaded = 0;
        let failed = 0;
        let pending = 0;

        images.forEach(img => {
          if (img.complete) {
            if (img.naturalHeight !== 0) {
              loaded++;
            } else {
              failed++;
            }
          } else {
            pending++;
          }
        });

        return { total: images.length, loaded, failed, pending };
      });

      this.log(`[${screenName}] ${viewportName}: Images - Total: ${imageStats.total}, Loaded: ${imageStats.loaded}, Failed: ${imageStats.failed}, Pending: ${imageStats.pending}`);

      if (imageStats.pending === 0) {
        this.log(`[${screenName}] ${viewportName}: All images processed`);
        break;
      }

      // Wait for pending images
      await page.evaluate(() => {
        return Promise.race([
          Promise.all(
            Array.from(document.images)
              .filter(img => !img.complete)
              .map(img => new Promise(resolve => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
              }))
          ),
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);
      });

      await sleep(500);
    }

    // Handle background images
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundImage;
            return bg && bg !== 'none' && bg.includes('url');
          })
          .map(el => {
            return new Promise(resolve => {
              const bg = window.getComputedStyle(el).backgroundImage;
              const matches = bg.match(/url\(['"]?(.*?)['"]?\)/g);

              if (!matches) {
                resolve();
                return;
              }

              const urls = matches.map(match => match.match(/url\(['"]?(.*?)['"]?\)/)[1]);
              const promises = urls
                .filter(url => !url.startsWith('data:'))
                .map(url => {
                  return new Promise(innerResolve => {
                    const img = new Image();
                    img.onload = innerResolve;
                    img.onerror = innerResolve;
                    img.src = url;
                    setTimeout(innerResolve, 3000);
                  });
                });

              Promise.all(promises).then(resolve);
              setTimeout(resolve, 5000);
            });
          })
      );
    });

    this.log(`[${screenName}] ${viewportName}: ✅ Image loading complete`);
    await sleep(1000);
  }

  // Can save DOM for debug
  // async savePageDOM(page, screenName, viewportType) {
  //   try {
  //     const html = await page.content();
  //     const fs = require('fs');
  //     const path = require('path');
  //
  //     const filename = `${screenName}-${viewportType}-dom.html`;
  //     const filepath = path.join(__dirname, '..', 'snapshots', filename);
  //
  //     fs.writeFileSync(filepath, html, 'utf-8');
  //
  //     this.log(`💾 DOM saved: ${filename}`);
  //     return filepath;
  //   } catch (error) {
  //     this.log(`❌ Failed to save DOM: ${error.message}`);
  //   }
  // }

  getScreenshots() {
    return this.screenshots;
  }
}

module.exports = ScreenshotManager;
