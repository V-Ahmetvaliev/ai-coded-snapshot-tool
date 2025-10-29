const sleep = require('node:timers/promises').setTimeout;

class ActionExecutor {
  constructor(logger) {
    this.log = logger;
    this.scrollPositions = {}; // Store positions by viewport type
  }

  async executeAction(page, action, viewportType = 'unknown') {
    try {
      this.log(`Executing: ${action.type}`);

      switch (action.type) {
        case 'Delay':
          const delay = parseInt(action.value, 10) || 1000;
          await sleep(delay);
          break;

        case 'Adjust Styling':
          if (!action.selector) throw new Error('Selector required for Adjust Styling');
          let styles = action.styles || {};
          if (typeof styles === 'string') {
            try {
              styles = JSON.parse(styles);
            } catch (e) {
              throw new Error(`Invalid JSON for styles. Expected format: {"property": "value"}. Error: ${e.message}`);
            }
          }

          await page.evaluate((selector, styles) => {
            const elements = document.querySelectorAll(selector);
            if (elements.length === 0) {
              console.warn(`No elements found for selector: ${selector}`);
              return;
            }
            elements.forEach(el => Object.assign(el.style, styles));
          }, action.selector, styles);
          break;

        case 'Execute JS':
          if (!action.value) throw new Error('JavaScript code required');
          await page.evaluate(action.value);
          break;

        case 'Fill Form':
          if (!action.selector) throw new Error('Selector required for Fill Form');
          if (!action.value) throw new Error('Value required for Fill Form');

          await page.waitForSelector(action.selector, { timeout: 5000 });
          await page.focus(action.selector);
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await page.type(action.selector, action.value);
          break;

        case 'Remove Element':
          if (!action.value) throw new Error('Selector required for Remove Element');
          await page.evaluate(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => el.remove());
          }, action.value);
          break;

        case 'Show Element':
          if (!action.value) throw new Error('Selector required for Show Element');
          await page.evaluate(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              el.style.display = 'block';
              el.style.visibility = 'visible';
              el.style.opacity = '1';
            });
          }, action.value);
          break;

        case 'Click Selector':
          if (!action.value) throw new Error('Selector required for Click Selector');

          // Handle mobile overlays that might block clicks
          if (viewportType === 'mobile') {
            await this.handleMobileOverlays(page);
          }

          // Wait for element to exist
          await page.waitForSelector(action.value, { timeout: 10000 });

          // Check if element is visible and clickable
          const elementInfo = await page.evaluate(selector => {
            const element = document.querySelector(selector);
            if (!element) return { exists: false };

            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);

            return {
              exists: true,
              visible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
              inViewport: rect.top >= 0 && rect.left >= 0 &&
                rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left
            };
          }, action.value);

          if (!elementInfo.exists) {
            throw new Error(`Element not found: ${action.value}`);
          }

          // If element is not in viewport, scroll it into view
          if (!elementInfo.inViewport) {
            this.log(`Scrolling element into view: ${action.value}`);
            await page.evaluate(selector => {
              const element = document.querySelector(selector);
              if (element) {
                element.scrollIntoView({
                  behavior: 'auto',
                  block: 'center',
                  inline: 'center'
                });
              }
            }, action.value);

            // Wait for scroll to complete
            await sleep(1500);
          }

          // Try multiple click methods for better reliability
          try {
            // Method 1: Standard Puppeteer click
            await page.click(action.value);
            this.log(`Successfully clicked element using page.click(): ${action.value}`);
          } catch (error) {
            this.log(`Standard click failed, trying alternative methods: ${error.message}`);

            try {
              // Method 2: JavaScript click (bypasses visibility checks)
              await page.evaluate(selector => {
                const element = document.querySelector(selector);
                if (element) {
                  element.click();
                } else {
                  throw new Error(`Element not found during JS click: ${selector}`);
                }
              }, action.value);
              this.log(`Successfully clicked element using JavaScript click(): ${action.value}`);
            } catch (jsError) {
              // Method 3: Mouse click at element center
              this.log(`JavaScript click failed, trying mouse click: ${jsError.message}`);

              const element = await page.$(action.value);
              if (element) {
                const box = await element.boundingBox();
                if (box) {
                  const centerX = box.x + box.width / 2;
                  const centerY = box.y + box.height / 2;

                  await page.mouse.click(centerX, centerY);
                  this.log(`Successfully clicked element using mouse click at (${centerX}, ${centerY}): ${action.value}`);
                } else {
                  throw new Error(`Could not get bounding box for element: ${action.value}`);
                }
              } else {
                throw new Error(`Element not found for mouse click: ${action.value}`);
              }
            }
          }

          // Wait a bit after click to let any resulting actions complete
          await sleep(500);
          break;

        case 'Hover Selector':
          if (!action.value) throw new Error('Selector required for Hover Selector');
          await page.waitForSelector(action.value, { timeout: 5000 });
          await page.hover(action.value);
          break;

        case 'Scroll Into View':
          if (!action.value) throw new Error(`Selector required for ${action.type}`);

          // ✅ Increased timeout from 10s to 20s
          await page.waitForSelector(action.value, { timeout: 20000 });

          if (action.type === 'Click Selector') {
            this.log(`Clicking on selector: ${action.value}`);
            await page.click(action.value);
          } else if (action.type === 'Hover Selector') {
            this.log(`Hovering over selector: ${action.value}`);
            await page.hover(action.value);
          } else if (action.type === 'Scroll Into View') {
            this.log(`Scrolling into view: ${action.value}`);
            await page.evaluate((sel) => {
              const element = document.querySelector(sel);
              if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, action.value);
          }

          await sleep(action.type === 'Click Selector' ? 1000 : 500);
          break;

        case 'Scroll Horizontally':
          const scrollAmount = parseInt(action.value, 10) || 0;
          await page.evaluate(amount => {
            window.scrollBy(amount, 0);
          }, scrollAmount);
          await sleep(500);

          // Store horizontal scroll position by viewport type
          const horizontalScrollPosition = await page.evaluate(() => ({
            scrollY: window.scrollY,
            scrollX: window.scrollX,
            scrollHeight: document.documentElement.scrollHeight,
            viewportHeight: window.innerHeight,
            timestamp: Date.now()
          }));

          this.scrollPositions[viewportType] = horizontalScrollPosition;
          this.log(`Horizontal scroll completed for ${viewportType}. Position: (${horizontalScrollPosition.scrollX}, ${horizontalScrollPosition.scrollY})`);
          break;

        case 'Debug Element Styles':
          if (!action.value) throw new Error('Selector required for Debug Element Styles');

          const debugInfo = await page.evaluate(selector => {
            const element = document.querySelector(selector);
            if (!element) {
              return { error: `Element not found: ${selector}` };
            }

            const rect = element.getBoundingClientRect();
            const computed = window.getComputedStyle(element);

            return {
              selector: selector,
              exists: true,
              // Position & Size
              position: {
                top: rect.top,
                left: rect.left,
                bottom: rect.bottom,
                right: rect.right,
                width: rect.width,
                height: rect.height
              },
              // Offset values
              offset: {
                offsetWidth: element.offsetWidth,
                offsetHeight: element.offsetHeight,
                offsetTop: element.offsetTop,
                offsetLeft: element.offsetLeft
              },
              // Scroll values
              scroll: {
                scrollWidth: element.scrollWidth,
                scrollHeight: element.scrollHeight,
                scrollTop: element.scrollTop,
                scrollLeft: element.scrollLeft
              },
              // Computed styles (most important for layout)
              styles: {
                display: computed.display,
                position: computed.position,
                width: computed.width,
                height: computed.height,
                maxWidth: computed.maxWidth,
                maxHeight: computed.maxHeight,
                margin: computed.margin,
                padding: computed.padding,
                transform: computed.transform,
                opacity: computed.opacity,
                visibility: computed.visibility,
                overflow: computed.overflow,
                overflowX: computed.overflowX,
                overflowY: computed.overflowY,
                float: computed.float,
                clear: computed.clear,
                zIndex: computed.zIndex,
                boxSizing: computed.boxSizing
              },
              // Viewport context
              viewport: {
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                scrollY: window.scrollY,
                scrollX: window.scrollX
              },
              // Parent info
              parent: element.parentElement ? {
                tagName: element.parentElement.tagName,
                width: element.parentElement.offsetWidth,
                height: element.parentElement.offsetHeight,
                display: window.getComputedStyle(element.parentElement).display
              } : null
            };
          }, action.value);

          // Log to console AND save to file
          this.log(`🔍 DEBUG ELEMENT STYLES:`);
          this.log(JSON.stringify(debugInfo, null, 2));

          // Save to file
          const fs = require('fs');
          const path = require('path');
          const debugFilename = `debug-${action.value.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`;
          const debugPath = path.join(__dirname, '..', 'snapshots', debugFilename);
          fs.writeFileSync(debugPath, JSON.stringify(debugInfo, null, 2));
          this.log(`💾 Debug info saved to: ${debugFilename}`);

          break;

        case 'Inject CSS':
          if (!action.value) throw new Error('CSS code required for Inject CSS');

          await page.evaluate((cssCode) => {
            // Create style element
            const styleElement = document.createElement('style');
            styleElement.type = 'text/css';
            styleElement.textContent = cssCode;

            // Add to end of document
            if (document.body) {
              document.body.appendChild(styleElement);
            } else {
              // Fallback: add to head if body doesn't exist yet
              document.head.appendChild(styleElement);
            }

            // Force reflow to apply styles immediately
            document.body.offsetHeight;

            console.log('✅ Custom CSS injected');
          }, action.value);

          this.log(`Injected custom CSS (${action.value.length} characters)`);

          // Wait a bit for styles to apply
          await sleep(200);
          break;

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      this.log(`❌ Error executing ${action.type}: ${error.message}`);
      throw error;
    }
  }

  async executeActions(page, actions, label, viewportType = 'unknown') {
    if (!actions || actions.length === 0) {
      this.log(`No ${label} actions to execute`);
      return;
    }

    this.log(`Executing ${actions.length} ${label} action(s) for ${viewportType}`);
    for (const action of actions) {
      await this.executeAction(page, action, viewportType);
    }
  }

  async handleMobileOverlays(page) {
    // Common mobile overlays that might block clicks
    const overlaySelectors = [
      '.modal-backdrop',
      '.overlay',
      '.popup-overlay',
      '.mobile-menu-backdrop',
      '[data-dismiss="modal"]',
      '.close-button'
    ];

    for (const selector of overlaySelectors) {
      try {
        const overlay = await page.$(selector);
        if (overlay) {
          // Make overlay non-blocking
          await page.evaluate(sel => {
            const el = document.querySelector(sel);
            if (el) {
              el.style.pointerEvents = 'none';
              el.style.zIndex = '-1';
            }
          }, selector);
        }
      } catch (error) {
        // Ignore errors for non-existent overlays
      }
    }
  }

  // Restore scroll position for specific viewport
  async restoreScrollPosition(page, viewportType) {
    const storedPosition = this.scrollPositions[viewportType];

    if (!storedPosition) {
      this.log(`No stored scroll position for ${viewportType}`);
      return false;
    }

    const currentPos = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scrollX: window.scrollX,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight
    }));

    // Check if the page dimensions match (same content layout)
    const heightDifference = Math.abs(currentPos.scrollHeight - storedPosition.scrollHeight);
    if (heightDifference > 100) {
      this.log(`Page height changed significantly for ${viewportType} (${storedPosition.scrollHeight}px -> ${currentPos.scrollHeight}px), skipping restore`);
      return false;
    }

    // Only restore if position has changed significantly (more than 50px difference)
    const needsRestore = Math.abs(currentPos.scrollY - storedPosition.scrollY) > 50 ||
      Math.abs(currentPos.scrollX - storedPosition.scrollX) > 50;

    if (needsRestore) {
      // Ensure we don't scroll beyond the current page bounds
      const maxScrollY = Math.max(0, currentPos.scrollHeight - currentPos.viewportHeight);
      const targetScrollY = Math.min(storedPosition.scrollY, maxScrollY);
      const targetScrollX = Math.max(0, storedPosition.scrollX);

      this.log(`Restoring scroll position for ${viewportType} from (${currentPos.scrollX}, ${currentPos.scrollY}) to (${targetScrollX}, ${targetScrollY})`);

      await page.evaluate((pos) => {
        window.scrollTo(pos.scrollX, pos.scrollY);
      }, { scrollX: targetScrollX, scrollY: targetScrollY });

      await sleep(1000);

      // Verify restoration
      const restoredPos = await page.evaluate(() => ({
        scrollY: window.scrollY,
        scrollX: window.scrollX
      }));

      this.log(`Scroll position restored for ${viewportType} to (${restoredPos.scrollX}, ${restoredPos.scrollY})`);
      return true;
    }

    this.log(`Scroll position for ${viewportType} is already correct: (${currentPos.scrollX}, ${currentPos.scrollY})`);
    return false;
  }

  getScrollPosition(viewportType) {
    return this.scrollPositions[viewportType] || null;
  }

  hasScrollPosition(viewportType) {
    return this.scrollPositions[viewportType] !== undefined;
  }

  // Clear scroll positions (useful for new screens)
  clearScrollPositions() {
    this.scrollPositions = {};
  }

  // Get all stored positions (for debugging)
  getAllScrollPositions() {
    return this.scrollPositions;
  }
}

module.exports = ActionExecutor;
