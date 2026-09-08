const ALLOWED = new Set([
  'system.compatibility_ok',
  'system.location_deny',
  'system.notification_deny',
  'login.open', 'login.skip', 'login.notification_not_now', 'login.terms', 'login.privacy',
  'login.phone_input', 'login.continue', 'login.otp_input', 'login.verify',
  'nav.home', 'nav.account', 'nav.search', 'nav.taxonomy', 'nav.back', 'nav.scroll',
  'location.input', 'location.select',
  'account.profile_view', 'account.saved_addresses_view', 'account.order_history_view',
  'account.logout', 'account.logout_confirm',
  'orders.existing_order_view', 'orders.tracking_view',
  'search.input', 'search.submit', 'search.result_view',
  'taxonomy.category_view', 'taxonomy.subcategory_view', 'taxonomy.subcategory_scroll', 'collections.product_view', 'product.information_expand',
  'product.image_swipe', 'product.variant_select', 'product.share',
  'cart.view', 'cart.clear_unserviceable', 'home.promise_open', 'home.promise_dismiss',
  'product.cart_add', 'product.cart_remove'
]);

const ALLOWED_MUTATIONS = new Set([
  'account.logout', 'account.logout_confirm',
  'product.cart_add', 'product.cart_remove', 'cart.clear_unserviceable'
]);
// Product cards in this build are a single accessibility node whose label also
// contains the nested "Add item" CTA. These two actions only open that card.
const COMPOSITE_NAVIGATION = new Set(['collections.product_view', 'search.result_view']);

// Viewing the cart is read-only navigation, but its pill label embeds the word
// "Cart" plus price/count (e.g. "Your Cart ₹141 (1 Item)"), which the generic
// MUTATION pattern would block. cart.view therefore gets its own validator:
// the label must be a cart-view label and must not carry any transactional verb.
const CART_VIEW_FORBIDDEN = /\b(add|buy|checkout|pay|payment|place|cancel|remove|delete|order|save|submit)\b/i;
export function assertCartViewLabel(label = '') {
  if (!label) return true;
  if (!/\bcart\b/i.test(label)) throw new SafetyViolation(`cart.view target does not resolve to a cart label: ${label}`);
  if (CART_VIEW_FORBIDDEN.test(label)) throw new SafetyViolation(`Blocked transactional cart control for cart.view: ${label}`);
  return true;
}

export const PRODUCT_CARD = /Jus\+\s*\S/i;
export const PRICE = /₹\s?\d/;
export const PACK_SIZE = /\d+(?:\.\d+)?\s*(?:g|kg|ml|l|pc|pcs|piece|pieces)\b/i;

const MUTATION = /\b(add|buy|cart|checkout|pay|payment|place|cancel|return|reorder|rate|edit|delete|remove|update|save|submit|select address|contact|call|chat|quantity|plus|minus)\b/i;

export class SafetyViolation extends Error {}

export function assertSafeAction(action, descriptor = '') {
  if (!ALLOWED.has(action)) throw new SafetyViolation(`Blocked non-allowlisted interaction: ${action}`);
  if (action === 'cart.view') return assertCartViewLabel(descriptor);
  if (!ALLOWED_MUTATIONS.has(action) && MUTATION.test(descriptor)) throw new SafetyViolation(`Blocked potentially mutating CTA for ${action}`);
  return true;
}

export async function safeClick(element, action, descriptor = '') {
  assertSafeAction(action, descriptor);
  const displayed = await element.isDisplayed();
  if (!displayed) throw new Error(`Safe target is not displayed: ${action}`);
  const observed = [descriptor, await element.getText().catch(() => ''), await element.getAttribute('content-desc').catch(() => '')]
    .filter(Boolean).join(' ');
  if (action === 'cart.view') {
    assertCartViewLabel(observed);
  } else if (!ALLOWED_MUTATIONS.has(action) && !COMPOSITE_NAVIGATION.has(action) && MUTATION.test(observed)) {
    throw new SafetyViolation(`Target resolved to potentially mutating UI for ${action}`);
  }
  await element.click();
}

