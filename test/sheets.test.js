import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsToObjects, objectToRow, attachRowNumbers, parseStartRow } from '../src/sheets.js';

const cols = ['place_id', 'business_name', 'status'];

test('rowsToObjects maps a header + data grid to keyed objects', () => {
  const grid = [['place_id', 'business_name', 'status'], ['p1', 'Acme', 'Discovered']];
  assert.deepEqual(rowsToObjects(grid), [{ place_id: 'p1', business_name: 'Acme', status: 'Discovered' }]);
});

test('rowsToObjects pads short rows and ignores a header-only sheet', () => {
  assert.deepEqual(rowsToObjects([['place_id', 'business_name', 'status']]), []);
  const grid = [['place_id', 'business_name', 'status'], ['p2']];
  assert.deepEqual(rowsToObjects(grid)[0], { place_id: 'p2', business_name: '', status: '' });
});

test('attachRowNumbers tags each object with its 1-based sheet row (header = row 1)', () => {
  const objs = attachRowNumbers([{ place_id: 'p1' }, { place_id: 'p2' }]);
  assert.equal(objs[0]._row, 2);
  assert.equal(objs[1]._row, 3);
});

test('objectToRow emits values in the given column order, blanks for missing', () => {
  assert.deepEqual(objectToRow({ place_id: 'p1', status: 'Drafted' }, cols), ['p1', '', 'Drafted']);
});

test('parseStartRow reads the first row number from an append updatedRange', () => {
  assert.equal(parseStartRow('Leads!A5:AJ7'), 5);
  assert.equal(parseStartRow(undefined), null);
});
