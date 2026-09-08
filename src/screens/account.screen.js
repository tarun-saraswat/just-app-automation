import { BaseScreen } from './base.screen.js';
import { safeClick } from '../safety/guard.js';

export class AccountScreen extends BaseScreen {
  value(fixtures, field) {
    const value = fixtures.find((row) => row.field === field)?.expected_non_sensitive_value;
    if (!value) throw new Error(`Missing account fixture value for ${field}`);
    return value;
  }

  async assertGuestLogin(fixtures) {
    for (const field of ['page_heading', 'guest_message', 'login_button', 'consent']) {
      await this.textVisible(this.value(fixtures, field), true);
    }
    const buttonText = this.value(fixtures, 'login_button').replaceAll('"', '\\"');
    const button = await this.firstVisible([`//*[@text="${buttonText}"]/..`]);
    if (!await button.isEnabled()) throw new Error('Guest login button is not enabled');
    const clickable = await button.getAttribute('clickable');
    if (clickable !== 'true') throw new Error('Guest login button is not clickable');
    return button;
  }

  async openGuestLogin(fixtures) {
    const button = await this.assertGuestLogin(fixtures);
    await safeClick(button, 'login.open', 'Guest login option');
    await this.textVisible(this.value(fixtures, 'login_form_heading'), true);
    await this.textVisible(this.value(fixtures, 'login_form_subtitle'), true);
    await this.firstVisible(['~Close']);
    return 'guest login option opened the phone login form';
  }

  async logout() {
    const target = await this.scrollToText('Logout', 8).catch(() => this.scrollToText('Log out', 8));
    await safeClick(target, 'account.logout', 'Logout');

    await this.textVisible('Logout Options', true);
    await this.textVisible('CURRENT DEVICE', true);
    const currentDeviceLogout = await this.firstVisible([
      'android=new UiSelector().text("LOGOUT").instance(0)',
      'android=new UiSelector().description("LOGOUT").instance(0)',
      '//*[@text="CURRENT DEVICE"]/following::*[@text="LOGOUT"][1]',
      '//*[@text="CURRENT DEVICE"]/following::*[@content-desc="LOGOUT"][1]'
    ]);
    await safeClick(currentDeviceLogout, 'account.logout_confirm', 'Current device logout');

    const confirm = await this.firstVisible([
      'android=new UiSelector().text("Yes")',
      'android=new UiSelector().description("Yes")',
      '//*[@text="Are you sure you want to logout?"]/following::*[@text="Yes"][1]'
    ]);
    await safeClick(confirm, 'account.logout_confirm', 'Confirm logout');

    await this.firstVisible([
      'android=new UiSelector().text("Log in with phone number")',
      'android=new UiSelector().description("Log in with phone number")',
      'android=new UiSelector().textMatches("(?i)login to continue")',
      'android=new UiSelector().textMatches("(?i)login/signup")'
    ], 15000);
    return 'authenticated session logged out through Account';
  }

  async returnToHome(fixtures) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.back();
      try {
        await this.firstVisible([
          '~Search',
          'android=new UiSelector().descriptionContains("Search")',
          'android=new UiSelector().textContains("Search")'
        ], 3000);
        const loginCopy = await $(`android=new UiSelector().text("${this.value(fixtures, 'guest_message').replaceAll('"', '\\"')}")`);
        if (await loginCopy.isDisplayed().catch(() => false)) continue;
        return 'back navigation returned the guest user to Home';
      } catch { /* The first Back may only close the login form. */ }
    }
    throw new Error('Back navigation did not return the guest user to Home');
  }

  async assertPopulated() {
    const source = await this.source();
    this.assertSourceHas(source, [/account|profile/i, /name|member|mobile/i], 'Account');
    if (/unexpected error|something went wrong/i.test(source)) throw new Error('Account shows an error state');
    return 'account fields present and populated';
  }

  async openSavedAddresses() {
    const target = await this.firstVisible([
      'android=new UiSelector().textMatches("(?i)(saved addresses|addresses|manage addresses)")'
    ]);
    await safeClick(target, 'account.saved_addresses_view', 'Saved addresses');
  }

  async openOrders() {
    const target = await this.firstVisible([
      'android=new UiSelector().textMatches("(?i)(orders|past orders|order history)")'
    ]);
    await safeClick(target, 'account.order_history_view', 'Order history');
  }
}
