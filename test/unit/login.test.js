import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedDestinationFromSource } from '../../src/screens/login.screen.js';

test('recognizes Home as an authenticated destination', () => {
  assert.equal(authenticatedDestinationFromSource('<node content-desc="Account"/><node text="Search for &quot;Oil&quot;"/>'), 'home');
});

test('recognizes location search as an authenticated destination', () => {
  assert.equal(authenticatedDestinationFromSource('<node text="Select Your Location"/><node text="Search an area or address"/>'), 'location-search');
});

test('does not classify the OTP form as authenticated', () => {
  assert.equal(authenticatedDestinationFromSource('<node text="Enter OTP"/><node text="Resend OTP"/>'), null);
});
