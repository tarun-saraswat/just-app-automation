#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Blob } from 'node:buffer';
import { apkPath, loadDotEnv, validateCloudEnv } from '../src/config/env.js';

loadDotEnv();

async function main() {
  validateCloudEnv({ requireAuth: false, requireApp: false });
  const username = process.env.LT_USERNAME;
  const key = process.env.LT_ACCESS_KEY;
  if (!username || !key) throw new Error('LT_USERNAME and LT_ACCESS_KEY are required for upload');
  const apk = apkPath();
  const form = new FormData();
  form.append('appFile', new Blob([fs.readFileSync(apk)], { type: 'application/vnd.android.package-archive' }), path.basename(apk));
  form.append('name', process.env.LT_APP_NAME || `just-production-${Date.now()}`);
  const response = await fetch('https://manual-api.lambdatest.com/app/upload/realDevice', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${username}:${key}`).toString('base64')}` },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`LambdaTest upload failed with HTTP ${response.status}`);
  const appId = body.app_url || body.app_id || body.url;
  if (!/^lt:\/\/APP/i.test(appId || '')) throw new Error('Upload succeeded but no lt://APP identifier was returned');
  const outputIndex = process.argv.indexOf('--output-file');
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error('--output-file requires a path');
    const resolved = path.resolve(output);
    fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
    fs.writeFileSync(resolved, `${appId}\n`, { mode: 0o600 });
    console.log('LambdaTest app ID saved to the ignored runtime cache');
  } else {
    console.log(appId);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
