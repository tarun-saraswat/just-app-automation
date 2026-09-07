import fs from 'node:fs';
import path from 'node:path';

const SECRET_NAMES = ['LT_USERNAME', 'LT_ACCESS_KEY', 'JUST_TEST_PHONE', 'JUST_TEST_OTP'];

export function loadDotEnv(file = '.env') {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 1) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function loadRuntimeAppId(file = '.runtime/lt-app-id') {
  if (process.env.LT_APP_ID || !fs.existsSync(file)) return;
  const value = fs.readFileSync(file, 'utf8').trim();
  if (/^lt:\/\/APP/i.test(value)) process.env.LT_APP_ID = value;
}

export function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  if (!['true', 'false'].includes(value.toLowerCase())) throw new Error(`${name} must be true or false`);
  return value.toLowerCase() === 'true';
}

export function validateCloudEnv({ requireAuth = true, requireApp = true } = {}) {
  const required = ['LT_USERNAME', 'LT_ACCESS_KEY'];
  if (requireAuth) required.push('JUST_TEST_PHONE', 'JUST_TEST_OTP');
  if (requireApp) required.push('LT_APP_ID');
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing required runtime variables: ${missing.join(', ')}`);
  if (process.env.RUN_PROVIDER && process.env.RUN_PROVIDER !== 'lambdatest') {
    throw new Error('RUN_PROVIDER must be lambdatest for acceptance runs');
  }
  if (requireApp && !/^lt:\/\/APP/i.test(process.env.LT_APP_ID)) {
    throw new Error('LT_APP_ID must be a LambdaTest lt://APP… identifier');
  }
}

export function safeEnvSummary() {
  return Object.fromEntries([
    ['RUN_PROVIDER', process.env.RUN_PROVIDER || 'lambdatest'],
    ['DEVICE_NAME', process.env.DEVICE_NAME || 'matrix'],
    ['ANDROID_VERSION', process.env.ANDROID_VERSION || 'matrix'],
    ['LT_APP_ID', process.env.LT_APP_ID ? '[configured]' : '[missing]'],
    ['LT_TUNNEL_ENABLED', String(boolEnv('LT_TUNNEL_ENABLED', false))],
    ...SECRET_NAMES.map((key) => [key, process.env[key] ? '[configured]' : '[missing]'])
  ]);
}

export function apkPath() {
  const candidate = process.env.APK_PATH;
  if (!candidate) throw new Error('APK_PATH is required when LT_APP_ID is not supplied');
  const absolute = path.resolve(candidate);
  if (!fs.existsSync(absolute) || !absolute.toLowerCase().endsWith('.apk')) {
    throw new Error('APK_PATH must point to a readable .apk file');
  }
  return absolute;
}
