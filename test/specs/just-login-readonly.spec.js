import { Results } from '../../src/reporting/results.js';
import { LoginScreen } from '../../src/screens/login.screen.js';
import { PolicyScreen } from '../../src/screens/policy.screen.js';
import { AccountScreen } from '../../src/screens/account.screen.js';
import { HomeScreen } from '../../src/screens/home.screen.js';
import { LocationScreen } from '../../src/screens/location.screen.js';
import { CartScreen } from '../../src/screens/cart.screen.js';
import { readCsv } from '../../src/utils/csv.js';

const results = new Results();
const login = new LoginScreen();
const policy = new PolicyScreen();
const account = new AccountScreen();
const home = new HomeScreen();
const location = new LocationScreen();
const cart = new CartScreen();
const accountFixture = readCsv('fixtures/account.csv');

async function scenario(name, expected, body) {
  const started = Date.now();
  try {
    const observed = await body();
    results.record({ scenario: name, expected, observed, status: 'PASS', durationMs: Date.now() - started, sessionId: browser.sessionId });
    return observed;
  } catch (error) {
    results.record({ scenario: name, expected, observed: `${error.name}: ${error.message}`, status: 'FAIL', durationMs: Date.now() - started, sessionId: browser.sessionId });
    throw error;
  }
}

async function ensureLoggedOut() {
  await browser.reloadSession();
  await login.assertLanding();
  return 'fresh no-reset=false session proved the user logged out on launch';
}

async function openAccountLoginForLoggedOutUser() {
  const guestHome = await reachGuestHomeFromLaunch();
  await home.openAccount();
  const opened = await account.openGuestLogin(accountFixture);
  return `${guestHome}; ${opened}`;
}

async function reachHomeAfterLogin() {
  await cart.clearUnserviceablePopupIfPresent(2000);
  await home.firstVisible([
    '~Account', '~Profile',
    'android=new UiSelector().descriptionContains("user account")',
    'android=new UiSelector().text("Select Your Location")',
    'android=new UiSelector().textMatches("(?i)(don.t allow|deny)")',
    'android=new UiSelector().resourceIdMatches(".*permission_deny.*")'
  ], 15000);
  if (await home.isLoaded()) return 'authenticated home loaded';
  return location.selectGuestLocation('Budhwal Haryana', 'Budhwal');
}

async function verifyAuthenticatedProfile(phone) {
  const homeState = await reachHomeAfterLogin();
  await home.openAccount();
  const phoneMatch = await account.assertPhoneNumber(phone);
  return `${homeState}; ${phoneMatch}`;
}

async function reachGuestHomeFromLaunch() {
  await login.assertLanding();
  const skipped = await login.skip();
  await home.firstVisible([
    '~Account', '~Profile',
    'android=new UiSelector().descriptionContains("user account")',
    'android=new UiSelector().text("Select Your Location")',
    'android=new UiSelector().textMatches("(?i)(don.t allow|deny)")',
    'android=new UiSelector().resourceIdMatches(".*permission_deny.*")'
  ], 15000);
  if (await home.isLoaded()) return `${skipped}; saved location retained`;
  const selected = await location.selectGuestLocation('Budhwal Haryana', 'Budhwal');
  return `${skipped}; ${selected}`;
}

describe('Just production read-only login sanity', () => {
  it('renders the first-login screen and complete consent copy', async () => {
    await scenario('first_login_screen', 'Just login landing and complete consent copy load', () => login.assertLanding());
  });

  it('opens and validates Terms and Conditions from the consent copy', async () => {
    await scenario('terms_and_conditions', 'Terms and Conditions page contains substantive legal content', async () => {
      await policy.open('terms');
      let observed;
      try {
        observed = await policy.assertTerms();
      } finally {
        await policy.returnToLogin();
      }
      return observed;
    });
  });

  it('opens and validates Privacy policy from the consent copy', async () => {
    await scenario('privacy_policy', 'Privacy policy contains substantive privacy and consent content', async () => {
      await policy.open('privacy');
      let observed;
      try {
        observed = await policy.assertPrivacy();
      } finally {
        await policy.returnToLogin();
      }
      return observed;
    });
  });

  it('logs in from the launch screen, then logs out', async () => {
    await scenario('launch_phone_otp_login', 'a logged-out user authenticates from launch and can log out through Account', async () => {
      const precondition = await ensureLoggedOut();
      const observed = await login.login(process.env.JUST_TEST_PHONE, process.env.JUST_TEST_OTP);
      const transition = await login.assertAuthenticatedTransition();
      const verifiedProfile = await verifyAuthenticatedProfile(process.env.JUST_TEST_PHONE);
      const logout = await account.logout();
      try {
        await account.assertGuestLogin(accountFixture);
      } catch {
        await login.assertLanding();
      }
      return `${precondition}; ${observed}; ${transition}; ${verifiedProfile}; ${logout}; no login evidence captured`;
    });
  });

  it('logs in from the Accounts page as a guest', async () => {
    await scenario('account_phone_otp_login', 'a logged-out guest authenticates from the Accounts page', async () => {
      const precondition = await ensureLoggedOut();
      const opened = await openAccountLoginForLoggedOutUser();
      const observed = await login.submitCredentials(process.env.JUST_TEST_PHONE, process.env.JUST_TEST_OTP);
      const transition = await login.assertAuthenticatedTransition();
      const verifiedProfile = await verifyAuthenticatedProfile(process.env.JUST_TEST_PHONE);
      return `${precondition}; ${opened}; ${observed}; ${transition}; ${verifiedProfile}; no login evidence captured`;
    });
  });
});
