import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeAction, SafetyViolation } from '../../src/safety/guard.js';

test('permits explicitly allowlisted read-only navigation', () => {
  assert.equal(assertSafeAction('nav.account', 'Account'), true);
  assert.equal(assertSafeAction('orders.existing_order_view', 'Existing order details'), true);
  assert.equal(assertSafeAction('login.terms', 'Terms of service'), true);
  assert.equal(assertSafeAction('login.privacy', 'Privacy policy'), true);
});

test('rejects unknown actions before interaction', () => {
  assert.throws(() => assertSafeAction('unknown.cta', 'Learn more'), SafetyViolation);
});

test('rejects mutating CTA text even with an allowlisted action', () => {
  for (const text of ['Add', 'Buy now', 'View Cart', 'Cancel order', 'Edit address', 'Contact support']) {
    assert.throws(() => assertSafeAction('search.result_view', text), SafetyViolation);
  }
});

test('allows only the explicitly scoped guest cart addition mutation', () => {
  assert.equal(assertSafeAction('product.cart_add', 'Add to Cart'), true);
  assert.equal(assertSafeAction('product.cart_remove', 'Remove from Cart'), true);
  assert.throws(() => assertSafeAction('search.result_view', 'Add to Cart'), SafetyViolation);
  assert.throws(() => assertSafeAction('product.checkout', 'Checkout'), SafetyViolation);
});
