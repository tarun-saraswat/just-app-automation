import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCartViewLabel, assertSafeAction, SafetyViolation } from '../../src/safety/guard.js';

test('permits explicitly allowlisted read-only navigation', () => {
  assert.equal(assertSafeAction('nav.account', 'Account'), true);
  assert.equal(assertSafeAction('orders.existing_order_view', 'Existing order details'), true);
  assert.equal(assertSafeAction('login.terms', 'Terms of service'), true);
  assert.equal(assertSafeAction('login.privacy', 'Privacy policy'), true);
  assert.equal(assertSafeAction('account.logout', 'Logout'), true);
  assert.equal(assertSafeAction('account.logout_confirm', 'Confirm logout'), true);
});

test('rejects unknown actions before interaction', () => {
  assert.throws(() => assertSafeAction('unknown.cta', 'Learn more'), SafetyViolation);
});

test('rejects mutating CTA text even with an allowlisted action', () => {
  for (const text of ['Add', 'Buy now', 'View Cart', 'Cancel order', 'Edit address', 'Contact support']) {
    assert.throws(() => assertSafeAction('search.result_view', text), SafetyViolation);
  }
});

test('permits cart.view navigation for cart-view labels only', () => {
  assert.equal(assertSafeAction('cart.view', 'Cart'), true);
  assert.equal(assertSafeAction('cart.view', 'Your Cart ₹141 (1 Item)'), true);
  assert.equal(assertSafeAction('cart.view', 'View Cart'), true);
  assert.equal(assertSafeAction('cart.view', ''), true);
  assert.throws(() => assertSafeAction('cart.view', 'Checkout'), SafetyViolation);
  assert.throws(() => assertSafeAction('cart.view', 'Add to Cart'), SafetyViolation);
  assert.throws(() => assertSafeAction('cart.view', 'Cart Place order'), SafetyViolation);
  assert.throws(() => assertCartViewLabel('Your Cart Pay now'), SafetyViolation);
  assert.throws(() => assertCartViewLabel('Learn more'), SafetyViolation);
  // other actions must not inherit the cart exemption
  assert.throws(() => assertSafeAction('search.result_view', 'Your Cart'), SafetyViolation);
});

test('allows only the explicitly scoped guest cart addition mutation', () => {
  assert.equal(assertSafeAction('product.cart_add', 'Add to Cart'), true);
  assert.equal(assertSafeAction('product.cart_remove', 'Remove from Cart'), true);
  assert.equal(assertSafeAction('cart.clear_unserviceable', 'Clear Cart'), true);
  assert.throws(() => assertSafeAction('search.result_view', 'Add to Cart'), SafetyViolation);
  assert.throws(() => assertSafeAction('product.checkout', 'Checkout'), SafetyViolation);
});
