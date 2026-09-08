import { assertSafeAction, safeClick, safeScroll } from '../safety/guard.js';

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

  async source() { return browser.getPageSource(); }

  assertSourceHas(source, patterns, label) {
    const missing = patterns.filter((pattern) => !pattern.test(source));
    if (missing.length) {
      throw new Error(`${label} missing ${missing.length} expected field(s): ${missing.map((pattern) => pattern.source).join(', ')}`);
    }
  }
}
