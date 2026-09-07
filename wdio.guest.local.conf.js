import path from 'node:path';
import fs from 'node:fs';
import allureReporter from '@wdio/allure-reporter';
import { loadDotEnv, apkPath } from './src/config/env.js';
import { captureFailureEvidence } from './src/evidence/evidence.js';

loadDotEnv();
const apk = apkPath();
const udid = process.env.ADB_DEVICE;
if (!udid) throw new Error('ADB_DEVICE is required; use run-local.sh for automatic device discovery');

export const config = {
  runner: 'local', protocol: 'http', hostname: '127.0.0.1', port: 4723, path: '/',
  specs: ['./test/specs/just-guest-browse.spec.js'], maxInstances: 1,
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': udid,
    'appium:deviceName': process.env.LOCAL_DEVICE_NAME || udid,
    'appium:platformVersion': process.env.ANDROID_VERSION,
    'appium:app': apk,
    'appium:appPackage': 'in.jusshop.android.just.prod',
    'appium:appActivity': 'in.swiggy.android.HomeIcon',
    'appium:noReset': false,
    'appium:fullReset': false,
    'appium:autoGrantPermissions': false,
    'appium:newCommandTimeout': 180,
    'appium:adbExecTimeout': 120000,
    'appium:appWaitDuration': 120000
  }],
  services: [['appium', {
    command: path.resolve('node_modules/.bin/appium'),
    args: { address: '127.0.0.1', port: 4723, basePath: '/', allowInsecure: 'uiautomator2:chromedriver_autodownload' },
    logPath: path.join(process.env.RUN_ARTIFACT_DIR || 'artifacts/local-guest', 'appium')
  }]],
  logLevel: process.env.WDIO_LOG_LEVEL || 'info',
  outputDir: path.join(process.env.RUN_ARTIFACT_DIR || 'artifacts/local-guest', 'wdio-logs'),
  connectionRetryTimeout: 120000, connectionRetryCount: 1,
  framework: 'mocha', reporters: ['spec', ['allure', {
    outputDir: path.join(process.env.RUN_ROOT || 'artifacts/local-guest', 'allure-results'),
    disableWebdriverStepsReporting: true,
    disableWebdriverScreenshotsReporting: true
  }]],
  mochaOpts: { ui: 'bdd', timeout: 300000 }, waitforTimeout: 20000, waitforInterval: 400,
  async afterTest(test, _context, result) {
    if (!result.passed) {
      const evidence = await captureFailureEvidence(test.title || 'unknown-test');
      allureReporter.addAttachment(evidence.skipped ? 'Screenshot not captured (safety policy)' : 'Screenshot on failure', fs.readFileSync(evidence.path), evidence.skipped ? 'text/plain' : 'image/png');
    }
  }
};
