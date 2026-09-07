import { BaseScreen } from './base.screen.js';
import { assertSafeAction, safeTapWithin } from '../safety/guard.js';

export class PolicyScreen extends BaseScreen {
  async open(type) {
    const consent = await this.textVisible('By clicking, I accept the terms of service & privacy policy', true);
    const fraction = type === 'terms' ? 0.57 : 0.86;
    await safeTapWithin(consent, `login.${type}`, fraction);
  }

  async webText() {
    const deadline = Date.now() + 20000;
    let lastError;
    while (Date.now() < deadline) {
      const contexts = await browser.getContexts();
      const webview = contexts.find((context) => JSON.stringify(context).includes('WEBVIEW'));
      if (webview) {
        const contextId = typeof webview === 'string' ? webview : webview.id || webview.name;
        try {
          await browser.switchContext(contextId);
          const body = await $('body');
          await body.waitForExist({ timeout: 10000 });
          const text = await body.getText();
          if (text.trim()) return text;
        } catch (error) {
          lastError = error;
        } finally {
          await browser.switchContext('NATIVE_APP').catch(() => undefined);
        }
      }
      await browser.pause(500);
    }
    throw new Error(`Policy WebView content did not become available${lastError ? `: ${lastError.message}` : ''}`);
  }

  async returnToLogin() {
    await browser.switchContext('NATIVE_APP').catch(() => undefined);
    await this.back();
    try {
      await this.firstVisible([
        'android=new UiSelector().text("By clicking, I accept the terms of service & privacy policy")'
      ], 2500);
    } catch {
      assertSafeAction('nav.back', 'Navigate to Just login landing');
      await browser.execute('mobile: startActivity', {
        component: 'in.jusshop.android.just.prod/in.swiggy.android.HomeIcon',
        stop: false
      });
    }
  }

  async assertTerms() {
    const text = await this.webText();
    this.assertSourceHas(text, [/terms and conditions/i, /terms of use/i, /information technology act/i], 'Terms and Conditions');
    return 'Terms and Conditions page loaded with substantive content';
  }

  async assertPrivacy() {
    const text = await this.webText();
    this.assertSourceHas(text, [/privacy policy/i, /collection.*use.*disclosure/i, /your consent/i], 'Privacy policy');
    return 'Privacy policy page loaded with substantive content';
  }
}
