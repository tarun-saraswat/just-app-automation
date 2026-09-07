#!/usr/bin/env node
import fs from 'node:fs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const [phone, otp] = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
if (!phone || !otp) throw new Error('Two non-empty input lines are required');

const file = '.env';
const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
const replacements = new Map([
  ['JUST_TEST_PHONE', phone],
  ['JUST_TEST_OTP', otp]
]);
const seen = new Set();
const updated = existing.map((line) => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (!match || !replacements.has(match[1])) return line;
  seen.add(match[1]);
  return `${match[1]}=${replacements.get(match[1])}`;
});
for (const [key, value] of replacements) if (!seen.has(key)) updated.push(`${key}=${value}`);
fs.writeFileSync(file, `${updated.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 });
fs.chmodSync(file, 0o600);
console.log('Login runtime variables updated in ignored .env');
