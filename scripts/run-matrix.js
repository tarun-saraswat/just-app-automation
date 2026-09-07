#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadDotEnv, loadRuntimeAppId, validateCloudEnv } from '../src/config/env.js';
import { loadMatrix } from '../src/config/matrix.js';

loadDotEnv();
loadRuntimeAppId();
validateCloudEnv({ requireAuth: process.env.RUN_SUITE !== 'guest' });
const matrix = loadMatrix(process.env.DEVICE_MATRIX_FILE || 'config/devices.json');
const concurrency = Math.max(1, Math.min(matrix.length, Number(process.env.MATRIX_CONCURRENCY || 1)));
const root = process.env.RUN_ROOT || path.join('artifacts', new Date().toISOString().replaceAll(':', '-'));
fs.mkdirSync(root, { recursive: true, mode: 0o700 });

function run(device, index) {
  return new Promise((resolve) => {
    const runDir = path.resolve(root, `${index + 1}-${device.name.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}-android-${device.version}`);
    const configFile = process.env.RUN_SUITE === 'guest' ? 'wdio.guest.cloud.conf.js' : 'wdio.conf.js';
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wdio', 'run', configFile], {
      stdio: 'inherit',
      env: { ...process.env, RUN_PROVIDER: 'lambdatest', DEVICE_NAME: device.name, ANDROID_VERSION: String(device.version), RUN_ARTIFACT_DIR: runDir }
    });
    child.on('exit', (code) => resolve({ device, code: code ?? 1, runDir }));
  });
}

const pending = matrix.map((device, index) => ({ device, index }));
const outcomes = [];
async function worker() {
  while (pending.length) {
    const item = pending.shift();
    outcomes.push(await run(item.device, item.index));
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
fs.writeFileSync(path.join(root, 'matrix-summary.json'), JSON.stringify(outcomes, null, 2), { mode: 0o600 });
for (const outcome of outcomes) console.log(`${outcome.code === 0 ? 'PASS' : 'FAIL'} ${outcome.device.name} Android ${outcome.device.version} ${outcome.runDir}`);
if (outcomes.some((item) => item.code !== 0)) process.exitCode = 1;
