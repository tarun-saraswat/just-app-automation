import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendCsv, readCsv } from '../../src/utils/csv.js';

test('reads quoted fixture cells', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'just-csv-'));
  const file = path.join(dir, 'fixture.csv');
  fs.writeFileSync(file, 'name,value\nitem,"one,two"\n');
  assert.deepEqual(readCsv(file), [{ name: 'item', value: 'one,two' }]);
});

test('writes report rows with stable columns', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'just-report-'));
  const file = path.join(dir, 'result.csv');
  appendCsv(file, ['scenario', 'observed'], { scenario: 'search', observed: 'Colgate, toothpaste' });
  assert.deepEqual(readCsv(file), [{ scenario: 'search', observed: 'Colgate, toothpaste' }]);
});

