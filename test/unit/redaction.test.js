import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNonSensitive, redact } from '../../src/utils/redaction.js';
import { allowSensitiveLocalScreenshots } from '../../src/evidence/evidence.js';

test('redacts runtime secrets and phone-like values', () => {
  const output = redact('phone 9876543210 token secret-value', ['secret-value']);
  assert.equal(output.includes('9876543210'), false);
  assert.equal(output.includes('secret-value'), false);
});

test('refuses sensitive evidence', () => {
  assert.throws(() => assertNonSensitive('OTP 123456', []), /Sensitive content refused/);
  assert.equal(assertNonSensitive('Search results for toothpaste', []), true);
});

test('allows sensitive screenshots only for an explicit local opt-in', () => {
  assert.equal(allowSensitiveLocalScreenshots({}), false);
  assert.equal(allowSensitiveLocalScreenshots({ RUN_PROVIDER: 'local' }), false);
  assert.equal(allowSensitiveLocalScreenshots({ RUN_PROVIDER: 'local', ALLOW_SENSITIVE_LOCAL_SCREENSHOTS: 'true' }), true);
  assert.equal(allowSensitiveLocalScreenshots({ RUN_PROVIDER: 'lambdatest', ALLOW_SENSITIVE_LOCAL_SCREENSHOTS: 'true' }), false);
});
