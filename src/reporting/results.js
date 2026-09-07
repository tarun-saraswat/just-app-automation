import fs from 'node:fs';
import path from 'node:path';
import { appendCsv } from '../utils/csv.js';
import { redact } from '../utils/redaction.js';
import { sessionUrl } from '../provider/lambdatest.js';

const HEADERS = ['scenario', 'android_version', 'provider', 'device', 'expected_result', 'observed_result', 'status', 'duration_ms', 'cloud_session_link'];

export class Results {
  constructor() {
    this.runDir = process.env.RUN_ARTIFACT_DIR || path.join('artifacts', new Date().toISOString().replaceAll(':', '-'));
    fs.mkdirSync(this.runDir, { recursive: true, mode: 0o700 });
    this.file = path.join(this.runDir, 'results.csv');
    this.searchFile = path.join(this.runDir, 'search-observations.csv');
  }

  record({ scenario, expected, observed, status, durationMs, sessionId }) {
    const secrets = [process.env.JUST_TEST_PHONE, process.env.JUST_TEST_OTP, process.env.LT_ACCESS_KEY, process.env.LT_USERNAME];
    appendCsv(this.file, HEADERS, {
      scenario,
      android_version: process.env.ANDROID_VERSION,
      provider: process.env.RUN_PROVIDER === 'local' ? 'Local Android emulator (debug only)' : 'LambdaTest Real Device Cloud',
      device: process.env.DEVICE_NAME,
      expected_result: redact(expected, secrets),
      observed_result: redact(observed, secrets),
      status,
      duration_ms: durationMs,
      cloud_session_link: process.env.RUN_PROVIDER === 'local' ? '' : sessionUrl(sessionId)
    });
  }

  search({ query, product, position, outcome, sessionId }) {
    appendCsv(this.searchFile, ['query', 'observed_product', 'position', 'outcome', 'cloud_session_link'], {
      query, observed_product: redact(product), position, outcome,
      cloud_session_link: process.env.RUN_PROVIDER === 'local' ? '' : sessionUrl(sessionId)
    });
  }
}
