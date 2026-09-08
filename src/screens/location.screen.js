import { BaseScreen } from './base.screen.js';
import { CartScreen } from './cart.screen.js';
import { safeClick, safeSetValue } from '../safety/guard.js';

const cart = new CartScreen();

export class LocationScreen extends BaseScreen {
  async guestHomeMarker(timeoutMs = 1200) {
    return this.firstVisible([
      'android=new UiSelector().descriptionContains("user account")',
      'android=new UiSelector().textContains("Search for")',
      'android=new UiSelector().descriptionContains("Search for")'
    ], timeoutMs).catch(() => null);
  }

  async denyLocationPermissionOrContinue(timeoutMs = 8000) {
    const state = await this.firstVisible([
      'android=new UiSelector().textMatches("(?i)(don.t allow|deny)")',
      'android=new UiSelector().resourceIdMatches(".*permission_deny.*")',
      'android=new UiSelector().text("Select Your Location")'
    ], timeoutMs);
    const [text, resourceId, packageName] = await Promise.all([
      state.getText().catch(() => ''),
      state.getAttribute('resource-id').catch(() => ''),
      state.getAttribute('package').catch(() => '')
    ]);
    if (/don.t allow|deny/i.test(text)
      || /permission_deny/i.test(resourceId)
      || /permissioncontroller/i.test(packageName)) {
      await safeClick(state, 'system.location_deny', 'Deny location permission');
      return true;
    }
    return false;
  }

  async selectGuestLocation(query, resultName) {
    await this.dismissCompatibilityNotice();
    if (await this.guestHomeMarker()) return `${resultName} guest Home already active`;
    const pdpAdd = await $('~Add item');
    const pdpShare = await $('~Share');
    if (await pdpAdd.isDisplayed().catch(() => false) && await pdpShare.isDisplayed().catch(() => false)) {
      await this.back();
      if (await this.guestHomeMarker(5000)) return `${resultName} guest Home restored from PDP`;
    }
    try {
      const skip = await this.firstVisible([
        'android=new UiSelector().text("Skip")',
        'android=new UiSelector().description("Skip")'
      ], 5000);
      await safeClick(skip, 'login.skip', 'Skip');
    } catch { /* A previously skipped guest session can open location directly. */ }
    await this.dismissCompatibilityNotice();
    await this.denyLocationPermissionOrContinue();
    try {
      await this.textVisible('Select Your Location', true);
    } catch (error) {
      const source = await this.source();
      const visibleText = [...source.matchAll(/(?:text|content-desc)="([^"]+)"/g)]
        .map((match) => match[1]).filter(Boolean).slice(0, 12);
      throw new Error(`${error.message}; visible UI: ${visibleText.join(' | ') || 'no accessibility text'}`);
    }
    const input = await this.firstVisible([
      'android=new UiSelector().className("android.widget.EditText")',
      'android=new UiSelector().textContains("Search an area or address")'
    ]);
    await safeSetValue(input, 'location.input', query);
    let result;
    try {
      result = await this.firstVisible([
        `//*[@text="${resultName}"]/ancestor::android.view.View[@clickable="true"][1]`,
        `//*[@content-desc="${resultName}"]/ancestor::android.view.View[@clickable="true"][1]`
      ]);
    } catch (error) {
      const source = await this.source();
      const visibleText = [...source.matchAll(/(?:text|content-desc)="([^"]+)"/g)]
        .map((match) => match[1]).filter(Boolean).slice(0, 16);
      throw new Error(`${error.message}; visible UI: ${visibleText.join(' | ') || 'no accessibility text'}`);
    }
    await safeClick(result, 'location.select', 'Location result');
    try {
      const notNow = await this.firstVisible([
        'android=new UiSelector().textMatches("(?i)not now")',
        'android=new UiSelector().descriptionMatches("(?i)not now")'
      ], 10000);
      await safeClick(notNow, 'login.notification_not_now', 'Not now');
    } catch { /* Notification onboarding may already be complete. */ }
    try {
      const denyNotification = await this.firstVisible([
        'android=new UiSelector().textMatches("(?i)(don.t allow|deny)")',
        'android=new UiSelector().resourceIdMatches(".*permission_deny.*")'
      ], 3000);
      await safeClick(denyNotification, 'system.notification_deny', 'Deny notification permission');
    } catch { /* In-app Not now usually avoids the system prompt. */ }
    await this.dismissCompatibilityNotice();
    const clearedUnserviceableCart = await cart.clearUnserviceablePopupIfPresent(5000);
    if (clearedUnserviceableCart) {
      console.info('[location] cleared the existing unserviceable cart before continuing to Home');
    }
    await this.firstVisible([
      'android=new UiSelector().textContains("Search for")',
      'android=new UiSelector().textContains("Explore Categories")',
      'android=new UiSelector().descriptionContains("Search")'
    ], 30000);
    return `${resultName} selected for guest browsing`;
  }
}
