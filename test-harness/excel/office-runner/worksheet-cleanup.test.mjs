import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./officejs/taskpane.js', import.meta.url), 'utf8')
  .replace("import { renderExcelChart } from '/flint-excel-backend.js';", '');

test('direct worker resets used-range visibility before clearing cells', async () => {
  const calls = [];
  const range = {
    isNullObject: false,
    set rowHidden(value) { calls.push(['rowHidden', value]); },
    set columnHidden(value) { calls.push(['columnHidden', value]); },
    clear() { calls.push(['clear']); },
  };
  const sheet = {
    charts: { load() {}, items: [{ delete() { calls.push(['deleteChart']); } }] },
    getUsedRangeOrNullObject() { return range; },
    getRange() { throw new Error('Cleanup must not request an unbounded worksheet range.'); },
  };
  const sandbox = {
    Office: { onReady() {} },
    Excel: { run: callback => callback({
      workbook: { worksheets: { getActiveWorksheet: () => sheet } },
      sync: async () => { calls.push(['sync']); },
    }) },
  };
  vm.runInNewContext(source, sandbox);
  await sandbox.cleanActiveWorksheet();
  assert.deepEqual(calls, [
    ['sync'], ['deleteChart'], ['rowHidden', false], ['columnHidden', false], ['clear'], ['sync'],
  ]);
});