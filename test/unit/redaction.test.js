import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNonSensitive, redact } from '../../src/utils/redaction.js';

test('redacts runtime secrets and phone-like values', () => {
  const output = redact('phone 9876543210 token secret-value', ['secret-value']);
  assert.equal(output.includes('9876543210'), false);
  assert.equal(output.includes('secret-value'), false);
});

test('refuses sensitive evidence', () => {
  assert.throws(() => assertNonSensitive('OTP 123456', []), /Sensitive content refused/);
  assert.equal(assertNonSensitive('Search results for toothpaste', []), true);
});

