#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.argv[2] || process.env.RUN_ROOT || 'artifacts');
const resultsDir = path.join(root, 'allure-results');
const reportDir = path.join(root, 'allure-report');

if (!fs.existsSync(resultsDir)) {
  throw new Error(`Allure results directory does not exist: ${resultsDir}`);
}

const properties = [
  ['Provider', process.env.RUN_PROVIDER],
  ['Device', process.env.DEVICE_NAME],
  ['Android', process.env.ANDROID_VERSION]
].filter(([, value]) => value).map(([key, value]) => `${key}=${String(value).replaceAll('\n', ' ')}`).join('\n');
if (properties) fs.writeFileSync(path.join(resultsDir, 'environment.properties'), `${properties}\n`, { mode: 0o600 });

const categories = path.resolve('config/allure-categories.json');
if (fs.existsSync(categories)) fs.copyFileSync(categories, path.join(resultsDir, 'categories.json'));

const executable = path.resolve('node_modules/.bin/allure');
const generated = spawnSync(executable, ['generate', resultsDir, '--clean', '--single-file', '-o', reportDir], {
  stdio: 'inherit'
});
if (generated.error) throw generated.error;
if (generated.status !== 0) process.exit(generated.status ?? 1);
console.log(path.join(reportDir, 'index.html'));
