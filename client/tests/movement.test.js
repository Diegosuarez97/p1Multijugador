import test from "node:test";
import assert from "node:assert/strict";
import { findReachableTiles } from "../src/utils/movement.js";

test("movement range excludes blocked tiles and stays within the step limit", () => {
  const reachable = findReachableTiles(10, 10, 2, 60, new Set([611]));
  const tiles = new Set(reachable.map(({ x, y }) => `${x},${y}`));

  assert.equal(reachable.length, 10);
  assert.equal(tiles.has("11,10"), false);
  assert.equal(tiles.has("11,11"), true);
  assert.ok(reachable.every(({ x, y }) => Math.abs(x - 10) + Math.abs(y - 10) <= 2));
});
