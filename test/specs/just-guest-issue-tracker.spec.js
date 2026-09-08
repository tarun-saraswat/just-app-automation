import assert from 'node:assert/strict';
import { Results } from '../../src/reporting/results.js';
import { LocationScreen } from '../../src/screens/location.screen.js';
import { HomeScreen } from '../../src/screens/home.screen.js';
import { ProductScreen } from '../../src/screens/product.screen.js';
import { SearchScreen } from '../../src/screens/search.screen.js';
import { CartScreen } from '../../src/screens/cart.screen.js';
import { PromiseScreen } from '../../src/screens/promise.screen.js';

const results = new Results();
const location = new LocationScreen();
const home = new HomeScreen();
const product = new ProductScreen();
const search = new SearchScreen();
const cart = new CartScreen();
const promise = new PromiseScreen();
let guestReady = false;

async function issueCase(id, expected, body) {
  const started = Date.now();
  try {
    const observed = await body();
    results.record({
      scenario: id,
      expected,
      observed: Array.isArray(observed) ? observed.join(' | ') : observed,
      status: 'PASS',
      durationMs: Date.now() - started,
      sessionId: browser.sessionId
    });
    return observed;
  } catch (error) {
    results.record({
      scenario: id,
      expected,
      observed: `${error.name}: ${error.message}`,
      status: 'FAIL',
      durationMs: Date.now() - started,
      sessionId: browser.sessionId
    });
    throw error;
  }
}

function assertSourceDoesNotContain(source, pattern, label) {
  assert.doesNotMatch(source, pattern, `${label} unexpectedly exposed ${pattern}`);
}

describe('Just guest issue-regression suite', () => {
  before(async () => {
    const observed = await location.selectGuestLocation('Budhwal Haryana', 'Budhwal');
    guestReady = true;
    console.info(`[guest-issues] ${observed}`);
  });

  beforeEach(async () => {
    if (guestReady) await home.recoverBackToHome();
  });

  afterEach(async function recoverAfterTest() {
    if (!guestReady) return;
    try {
      await home.recoverBackToHome();
    } catch (error) {
      console.error(`[guest-issues] recovery failed: ${JSON.stringify(error.message)}`);
      if (this.currentTest?.state !== 'failed') throw error;
    }
  });

  it('JUS-WEB-001: does not expose the removed Pune entry point', async () => {
    await issueCase('JUS-WEB-001', 'guest Home has no stale Pune entry point or Pune deeplink', async () => {
      await home.waitLoaded();
      const source = await home.source();
      assertSourceDoesNotContain(source, /\bPune\b/i, 'guest Home');
      assertSourceDoesNotContain(source, /pune/i, 'guest Home deeplink');
      return 'Pune entry point and deeplink are absent from the guest Home hierarchy';
    });
  });

  it.skip('JUS-WEB-002: validates the Collection share CTA copy and link', () => {
    // The current screen model has PDP sharing only. Collection share text and
    // URL are backend-owned and there is no collection screen/fixture yet.
  });

  it('JUS-WEB-003: guest search returns purchasable results', async () => {
    await issueCase('JUS-WEB-003', 'collection-level search accepts a query and renders purchasable Jus+ results', async () => {
      await home.openSearch();
      await search.search('Toothpaste');
      const observed = await search.waitForResultsMatching('Toothpaste');
      assert.ok(observed.length > 0, 'Search returned no matching products');
      return observed;
    });
  });

  it.skip('JUS-WEB-004: validates taxonomy-page search', () => {
    // Taxonomy search is not exposed by the current CategoriesScreen contract;
    // add it when the product provides a taxonomy search control/oracle.
  });

  it.skip('JUS-WEB-005: validates the required PDP top spacing', () => {
    // Exact spacing and reference dimensions were not supplied by design.
  });

  it.skip('JUS-WEB-006: validates pre-PDP haptic feedback', () => {
    // Appium accessibility/runtime APIs cannot reliably assert device haptics.
  });

  it('JUS-WEB-007: validates the guest PDP layout and section ordering', async () => {
    await issueCase('JUS-WEB-007', 'a guest PDP renders the expected product sections in the current order', async () => {
      await home.openAnyProduct();
      return product.assertAllSections();
    });
  });

  it('JUS-WEB-008: does not show the removed Show all Jus+ products CTA', async () => {
    await issueCase('JUS-WEB-008', 'guest PDP does not render the removed Show all Jus+ products CTA', async () => {
      await home.openAnyProduct();
      const source = await product.source();
      assertSourceDoesNotContain(source, /show all jus\+ products/i, 'guest PDP');
      return 'Show all Jus+ products CTA is absent from the guest PDP hierarchy';
    });
  });

  it('JUS-WEB-010: validates the Delivery without carry bags cart widget', async () => {
    await issueCase('JUS-WEB-010', 'guest cart shows the approved Delivery without carry bags copy', async () => {
      await home.openAnyProduct();
      await product.addOneToCart();
      await product.openCart();
      const observed = await cart.assertBagWidget();
      await home.back();
      return observed;
    });
  });

  it.skip('JUS-WEB-012: validates Home address-arrow positioning', () => {
    // Position tolerance and design reference are not defined in the tracker.
  });

  it('JUS-WEB-013: opens, validates, and closes the Home JUST promise half-card twice', async () => {
    await issueCase('JUS-WEB-013', 'guest Home can open, validate, and close the JUST Promise half-card twice', async () => {
      await home.openPromiseCard();
      const firstSheet = await promise.assertRefundSheet();
      await home.dismissPromiseCard();
      const firstClosed = await promise.assertRefundSheetClosed();
      await home.openPromiseCard();
      const secondSheet = await promise.assertRefundSheet();
      await home.dismissPromiseCard();
      const secondClosed = await promise.assertRefundSheetClosed();
      return `first cycle: ${firstSheet}; ${firstClosed}; second cycle: ${secondSheet}; ${secondClosed}`;
    });
  });
});