// Opens the guest cart via the WebView DOM when the floating cart pill has no
// native accessibility projection. Two-phase so validation cannot be bypassed:
// phase 1 resolves an actionable cart control and marks it without clicking,
// the resolved label is then validated here through assertCartViewLabel, and
// phase 2 clicks only the previously marked element.
export async function safeWebViewCartOpen({ required = true } = {}) {
  assertSafeAction('cart.view', 'Your Cart');
  const originalContext = await browser.getContext().catch(() => null);
  const contexts = await browser.getContexts().catch(() => []);
  const webview = contexts.find((context) => String(context).toUpperCase().includes('WEBVIEW'));
  if (!webview) {
    if (!required) return null;
    throw new Error('Cart pill is not exposed natively and no WebView context is available');
  }
  try {
    await browser.switchContext(webview);
    const resolved = await browser.execute(() => {
      /* eslint-disable no-undef -- executed inside the app WebView */
      for (const stale of document.querySelectorAll('[data-qa-safe-cart-target]')) {
        stale.removeAttribute('data-qa-safe-cart-target');
      }
      const labelOf = (element) => `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`
        .replace(/\s+/gu, ' ').trim();
      const compact = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.height < 250;
      };
      // Deepest matching node (last in document order) so a page-level
      // container whose descendants mention the cart is never selected.
      const deepest = [...document.querySelectorAll('*')]
        .filter((element) => /\b(?:your|view)\s*cart\b/i.test(labelOf(element)) && compact(element))
        .pop();
      if (!deepest) return false;
      const clickTarget = deepest.closest('a,button,[role="button"]') || deepest;
      if (!compact(clickTarget)) return false;
      clickTarget.setAttribute('data-qa-safe-cart-target', '1');
      return labelOf(clickTarget);
    });
    if (!resolved) {
      if (!required) return null;
      throw new Error('No actionable Your Cart control was found in the WebView document');
    }
    assertCartViewLabel(resolved);
    const clicked = await browser.execute(() => {
      /* eslint-disable no-undef -- executed inside the app WebView */
      const target = document.querySelector('[data-qa-safe-cart-target]');
      if (!target) return false;
      target.removeAttribute('data-qa-safe-cart-target');
      target.click();
      return true;
    });
    if (!clicked) throw new Error('Validated Your Cart control disappeared before it could be clicked');
    return resolved;
  } finally {
    if (originalContext) await browser.switchContext(originalContext);
  }
}

// The logout confirmation is painted by the app WebView on builds where its
// visible Yes button has no native accessibility node. Resolve it only inside
// the verified logout dialog, validate the action here, then click the marked
// button in a second WebView command.
export async function safeWebViewLogoutConfirm() {
  assertSafeAction('account.logout_confirm', 'Confirm logout');
  const originalContext = await browser.getContext().catch(() => null);
  const contexts = await browser.getContexts().catch(() => []);
  const webview = contexts.find((context) => String(context).toUpperCase().includes('WEBVIEW'));
  if (!webview) throw new Error('Logout confirmation is not exposed natively and no WebView context is available');
  try {
    await browser.switchContext(webview);
    const resolved = await browser.execute(() => {
      /* eslint-disable no-undef -- executed inside the app WebView */
      for (const stale of document.querySelectorAll('[data-qa-safe-logout-confirm]')) {
        stale.removeAttribute('data-qa-safe-logout-confirm');
      }
      const normalize = (value) => (value || '').replace(/\s+/gu, ' ').trim();
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const dialogText = [...document.querySelectorAll('*')]
        .find((element) => /^Are you sure you want to logout\?$/i.test(normalize(element.textContent)) && visible(element));
      if (!dialogText) return false;
      const dialog = dialogText.closest('[role="dialog"]') || dialogText.parentElement?.parentElement || dialogText.parentElement;
      const yes = [...(dialog || document).querySelectorAll('button,[role="button"]')]
        .find((element) => /^Yes$/i.test(normalize(element.textContent || element.getAttribute('aria-label'))) && visible(element));
      if (!yes) return false;
      yes.setAttribute('data-qa-safe-logout-confirm', '1');
      return normalize(yes.textContent || yes.getAttribute('aria-label'));
    });
    if (!/^Yes$/i.test(resolved || '')) throw new Error('No Yes button was found inside the visible logout confirmation dialog');
    const clicked = await browser.execute(() => {
      /* eslint-disable no-undef -- executed inside the app WebView */
      const target = document.querySelector('[data-qa-safe-logout-confirm="1"]');
      if (!target) return false;
      target.removeAttribute('data-qa-safe-logout-confirm');
      target.click();
      return true;
    });
    if (!clicked) throw new Error('Validated logout confirmation disappeared before it could be clicked');
  } finally {
    if (originalContext) await browser.switchContext(originalContext);
  }
}

