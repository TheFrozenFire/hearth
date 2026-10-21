import assert from "node:assert/strict";
import test from "node:test";
import { snapSquares } from "../js/ui.js";

function has(set, row, col) {
  return set.has(`${row}-${col}`);
}

test("the opening snap is the center row and column", () => {
  const targets = snapSquares([], []);
  assert.equal(targets.size, 29);
  assert.equal(has(targets, 7, 7), true);
  assert.equal(has(targets, 7, 0), true);
  assert.equal(has(targets, 0, 7), true);
  assert.equal(has(targets, 8, 8), false);
  assert.equal(has(targets, 0, 0), false);
});

test("later turns snap beside tiles already on the board", () => {
  const targets = snapSquares([{ row: 7, col: 7 }, { row: 7, col: 8 }], []);
  assert.equal(has(targets, 7, 6), true);
  assert.equal(has(targets, 7, 9), true);
  assert.equal(has(targets, 6, 7), true);
  assert.equal(has(targets, 8, 8), true);
  assert.equal(has(targets, 6, 8), true);
  assert.equal(has(targets, 7, 7), false);
  assert.equal(has(targets, 7, 4), false);
});

test("a tile already placed this turn pulls the next one into its line", () => {
  const targets = snapSquares([], [{ row: 7, col: 7 }]);
  assert.equal(has(targets, 7, 6), true);
  assert.equal(has(targets, 7, 8), true);
  assert.equal(has(targets, 6, 7), true);
  assert.equal(has(targets, 8, 7), true);
  assert.equal(has(targets, 7, 9), false);
  assert.equal(has(targets, 8, 8), false);
});

test("two tiles in a row extend that row, including a gap", () => {
  const targets = snapSquares([], [{ row: 7, col: 6 }, { row: 7, col: 8 }]);
  assert.equal(has(targets, 7, 5), true);
  assert.equal(has(targets, 7, 7), true);
  assert.equal(has(targets, 7, 9), true);
  assert.equal(has(targets, 6, 6), false);
  assert.equal(has(targets, 8, 8), false);
});
