#!/usr/bin/env node
import fs from 'node:fs';
import { loadDotEnv, loadRuntimeAppId, safeEnvSummary, validateCloudEnv } from '../src/config/env.js';
import { loadMatrix } from '../src/config/matrix.js';

loadDotEnv();
loadRuntimeAppId();
try {
  validateCloudEnv({ requireAuth: process.env.RUN_SUITE !== 'guest' });
  const matrix = loadMatrix();
  if (!fs.existsSync('fixtures/search.csv') || !fs.existsSync('fixtures/categories.csv')) throw new Error('Required CSV fixtures are missing');
  console.log(JSON.stringify({ ok: true, environment: safeEnvSummary(), matrix }, null, 2));
} catch (error) {
  console.error(`Preflight failed: ${error.message}`);
  process.exitCode = 2;
}
