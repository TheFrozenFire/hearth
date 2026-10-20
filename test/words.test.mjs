import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const words = fs.readFileSync(new URL("../words/words.txt", import.meta.url), "utf8").trim().split("\n");
const set = new Set(words);

test("the word list is uppercase, short enough to play, and has everyday words", () => {
  assert.equal(words.length > 100000, true);
  for (const word of ["HELLO", "QI", "ZA", "EMAIL", "COLOUR", "COLOR", "CENTRE", "CENTER", "MOM", "WIFI", "APP"]) {
    assert.equal(set.has(word), true, word);
  }
  assert.equal(set.has("A"), false);
  assert.equal(words.every((word) => /^[A-Z]{2,15}$/.test(word)), true);
});

test("blocked words are not in the list", () => {
  const hashes = new Set(
    fs.readFileSync(new URL("../tools/block.sha256", import.meta.url), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  for (const word of words) {
    const hash = createHash("sha256").update(word.toLowerCase()).digest("hex");
    assert.equal(hashes.has(hash), false);
  }
});