export async function safeSetValue(element, action, value) {
  assertSafeAction(action);
  if (!['login.phone_input', 'login.otp_input', 'search.input', 'location.input'].includes(action)) {
    throw new SafetyViolation(`Text entry is forbidden for ${action}`);
  }
  await element.setValue(value);
}

export async function safeKey(action, key) {
  assertSafeAction(action);
  if (action !== 'search.submit' || key !== 'ENTER') throw new SafetyViolation(`Keyboard input is forbidden for ${action}`);
  // WebDriver treats the string "ENTER" as literal text on Android. Keycode 66
  // presses the keyboard's Enter/Search action without changing the query.
  await browser.pressKeyCode(66);
}

export async function safeActivateJustApp() {
  assertSafeAction('nav.home', 'Home');
  await browser.activateApp('in.jusshop.android.just.prod');
}

export async function safeTapWithin(element, action, xFraction = 0.5, yFraction = 0.5) {
  assertSafeAction(action);
  if (!['login.terms', 'login.privacy', 'nav.taxonomy', 'taxonomy.category_view', 'taxonomy.subcategory_view', 'collections.product_view', 'search.result_view', 'product.variant_select', 'home.promise_open'].includes(action)) {
    throw new SafetyViolation(`Coordinate tap is forbidden for ${action}`);
  }
  const text = await element.getText().catch(() => '');
  if (['login.terms', 'login.privacy'].includes(action) && !/terms of service.*privacy policy/i.test(text)) {
    throw new SafetyViolation(`Policy tap target did not resolve to consent text for ${action}`);
  }
  // Product cards are catalogue-driven, so the tap target is verified by shape
  // (branded product label plus a price) instead of any one product's name.
  const contentDescription = await element.getAttribute('content-desc').catch(() => '');
  if (['collections.product_view', 'search.result_view'].includes(action)
    && !PRODUCT_CARD.test(text) && !PRODUCT_CARD.test(contentDescription)) {
    throw new SafetyViolation(`Tap target did not resolve to a priced product card for ${action}`);
  }
  if (action === 'product.variant_select' && !(PACK_SIZE.test(text) && PRICE.test(text))) {
    throw new SafetyViolation(`Tap target did not resolve to a priced pack-size option for ${action}`);
  }
  if (action === 'nav.taxonomy') {
    const description = await element.getAttribute('content-desc').catch(() => '');
    if (!/^(open|categories)$/i.test(description || text)) {
      throw new SafetyViolation(`Taxonomy tap target did not resolve to the recorded taxonomy card for ${action}`);
    }
  }
  if (action === 'taxonomy.category_view') {
    const description = await element.getAttribute('content-desc').catch(() => '');
    if (!(description || text).trim() || PRICE.test(description || text) || /add item/i.test(description || text)) {
      throw new SafetyViolation(`Category tap target did not resolve to a named category card for ${action}`);
    }
  }
  if (action === 'taxonomy.subcategory_view') {
    const label = (contentDescription || text).trim();
    if (!label || PRICE.test(label) || PRODUCT_CARD.test(label) || /add item/i.test(label)) {
      throw new SafetyViolation(`Subcategory tap target did not resolve to a named left-rail label for ${action}`);
    }
  }
  const [location, size] = await Promise.all([element.getLocation(), element.getSize()]);
  const x = Math.round(location.x + size.width * xFraction);
  const y = Math.round(location.y + size.height * yFraction);
  await browser.performActions([{
    type: 'pointer', id: 'safe-policy-pointer', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x, y, origin: 'viewport' },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 }
    ]
  }]);
  await browser.releaseActions();
}

// Android 17 paints the Home taxonomy carousel without exposing its cards to
// UiAutomator or the WebView DOM. This fallback is intentionally limited to
// the first, fixed Explore Categories cell and is called only after every
// semantic selector has failed. The caller must prove navigation afterward.
export async function safeTapHomeTaxonomyFallback(searchElement) {
  assertSafeAction('nav.taxonomy', 'Categories');
  if (!await searchElement.isDisplayed()) throw new Error('Home search marker is not displayed before taxonomy fallback');
  const label = `${await searchElement.getText().catch(() => '')} ${await searchElement.getAttribute('content-desc').catch(() => '')}`;
  if (!/search/i.test(label)) throw new SafetyViolation(`Taxonomy fallback was not anchored to the Home search control: ${label}`);
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width * 0.125);
  const y = Math.round(height * 0.52);
  await browser.performActions([{
    type: 'pointer', id: 'safe-home-taxonomy-fallback', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x, y, origin: 'viewport' },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 }
    ]
  }]);
  await browser.releaseActions();
}

