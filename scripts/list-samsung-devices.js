#!/usr/bin/env node
import { loadDotEnv } from '../src/config/env.js';

loadDotEnv();
const username = process.env.LT_USERNAME;
const key = process.env.LT_ACCESS_KEY;
if (!username || !key) throw new Error('LT_USERNAME and LT_ACCESS_KEY are required');

const response = await fetch(`https://mobile-api.lambdatest.com/mobile-automation/api/v1/list?region=${encodeURIComponent(process.env.LT_REGION || 'ap')}`, {
  headers: { Authorization: `Basic ${Buffer.from(`${username}:${key}`).toString('base64')}` }
});
if (!response.ok) throw new Error(`LambdaTest device inventory failed with HTTP ${response.status}`);
const payload = await response.json();

function objects(value) {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(objects)];
}

const allowedKeys = ['deviceName', 'device_name', 'name', 'manufacturer', 'brand', 'platformVersion', 'platform_version', 'osVersion', 'os_version', 'version', 'isAvailable', 'is_available', 'available'];
const samsung = objects(payload)
  .filter((item) => /samsung|galaxy/i.test(JSON.stringify(item)))
  .map((item) => Object.fromEntries(allowedKeys.filter((name) => item[name] != null).map((name) => [name, item[name]])))
  .filter((item) => Object.keys(item).length && /samsung|galaxy/i.test(JSON.stringify(item)));
const unique = [...new Map(samsung.map((item) => [JSON.stringify(item), item])).values()];
console.log(JSON.stringify(unique, null, 2));
