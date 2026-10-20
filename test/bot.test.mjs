import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analyze, emptyBoard, POINTS, premiumAt } from "../js/engine.js";
import { chooseAction } from "../js/bot.js";
import { buildTrie, sideInsert, emptySide, trieHas } from "../js/dict.js";

function tile(id, letter) {
  const blank = letter === "?";
  return { id, letter: blank ? "" : letter, points: blank ? 0 : POINTS[letter], blank };
}

function place(id, letter, row, col) {
  return { tileId: id, letter, row, col, blank: false, points: POINTS[letter] };
}

test("the trie finds words and prefixes", () => {
  const trie = buildTrie(["CAT", "CATS", "CATCH", "DOG"]);
  assert.equal(trieHas(trie, "CAT"), true);
  assert.equal(trieHas(trie, "CATS"), true);
  assert.equal(trieHas(trie, "CATCH"), true);
  assert.equal(trieHas(trie, "DOG"), true);
  assert.equal(trieHas(trie, "CA"), false);
  assert.equal(trieHas(trie, "CATERPILLAR"), false);
  assert.equal(trieHas(trie, "DOT"), false);
});

test("Nell's best opening plays HELLO for 24 through the star", () => {
  const words = ["HELLO"];
  const trie = buildTrie(words);
  const dict = new Set(words);
  const action = chooseAction({
    board: emptyBoard(),
    rack: ["H", "E", "L", "L", "O"].map((letter, index) => tile(index + 1, letter)),
    bagCount: 80,
    trie,
    dict,
    difficulty: "best",
    rng: () => 0,
  });
  assert.equal(action.action, "play");
  assert.equal(action.score, 24);
  assert.equal(action.words.map((word) => word.word).join(","), "HELLO");
  assert.equal(action.placements.some((item) => item.row === 7 && item.col === 7), true);
  const check = analyze(emptyBoard(), action.placements, dict);
  assert.equal(check.ok, true);
  assert.equal(check.total, action.score);
});

test("Nell finds a parallel play and a hook", () => {
  const words = ["AT", "HO", "AH", "TO", "CAT", "CATS"];
  const trie = buildTrie(words);
  const dict = new Set(words);
  let board = emptyBoard();
  board[7][7] = { letter: "A", points: 1, blank: false, id: 50 };
  board[7][8] = { letter: "T", points: 1, blank: false, id: 51 };
  const parallel = chooseAction({
    board,
    rack: [tile(1, "H"), tile(2, "O")],
    bagCount: 50,
    trie,
    dict,
    difficulty: "best",
    rng: () => 0,
  });
  assert.equal(parallel.action, "play");
  assert.equal(parallel.score, 14);

  board = emptyBoard();
  board[7][5] = { letter: "C", points: 3, blank: false, id: 60 };
  board[7][6] = { letter: "A", points: 1, blank: false, id: 61 };
  board[7][7] = { letter: "T", points: 1, blank: false, id: 62 };
  const hook = chooseAction({
    board,
    rack: [tile(3, "S")],
    bagCount: 50,
    trie,
    dict,
    difficulty: "best",
    rng: () => 0,
  });
  assert.equal(hook.action, "play");
  assert.equal(hook.words[0].word, "CATS");
  assert.equal(hook.placements.length, 1);
  assert.equal(hook.placements[0].col, 8);
});

test("a word Mom added is visible to Nell", () => {
  const trie = buildTrie(["HELLO"]);
  const side = emptySide();
  sideInsert(side, "ZEN");
  const dict = { has: (word) => word === "ZEN" || word === "HELLO" };
  const board = emptyBoard();
  board[7][7] = { letter: "Z", points: 10, blank: false, id: 1 };
  board[7][8] = { letter: "E", points: 1, blank: false, id: 2 };
  const action = chooseAction({
    board,
    rack: [tile(3, "N")],
    bagCount: 10,
    trie,
    side,
    dict,
    difficulty: "best",
    rng: () => 0,
  });
  assert.equal(action.action, "play");
  assert.equal(action.words[0].word, "ZEN");
});

test("with no word and a full bag, Nell swaps instead of passing", () => {
  const trie = buildTrie(["HELLO"]);
  const dict = new Set(["HELLO"]);
  const action = chooseAction({
    board: emptyBoard(),
    rack: [tile(1, "Q"), tile(2, "Z"), tile(3, "X")],
    bagCount: 40,
    trie,
    dict,
    difficulty: "best",
    rng: () => 0,
  });
  assert.equal(action.action, "exchange");
  assert.equal(action.tileIds.length > 0, true);
});

test("the full word list builds and Nell moves on a phone-sized budget", { timeout: 60_000 }, () => {
  const text = fs.readFileSync(new URL("../words/words.txt", import.meta.url), "utf8");
  const list = text.trim().split("\n");
  const started = performance.now();
  const trie = buildTrie(list);
  const dict = new Set(list);
  const built = performance.now() - started;
  assert.equal(dict.has("HELLO"), true);
  assert.equal(dict.has("QI"), true);
  assert.equal(trieHas(trie, "EMAIL"), true);
  assert.equal(trieHas(trie, "COLOUR"), true);

  const board = emptyBoard();
  const opening = ["S", "T", "A", "R", "E", "D", "?"].map((letter, index) => tile(index + 1, letter));
  const t0 = performance.now();
  const action = chooseAction({
    board,
    rack: opening,
    bagCount: 80,
    trie,
    dict,
    difficulty: "best",
    rng: () => 0,
    budgetMs: 4000,
  });
  const elapsed = performance.now() - t0;
  assert.equal(action.action, "play");
  const check = analyze(board, action.placements, dict);
  assert.equal(check.ok, true);
  assert.equal(check.total, action.score);
  assert.equal(action.placements.some((item) => item.row === 7 && item.col === 7), true);
  assert.equal(elapsed < 4000, true, `opening took ${elapsed.toFixed(0)}ms, build ${built.toFixed(0)}ms`);

  board[7][7] = { letter: "A", points: 1, blank: false, id: 90 };
  board[7][8] = { letter: "T", points: 1, blank: false, id: 91 };
  const mid = chooseAction({
    board,
    rack: [tile(1, "S"), tile(2, "H"), tile(3, "E"), tile(4, "?"), tile(5, "R"), tile(6, "O"), tile(7, "N")],
    bagCount: 70,
    trie,
    dict,
    difficulty: "gentle",
    rng: () => 0.5,
    budgetMs: 4000,
  });
  assert.equal(mid.action, "play");
  const midCheck = analyze(board, mid.placements, dict);
  assert.equal(midCheck.ok, true);
  assert.equal(midCheck.total, mid.score);
  console.log(`trie ${built.toFixed(0)}ms, opening ${elapsed.toFixed(0)}ms for ${action.score}, mid ${mid.score}`);
  assert.equal(premiumAt(7, 7), "star");
});
