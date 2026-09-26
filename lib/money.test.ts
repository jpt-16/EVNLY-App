import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCents, parseShareWeight, parseToCents, splitByShares, splitEvenly } from "./money.ts";

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

test("splitByShares matches the database's results", () => {
  // same cases verified against add_expense in Postgres
  assert.deepEqual(splitByShares(3200, [2, 1, 0.5]), [1829, 914, 457]);
  assert.deepEqual(splitByShares(200, [1, 1, 1]), [67, 67, 66]);
  assert.deepEqual(splitByShares(1, [0.5, 0.5, 1]), [1, 0, 0]);
  assert.deepEqual(splitByShares(1000, [1]), [1000]);
});

test("splitByShares always sums to the amount with no negative shares", () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 5000; i++) {
    const amount = 1 + Math.floor(rand() * 100_000_000);
    const weights = Array.from({ length: 1 + Math.floor(rand() * 8) }, () =>
      Math.max(0.01, Math.round(rand() * 100_000) / 100),
    );
    const shares = splitByShares(amount, weights);
    assert.equal(shares.reduce((a, b) => a + b, 0), amount, `amount=${amount} weights=${weights}`);
    assert.ok(shares.every((s) => s >= 0 && Number.isInteger(s)));
  }
});

test("parseShareWeight", () => {
  assert.equal(parseShareWeight("1"), 1);
  assert.equal(parseShareWeight("0.5"), 0.5);
  assert.equal(parseShareWeight(".25"), 0.25);
  assert.equal(parseShareWeight(" 2 "), 2);
  assert.equal(parseShareWeight("1000"), 1000);
  for (const bad of ["", "0", "0.00", "-1", "1.234", "abc", "1001", "NaN"]) {
    assert.equal(parseShareWeight(bad), null, bad);
  }
});

test("formatCents", () => {
  assert.equal(formatCents(8650), "$86.50");
  assert.equal(formatCents(0), "$0.00");
});
