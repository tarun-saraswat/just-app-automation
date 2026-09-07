import { Results } from '../../src/reporting/results.js';
import { LoginScreen } from '../../src/screens/login.screen.js';
import { PolicyScreen } from '../../src/screens/policy.screen.js';

const results = new Results();
const login = new LoginScreen();
const policy = new PolicyScreen();

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
      await login.assertLanding();
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
      await login.assertLanding();
      return observed;
    });
  });

  it('logs in using runtime-only phone and OTP and reaches an authenticated state', async () => {
    await scenario('phone_otp_login', 'runtime credentials authenticate and leave the OTP screen without an error', async () => {
      const observed = await login.login(process.env.JUST_TEST_PHONE, process.env.JUST_TEST_OTP);
      const transition = await login.assertAuthenticatedTransition();
      return `${observed}; ${transition}; no login evidence captured`;
    });
  });
});
