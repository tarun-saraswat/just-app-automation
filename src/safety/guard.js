const ALLOWED = new Set([
  'system.compatibility_ok',
  'system.location_deny',
  'system.notification_deny',
  'login.open', 'login.skip', 'login.notification_not_now', 'login.terms', 'login.privacy',
  'login.phone_input', 'login.continue', 'login.otp_input', 'login.verify',
  'nav.home', 'nav.account', 'nav.search', 'nav.categories', 'nav.back', 'nav.scroll',
  'location.input', 'location.select',
  'account.profile_view', 'account.saved_addresses_view', 'account.order_history_view',
  'account.logout', 'account.logout_confirm',
  'orders.existing_order_view', 'orders.tracking_view',
  'search.input', 'search.submit', 'search.result_view',
  'categories.category_view', 'categories.subcategory_view', 'categories.subcategory_scroll', 'categories.product_view', 'product.information_expand',
  'product.image_swipe', 'product.variant_select', 'product.share',
  'cart.view', 'home.promise_open', 'home.promise_dismiss',
  'product.cart_add', 'product.cart_remove'
]);

const ALLOWED_MUTATIONS = new Set([
  'account.logout', 'account.logout_confirm',
  'product.cart_add', 'product.cart_remove'
]);
// Product cards in this build are a single accessibility node whose label also
// contains the nested "Add item" CTA. These two actions only open that card.
const COMPOSITE_NAVIGATION = new Set(['categories.product_view', 'search.result_view']);

export const PRODUCT_CARD = /Jus\+\s*\S/i;
export const PRICE = /₹\s?\d/;
export const PACK_SIZE = /\d+(?:\.\d+)?\s*(?:g|kg|ml|l|pc|pcs|piece|pieces)\b/i;

const MUTATION = /\b(add|buy|cart|checkout|pay|payment|place|cancel|return|reorder|rate|edit|delete|remove|update|save|submit|select address|contact|call|chat|quantity|plus|minus)\b/i;

export class SafetyViolation extends Error {}

export function assertSafeAction(action, descriptor = '') {
  if (!ALLOWED.has(action)) throw new SafetyViolation(`Blocked non-allowlisted interaction: ${action}`);
  if (!ALLOWED_MUTATIONS.has(action) && MUTATION.test(descriptor)) throw new SafetyViolation(`Blocked potentially mutating CTA for ${action}`);
  return true;
}

export async function safeClick(element, action, descriptor = '') {
  assertSafeAction(action, descriptor);
  const displayed = await element.isDisplayed();
  if (!displayed) throw new Error(`Safe target is not displayed: ${action}`);
  const observed = [descriptor, await element.getText().catch(() => ''), await element.getAttribute('content-desc').catch(() => '')]
    .filter(Boolean).join(' ');
  if (!ALLOWED_MUTATIONS.has(action) && !COMPOSITE_NAVIGATION.has(action) && MUTATION.test(observed)) {
    throw new SafetyViolation(`Target resolved to potentially mutating UI for ${action}`);
  }
  await element.click();
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

export async function safeTapWithin(element, action, xFraction = 0.5, yFraction = 0.5) {
  assertSafeAction(action);
  if (!['login.terms', 'login.privacy', 'nav.categories', 'categories.category_view', 'categories.product_view', 'search.result_view', 'product.variant_select', 'home.promise_open'].includes(action)) {
    throw new SafetyViolation(`Coordinate tap is forbidden for ${action}`);
  }
  const text = await element.getText().catch(() => '');
  if (['login.terms', 'login.privacy'].includes(action) && !/terms of service.*privacy policy/i.test(text)) {
    throw new SafetyViolation(`Policy tap target did not resolve to consent text for ${action}`);
  }
  // Product cards are catalogue-driven, so the tap target is verified by shape
  // (branded product label plus a price) instead of any one product's name.
  const contentDescription = await element.getAttribute('content-desc').catch(() => '');
  if (['categories.product_view', 'search.result_view'].includes(action)
    && !PRODUCT_CARD.test(text) && !PRODUCT_CARD.test(contentDescription)) {
    throw new SafetyViolation(`Tap target did not resolve to a priced product card for ${action}`);
  }
  if (action === 'product.variant_select' && !(PACK_SIZE.test(text) && PRICE.test(text))) {
    throw new SafetyViolation(`Tap target did not resolve to a priced pack-size option for ${action}`);
  }
  if (action === 'nav.categories') {
    const description = await element.getAttribute('content-desc').catch(() => '');
    if (!/^(open|categories)$/i.test(description || text)) {
      throw new SafetyViolation(`Category tap target did not resolve to the recorded category card for ${action}`);
    }
  }
  if (action === 'categories.category_view') {
    const description = await element.getAttribute('content-desc').catch(() => '');
    if (!(description || text).trim() || PRICE.test(description || text) || /add item/i.test(description || text)) {
      throw new SafetyViolation(`Category tap target did not resolve to a named category card for ${action}`);
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
  if (action !== 'categories.subcategory_scroll') throw new SafetyViolation(`Regional scroll is forbidden for ${action}`);
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
