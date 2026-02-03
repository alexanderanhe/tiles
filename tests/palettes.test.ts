import assert from "node:assert/strict";
import test from "node:test";

import {
  clampPalette,
  dedupeColors,
  normalizeHex,
  seedToHex,
} from "../app/lib/palettes.server.ts";

test("normalizeHex supports short hex", () => {
  assert.equal(normalizeHex("#abc"), "#AABBCC");
});

test("dedupeColors removes duplicates", () => {
  assert.deepEqual(dedupeColors(["#AABBCC", "#aabbcc", "#112233"]), [
    "#AABBCC",
    "#112233",
  ]);
});

test("clampPalette enforces min colors", () => {
  const result = clampPalette(
    { backgroundColor: "#ffffff", crayonColors: ["#111111"] },
    3,
    5
  );
  assert.equal(result, null);
});

test("seedToHex is deterministic", () => {
  assert.equal(seedToHex("theme:Q1"), seedToHex("theme:Q1"));
});