export async function safeTapFirstTaxonomyCategoryFallback(categoriesHeader) {
  assertSafeAction('taxonomy.category_view', 'First visible category');
  if (!await categoriesHeader.isDisplayed()) throw new Error('Categories header is not displayed before first-category fallback');
  const label = `${await categoriesHeader.getText().catch(() => '')} ${await categoriesHeader.getAttribute('content-desc').catch(() => '')}`;
  if (!/categories/i.test(label)) throw new SafetyViolation(`First-category fallback was not anchored to the Categories page: ${label}`);
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width * 0.125);
  const y = Math.round(height * 0.22);
  await browser.performActions([{
    type: 'pointer', id: 'safe-first-taxonomy-category-fallback', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x, y, origin: 'viewport' },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 }
    ]
  }]);
  await browser.releaseActions();
}

export async function safeTapTaxonomySearchFallback() {
  assertSafeAction('nav.search', 'Search');
  const source = await browser.getPageSource();
  if (!PRODUCT_CARD.test(source) || !/go back/i.test(source)) {
    throw new SafetyViolation('Taxonomy search fallback requires an opened category with products and Back navigation');
  }
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width * 0.92);
  const y = Math.round(height * 0.075);
  await browser.performActions([{
    type: 'pointer', id: 'safe-taxonomy-search-fallback', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x, y, origin: 'viewport' },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 }
    ]
  }]);
  await browser.releaseActions();
}

export async function safeSwipeWithin(element, action, { xStart = 0.8, xEnd = 0.2, yFraction = 0.5 } = {}) {
  assertSafeAction(action);
  if (action !== 'product.image_swipe') throw new SafetyViolation(`Swipe gesture is forbidden for ${action}`);
  const [location, size] = await Promise.all([element.getLocation(), element.getSize()]);
  const y = Math.round(location.y + size.height * yFraction);
  const from = Math.round(location.x + size.width * xStart);
  const to = Math.round(location.x + size.width * xEnd);
  await browser.performActions([{
    type: 'pointer', id: 'safe-swipe-pointer', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: from, y, origin: 'viewport' },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 60 },
      { type: 'pointerMove', duration: 350, x: to, y, origin: 'viewport' },
      { type: 'pointerUp', button: 0 }
    ]
  }]);
  await browser.releaseActions();
}

// Bounded vertical scroll. Every caller must cap the number of steps so a
// missing section can never turn into an endless scroll at the page bottom.
export async function safeScroll(action, direction = 'down') {
  assertSafeAction(action);
  if (action !== 'nav.scroll') throw new SafetyViolation(`Scroll gesture is forbidden for ${action}`);
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width * 0.5);
  const near = Math.round(height * 0.72);
  const far = Math.round(height * 0.32);
  const [from, to] = direction === 'down' ? [near, far] : [far, near];
  await browser.performActions([{
    type: 'pointer', id: 'safe-scroll-pointer', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x, y: from, origin: 'viewport' },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 60 },
      { type: 'pointerMove', duration: 400, x, y: to, origin: 'viewport' },
      { type: 'pointerUp', button: 0 }
    ]
  }]);
  await browser.releaseActions();
}

export async function safeScrollRegion(action, direction = 'down', xFraction = 0.15) {
  assertSafeAction(action);
  if (action !== 'taxonomy.subcategory_scroll') throw new SafetyViolation(`Regional scroll is forbidden for ${action}`);
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width * xFraction);
  const low = Math.round(height * 0.78);
  const high = Math.round(height * 0.32);
  const [from, to] = direction === 'down' ? [low, high] : [high, low];
  await browser.performActions([{
    type: 'pointer', id: 'safe-category-rail-scroll', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x, y: from, origin: 'viewport' },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 60 },
      { type: 'pointerMove', duration: 400, x, y: to, origin: 'viewport' },
      { type: 'pointerUp', button: 0 }
    ]
  }]);
  await browser.releaseActions();
}

export const safetyPolicy =Object.freeze({ allowed: [...ALLOWED], mutationPattern: MUTATION.source });
