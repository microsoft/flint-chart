import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackendSnapshot } from './backend-snapshot.mjs';

test('retains bundle content and version while a rebuild removes or empties it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flint-backend-'));
  const path = join(directory, 'index.js');
  try {
    writeFileSync(path, 'export const version = 1;');
    const current = createBackendSnapshot(path);
    const initial = current();
    unlinkSync(path);
    assert.equal(current(), initial);
    writeFileSync(path, '');
    assert.equal(current(), initial);
    writeFileSync(path, 'export const version = 2;');
    const nextTime = new Date(initial.version + 2000);
    utimesSync(path, nextTime, nextTime);
    assert.equal(current().content.toString(), 'export const version = 2;');
    assert.ok(current().version > initial.version);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});