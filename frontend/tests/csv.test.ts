import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { csvCell } from '../src/services/csv'
test('CSV preserves embedded quotes, commas and line breaks', () => {
  assert.equal(csvCell('A,"B"\nC'), '"A,""B""\nC"')
  assert.equal(csvCell(null), '""')
})
test('CSV neutralizes spreadsheet formulas without altering numeric values', () => {
  for (const value of ['=1+1', '+SUM(A1)', '@SUM(A1)', '-1+2', '\t=1']) {
    assert.equal(csvCell(value), `"'${value}"`)
  }
  assert.equal(csvCell(-5), '"-5"')
  assert.equal(csvCell('521111'), '"521111"')
})
