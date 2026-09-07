import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMatrix } from '../../src/config/matrix.js';

test('default cloud matrix contains at least three versioned devices', () => {
  const matrix = loadMatrix();
  assert.ok(matrix.length >= 3);
  assert.ok(matrix.every(({ name, version }) => name && version));
});

