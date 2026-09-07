#!/usr/bin/env node
// Optional local-emulator discovery only. Never use this script for acceptance.
import { execFileSync } from 'node:child_process';
import { loadDotEnv } from '../src/config/env.js';

loadDotEnv();
const device = process.env.ADB_DEVICE;
if (!device) throw new Error('ADB_DEVICE is required; use run-local.sh for automatic device discovery');
const stage = process.argv[2];

function adb(...args) {
  return execFileSync('adb', ['-s', device, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function center(bounds) {
  const values = [...bounds.matchAll(/\d+/g)].map((match) => Number(match[0]));
  return [Math.round((values[0] + values[2]) / 2), Math.round((values[1] + values[3]) / 2)];
}

function redactedSummary(xml) {
  const safe = xml
    .replaceAll(process.env.JUST_TEST_PHONE || 'never-match-phone', '[REDACTED]')
    .replaceAll(process.env.JUST_TEST_OTP || 'never-match-otp', '[REDACTED]')
    .replace(/\b\d{4,10}\b/g, '[REDACTED]');
  const nodes = [...safe.matchAll(/<node\s+[^>]+>/g)].map((match) => match[0]);
  return nodes
    .filter((node) => /OTP|verify|continue|login|error|EditText|content-desc="[^"]+"/i.test(node))
    .map((node) => Object.fromEntries(['text', 'class', 'content-desc', 'clickable', 'enabled', 'bounds']
      .map((name) => [name, node.match(new RegExp(`${name}="([^"]*)"`))?.[1] || ''])))
    .slice(0, 30);
}

async function dumpRedacted(name) {
  const remote = `/sdcard/${name}.xml`;
  adb('shell', 'uiautomator', 'dump', remote);
  const xml = adb('exec-out', 'cat', remote);
  try { adb('shell', 'rm', '-f', remote); } catch { /* Some emulator images remove dumps after read. */ }
  console.log(JSON.stringify(redactedSummary(xml), null, 2));
  return xml;
}

async function classify() {
  const remote = '/sdcard/just-login-sensitive.xml';
  adb('shell', 'uiautomator', 'dump', remote);
  const xml = adb('exec-out', 'cat', remote);
  try { adb('shell', 'rm', '-f', remote); } catch { /* best effort */ }
  console.log(JSON.stringify({
    otpScreen: /Enter OTP|Didn't get OTP|Resend OTP/i.test(xml),
    errorState: /invalid|incorrect|expired|error|try again|went wrong/i.test(xml),
    homeMarkers: /Search|Categories|Shop by|Home/i.test(xml),
    permissionPrompt: /permission|Allow|notification|location|while using|precise/i.test(xml),
    notificationPermission: /notification|POST_NOTIFICATIONS/i.test(xml),
    locationPermission: /location|ACCESS_(?:FINE|COARSE)_LOCATION|precise/i.test(xml),
    loginLanding: /Log in with phone number|Enter your mobile number/i.test(xml),
    loadingState: /loading|progressbar/i.test(xml),
    nodeCount: (xml.match(/<node\s/g) || []).length
  }, null, 2));
}

async function phone() {
  const value = process.env.JUST_TEST_PHONE;
  if (!value) throw new Error('JUST_TEST_PHONE is missing');
  adb('shell', 'input', 'tap', '700', '2325');
  adb('shell', 'input', 'text', value);
  await sleep(500);
  adb('shell', 'input', 'tap', '640', '2550');
  await sleep(3500);
  await dumpRedacted('just-otp-sensitive');
}

async function otp() {
  const value = process.env.JUST_TEST_OTP;
  if (!value) throw new Error('JUST_TEST_OTP is missing');
  const xml = await dumpRedacted('just-otp-sensitive');
  const editTexts = [...xml.matchAll(/<node\s+[^>]*class="android\.widget\.EditText"[^>]*bounds="([^"]+)"[^>]*>/g)];
  if (!editTexts.length) throw new Error('No OTP input was found');
  const [x, y] = center(editTexts[0][1]);
  adb('shell', 'input', 'tap', String(x), String(y));
  adb('shell', 'input', 'text', value);
  await sleep(5000);
  const activity = adb('shell', 'dumpsys', 'activity', 'activities');
  const resumed = activity.split('\n').find((line) => line.includes('topResumedActivity')) || '';
  console.log(resumed.includes('JustNuxActivity') ? 'Login remains on the authentication activity' : 'Login advanced beyond the authentication activity');
}

if (!['phone', 'otp', 'inspect'].includes(stage)) throw new Error('Usage: node scripts/local-login-debug.js phone|otp|inspect');
if (stage === 'phone') await phone();
else if (stage === 'otp') await otp();
else await classify();
