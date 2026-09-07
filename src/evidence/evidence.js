import fs from 'node:fs';
import path from 'node:path';
import { assertNonSensitive } from '../utils/redaction.js';

const SENSITIVE_SCREENS = new Set(['login', 'otp', 'profile', 'addresses', 'order-details']);

export async function captureSafeEvidence(name, { screenshot = true, hierarchy = true } = {}) {
  if (SENSITIVE_SCREENS.has(name)) return { skipped: true, reason: 'sensitive-screen policy' };
  const dir = process.env.RUN_ARTIFACT_DIR || 'artifacts/manual';
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const source = hierarchy ? await browser.getPageSource() : '';
  assertNonSensitive(source, [process.env.JUST_TEST_PHONE, process.env.JUST_TEST_OTP]);
  if (hierarchy) fs.writeFileSync(path.join(dir, `${name}.xml`), source, { mode: 0o600 });
  if (screenshot) await browser.saveScreenshot(path.join(dir, `${name}.png`));
  return { skipped: false };
}

export async function captureFailureEvidence(testName) {
  const dir = process.env.RUN_ARTIFACT_DIR || 'artifacts/manual';
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const safeName = `failure-${String(testName).toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const skipFile = path.join(dir, `${safeName}-screenshot-skipped.txt`);
  const source = await browser.getPageSource().catch(() => '');
  const visibleText = [...source.matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((match) => match[1]).filter(Boolean).join('\n');
  const secrets = [process.env.JUST_TEST_PHONE, process.env.JUST_TEST_OTP];
  const sensitiveTest = /phone|otp|terms|privacy|policy|address|profile|order/i.test(testName);
  const sensitiveScreen = /Enter OTP|Phone number|mobile number|Edit phone|delivery address|saved address/i.test(source);
  try {
    if (sensitiveTest || sensitiveScreen) throw new Error('sensitive test or screen');
    assertNonSensitive(visibleText, secrets);
    fs.writeFileSync(path.join(dir, `${safeName}.xml`), source, { mode: 0o600 });
    await browser.saveScreenshot(path.join(dir, `${safeName}.png`));
    return { skipped: false, path: path.resolve(dir, `${safeName}.png`) };
  } catch {
    fs.writeFileSync(skipFile, 'Screenshot intentionally skipped by the sensitive-evidence policy.\n', { mode: 0o600 });
    return { skipped: true, path: path.resolve(skipFile) };
  }
}
