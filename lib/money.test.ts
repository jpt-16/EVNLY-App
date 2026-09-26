import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCents, parseToCents, splitEvenly } from "./money.ts";

test("parseToCents accepts common inputs", () => {
  assert.equal(parseToCents("32"), 3200);
  assert.equal(parseToCents("32.5"), 3250);
  assert.equal(parseToCents("32.05"), 3205);
  assert.equal(parseToCents("$1,032.50"), 103250);
  assert.equal(parseToCents("0.99"), 99);
  assert.equal(parseToCents("5."), 500);
});

test("parseToCents rejects invalid inputs", () => {
  assert.equal(parseToCents(""), null);
  assert.equal(parseToCents("abc"), null);
  assert.equal(parseToCents("1.234"), null);
  assert.equal(parseToCents("-5"), null);
});

test("splitEvenly never loses a cent", () => {
  assert.deepEqual(splitEvenly(1000, 3), [334, 333, 333]);
  assert.deepEqual(splitEvenly(3200, 4), [800, 800, 800, 800]);
  assert.deepEqual(splitEvenly(2, 3), [1, 1, 0]);
  assert.deepEqual(splitEvenly(100, 0), []);
  for (const [amount, n] of [[9999, 7], [1, 5], [100000, 13]]) {
    assert.equal(splitEvenly(amount, n).reduce((a, b) => a + b, 0), amount);
  }
});

test("formatCents", () => {
  assert.equal(formatCents(8650), "$86.50");
  assert.equal(formatCents(0), "$0.00");
});
