import path from 'node:path';
import fs from 'node:fs';
import allureReporter from '@wdio/allure-reporter';
import { loadDotEnv, loadRuntimeAppId, validateCloudEnv } from './src/config/env.js';
import { lambdaCapabilities, LT_HOST, LT_PATH, LT_PORT } from './src/provider/lambdatest.js';
import { captureFailureEvidence } from './src/evidence/evidence.js';

loadDotEnv();
loadRuntimeAppId();
validateCloudEnv({ requireAuth: false });

export const config = {
  runner: 'local', protocol: 'http', hostname: LT_HOST, port: LT_PORT, path: LT_PATH,
  user: process.env.LT_USERNAME, key: process.env.LT_ACCESS_KEY,
  specs: ['./test/specs/just-guest-browse.spec.js'], maxInstances: 1,
  capabilities: [lambdaCapabilities()],
  logLevel: process.env.WDIO_LOG_LEVEL || 'info',
  outputDir: path.join(process.env.RUN_ARTIFACT_DIR || 'artifacts/wdio', 'logs'),
  connectionRetryTimeout: 120000, connectionRetryCount: 2,
  framework: 'mocha', reporters: ['spec', ['allure', {
    outputDir: path.join(process.env.RUN_ROOT || 'artifacts', 'allure-results'),
    disableWebdriverStepsReporting: true,
    disableWebdriverScreenshotsReporting: true
  }]],
  mochaOpts: { ui: 'bdd', timeout: 300000 }, waitforTimeout: 20000, waitforInterval: 400,
  beforeSession() {
    if (process.env.RUN_PROVIDER !== 'lambdatest') throw new Error('Guest cloud config only permits RUN_PROVIDER=lambdatest');
  },
  async afterTest(test, _context, result) {
    if (!result.passed) {
      const evidence = await captureFailureEvidence(test.title || 'unknown-test');
      allureReporter.addAttachment(evidence.skipped ? 'Screenshot not captured (safety policy)' : 'Screenshot on failure', fs.readFileSync(evidence.path), evidence.skipped ? 'text/plain' : 'image/png');
    }
  }
};
