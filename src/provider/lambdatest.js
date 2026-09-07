import { boolEnv } from '../config/env.js';

export const LT_HOST = 'mobile-hub.lambdatest.com';
export const LT_PORT = 80;
export const LT_PATH = '/wd/hub';

export function lambdaCapabilities() {
  const deviceName = process.env.DEVICE_NAME;
  const platformVersion = process.env.ANDROID_VERSION;
  if (!deviceName || !platformVersion) throw new Error('DEVICE_NAME and ANDROID_VERSION are required');
  const options = {
    w3c: true,
    platformName: 'android',
    deviceName,
    platformVersion,
    isRealMobile: true,
    app: process.env.LT_APP_ID,
    build: process.env.LT_BUILD_NAME || `Just production read-only sanity ${new Date().toISOString().slice(0, 10)}`,
    name: process.env.LT_TEST_NAME || `Just sanity - ${deviceName} / Android ${platformVersion}`,
    project: 'Just production read-only sanity',
    video: true,
    visual: true,
    network: true,
    console: true,
    devicelog: true,
    timezone: 'Kolkata',
    geoLocation: 'IN',
    autoGrantPermissions: false,
    autoAcceptAlerts: false,
    idleTimeout: 300,
    newCommandTimeout: 180,
    tunnel: boolEnv('LT_TUNNEL_ENABLED', false)
  };
  if (options.tunnel && process.env.LT_TUNNEL_NAME) options.tunnelName = process.env.LT_TUNNEL_NAME;
  return {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:noReset': false,
    'appium:fullReset': false,
    'appium:newCommandTimeout': 180,
    'lt:options': options
  };
}

export function sessionUrl(sessionId) {
  return sessionId ? `https://automation.lambdatest.com/logs/?testID=${encodeURIComponent(sessionId)}` : '';
}

