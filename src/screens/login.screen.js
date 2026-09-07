import { BaseScreen } from './base.screen.js';
import { safeClick, safeSetValue } from '../safety/guard.js';

export class LoginScreen extends BaseScreen {
  async assertLanding() {
    await this.dismissCompatibilityNotice(1200);
    await this.firstVisible(['~Just App Icon']);
    await this.textVisible('Account', true);
    await this.textVisible('Login to track your savings, orders & addresses', true);
    await this.textVisible('Log in with phone number', true);
    await this.textVisible('By clicking, I accept the terms of service & privacy policy', true);
    return 'Just login landing and consent copy loaded';
  }

  async openPhoneForm() {
    const target = await this.firstVisible([
      '//*[@text="Log in with phone number"]/..'
    ]);
    await safeClick(target, 'login.open', 'Log in with phone number');
    await this.textVisible('Enter your mobile number', true);
    await this.textVisible('to login/signup', true);
    await this.firstVisible(['~Close']);
  }

  async login(phone, otp) {
    const homeMarkers = [
      'android=new UiSelector().textContains("Search")',
      'android=new UiSelector().descriptionContains("Search")'
    ];
    try { await this.firstVisible(homeMarkers, 5000); return 'existing authenticated session'; } catch { /* clean cloud session */ }

    await this.assertLanding();
    await this.openPhoneForm();
    const phoneInput = await this.firstVisible([
      'android=new UiSelector().resourceIdMatches(".*(phone|mobile).*input.*")',
      'android=new UiSelector().className("android.widget.EditText")'
    ]);
    await safeSetValue(phoneInput, 'login.phone_input', phone);
    const next = await this.firstVisible([
      '//*[@text="Get OTP"]/..',
      'android=new UiSelector().textMatches("(?i)(continue|next|login|get otp)")',
      'android=new UiSelector().descriptionMatches("(?i)(continue|next|login|get otp)")'
    ]);
    await safeClick(next, 'login.continue', 'Continue');

    try {
      await this.textVisible('Enter OTP', true);
    } catch {
      const transition = await this.assertAuthenticatedTransition();
      return `login advanced immediately after phone submission: ${transition}`;
    }
    await this.firstVisible(['~Edit phone number']);
    await this.firstVisible([
      'android=new UiSelector().textContains("get OTP")',
      'android=new UiSelector().textContains("Resend OTP")'
    ]);
    const otpInput = await this.firstVisible([
      'android=new UiSelector().resourceIdMatches(".*otp.*")',
      'android=new UiSelector().className("android.widget.EditText")'
    ]);
    await safeSetValue(otpInput, 'login.otp_input', otp);
    const verifyCandidates = [
      'android=new UiSelector().textMatches("(?i)(verify|continue|login)")',
      'android=new UiSelector().descriptionMatches("(?i)(verify|continue|login)")'
    ];
    try {
      const verify = await this.firstVisible(verifyCandidates, 3000);
      await safeClick(verify, 'login.verify', 'Verify');
    } catch { /* OTP controls can auto-submit */ }
    return 'login submitted without capturing sensitive evidence';
  }

  async assertAuthenticatedTransition() {
    const source = await this.source();
    if (/Enter OTP|Didn't get OTP|invalid|incorrect|expired/i.test(source)) {
      throw new Error('Authentication did not advance beyond OTP');
    }
    if (/permission|allow|notification|location|while using/i.test(source)) {
      return 'OTP accepted and app reached a post-login permission prompt';
    }
    if (/Search|Categories|Shop by|Home/i.test(source)) return 'OTP accepted and app reached home';
    throw new Error('OTP was submitted but no authenticated transition marker was observed');
  }
}
