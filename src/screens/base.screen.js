import { assertSafeAction, safeClick, safeScroll } from '../safety/guard.js';

// The single source of truth for "is the Add to Cart control visible" across
// every screen that can show a product (PDP, variant switching, cart-cleared
// state). This build labels the control "Add item" on some screens and
// "Add to Cart" on others, so every caller must check both.
export const ADD_TO_CART_SELECTORS = [
  '~Add item',
  'android=new UiSelector().description("Add item")',
  'android=new UiSelector().textMatches("(?i)add to cart")',
  'android=new UiSelector().descriptionMatches("(?i)add to cart")'
];

// The single source of truth for "is a cart line's remove control visible".
export const CART_REMOVE_SELECTORS = [
  'android=new UiSelector().descriptionMatches("(?i)(delete|remove|trash|decrement|decrease|minus).*")',
  'android=new UiSelector().resourceIdMatches("(?i).*(delete|remove|trash|decrement|decrease|minus).*")'
];

// PDP-exclusive chrome. Product cards (Home, search results, taxonomy) also
// expose an "Add item"/"Add to Cart" control themselves, so that text can
// never prove navigation into the PDP actually happened - only this chrome can.
const PDP_CHROME_SELECTORS = [
  'android=new UiSelector().description("Go back")',
  'android=new UiSelector().description("Share")'
];

export class BaseScreen {
  async firstVisible(selectors, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        try {
          const element = await $(selector);
          if (await element.isDisplayed()) return element;
        } catch (error) { lastError = error; }
      }
      await browser.pause(100);
    }
    throw new Error(`No expected element became visible (${selectors.join(' | ')})${lastError ? `: ${lastError.message}` : ''}`);
  }

  async textVisible(text, exact = false) {
    const escaped = text.replaceAll('"', '\\"');
    const selector = exact
      ? `android=new UiSelector().text("${escaped}")`
      : `android=new UiSelector().textContains("${escaped}")`;
    return this.firstVisible([selector]);
  }

  async clickText(text, action, exact = false) {
    const element = await this.textVisible(text, exact);
    await safeClick(element, action, text);
  }

  // The Android compatibility notice appears only on affected local emulator
  // images, never on the cloud devices. Prefer "Don't show again" so it does not
  // reappear later in the same local run; fall back to OK, and treat an absent
  // dialog as normal.
  async dismissCompatibilityNotice(timeoutMs = 1500) {
    if (process.env.RUN_PROVIDER !== 'local') return false;
    const targets = [
      ['android=new UiSelector().textMatches("(?i)don.?t show again")', "Don't show again"],
      ['android=new UiSelector().resourceId("android:id/button1").textMatches("(?i)don.?t show again")', "Don't show again"],
      ['android=new UiSelector().resourceId("android:id/button2").text("OK")', 'Android compatibility notice OK']
    ];
    try {
      const button = await this.firstVisible(targets.map(([selector]) => selector), timeoutMs);
      const text = await button.getText().catch(() => '');
      const descriptor = /don.?t show again/i.test(text) ? "Don't show again" : 'Android compatibility notice OK';
      await safeClick(button, 'system.compatibility_ok', descriptor);
      return true;
    } catch { return false; }
  }

  // Bounded scroll search: stops as soon as the text appears, when the page
  // stops moving, or after maxScrolls. Never scrolls indefinitely.
  async scrollToText(text, maxScrolls = 8) {
    const escaped = text.replaceAll('"', '\\"');
    const selector = `android=new UiSelector().textContains("${escaped}")`;
    for (let step = 0; step <= maxScrolls; step += 1) {
      const element = await $(selector);
      if (await element.isDisplayed().catch(() => false)) return element;
      const before = await this.source();
      await safeScroll('nav.scroll', 'down');
      await browser.pause(500);
      if (await this.source() === before) break;
    }
    const element = await $(selector);
    if (await element.isDisplayed().catch(() => false)) return element;
    throw new Error(`"${text}" did not become visible within ${maxScrolls} bounded scrolls`);
  }

  async scrollToTop(maxScrolls = 10) {
    for (let step = 0; step < maxScrolls; step += 1) {
      const before = await this.source();
      await safeScroll('nav.scroll', 'up');
      await browser.pause(400);
      if (await this.source() === before) return;
    }
  }

  async back() {
    assertSafeAction('nav.back', 'Back');
    await browser.back();
  }

  // Confirms a tap actually navigated into a PDP, as opposed to landing on a
  // list card's own embedded Add-to-Cart control. Every screen that opens a
  // product (Home, search results, taxonomy) must call this after tapping.
  async waitForPdpOpen(timeoutMs = 15000) {
    return this.firstVisible(PDP_CHROME_SELECTORS, timeoutMs);
  }

  async addToCartCta(timeoutMs = 15000) {
    return this.firstVisible(ADD_TO_CART_SELECTORS, timeoutMs);
  }

  // The single operation for "add whatever product is on the currently open
  // PDP to the cart". Every flow that needs to add an item calls this instead
  // of re-implementing its own tap-and-confirm sequence.
  async addToCart() {
    const button = await this.addToCartCta();
    await safeClick(button, 'product.cart_add', 'Add to Cart');
    await this.firstVisible([
      ...CART_REMOVE_SELECTORS,
      'android=new UiSelector().textMatches("(?i)your cart")',
      'android=new UiSelector().descriptionMatches("(?i)your cart.*")',
      'android=new UiSelector().text("1")'
    ], 2000).catch(() => {});
    return 'one unit of the currently open product added to the cart';
  }

  // The single operation for "remove/reduce whatever cart line is currently on
  // screen". Every flow that needs to remove an item calls this instead of
  // re-implementing its own tap-and-confirm sequence.
  async removeFromCart() {
    const remove = await this.firstVisible(CART_REMOVE_SELECTORS);
    await safeClick(remove, 'product.cart_remove', 'Remove from Cart');
    await this.addToCartCta();
    return 'cart item removed; screen returned to Add to Cart state';
  }

  async source() { return browser.getPageSource(); }

  assertSourceHas(source, patterns, label) {
    const missing = patterns.filter((pattern) => !pattern.test(source));
    if (missing.length) {
      throw new Error(`${label} missing ${missing.length} expected field(s): ${missing.map((pattern) => pattern.source).join(', ')}`);
    }
  }
}
