import assert from "node:assert/strict";
import test from "node:test";
import {
  analyze,
  BOARD_SIZE,
  commitBoard,
  createBag,
  emptyBoard,
  POINTS,
  premiumAt,
} from "../js/engine.js";
import { createGame, exchangeTiles, passTurn, playMove } from "../js/game.js";

function dictOf(words) {
  return new Set(words);
}

function tile(id, letter) {
  const blank = letter === "?";
  return { id, letter: blank ? "" : letter, points: blank ? 0 : POINTS[letter], blank };
}

function place(tileId, letter, row, col, blank = false) {
  return {
    tileId,
    letter,
    row,
    col,
    blank,
    points: blank ? 0 : POINTS[letter],
  };
}

test("the board has the usual bonus squares and the center star", () => {
  const counts = { tw: 0, dw: 0, tl: 0, dl: 0, star: 0 };
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const premium = premiumAt(row, col);
      if (premium) counts[premium] += 1;
      assert.equal(premiumAt(row, col), premiumAt(14 - row, 14 - col));
      assert.equal(premiumAt(row, col), premiumAt(col, row));
    }
  }
  assert.deepEqual(counts, { tw: 8, dw: 16, tl: 12, dl: 24, star: 1 });
  assert.equal(premiumAt(7, 7), "star");
});

test("the bag has 100 tiles and the standard counts", () => {
  const bag = createBag();
  assert.equal(bag.length, 100);
  assert.equal(new Set(bag.map((item) => item.id)).size, 100);
  assert.equal(bag.filter((item) => item.blank).length, 2);
  assert.equal(bag.filter((item) => item.letter === "E").length, 12);
  assert.equal(bag.filter((item) => item.letter === "Q").length, 1);
  assert.equal(bag.find((item) => item.letter === "Q").points, 10);
});

test("HELLO through the star scores the double word, and the best line scores 24", () => {
  const board = emptyBoard();
  const dict = dictOf(["HELLO"]);
  const low = analyze(board, [
    place(1, "H", 7, 4),
    place(2, "E", 7, 5),
    place(3, "L", 7, 6),
    place(4, "L", 7, 7),
    place(5, "O", 7, 8),
  ], dict);
  assert.equal(low.ok, true);
  assert.equal(low.total, 16);

  const high = analyze(board, [
    place(1, "H", 7, 3),
    place(2, "E", 7, 4),
    place(3, "L", 7, 5),
    place(4, "L", 7, 6),
    place(5, "O", 7, 7),
  ], dict);
  assert.equal(high.ok, true);
  assert.equal(high.total, 24);
  assert.equal(high.bingo, false);
});

test("the first word has to cover the star, sit in a line, and be in the list", () => {
  const board = emptyBoard();
  const dict = dictOf(["AT", "HELLO"]);
  assert.equal(analyze(board, [place(1, "A", 0, 0), place(2, "T", 0, 1)], dict).reason, "center");
  assert.equal(analyze(board, [place(1, "A", 7, 7), place(2, "T", 8, 8)], dict).reason, "line");
  assert.equal(analyze(board, [place(1, "A", 7, 6), place(2, "T", 7, 8)], dict).reason, "gap");
  assert.equal(analyze(board, [place(1, "A", 7, 7)], dict).reason, "short");
  const unknown = analyze(board, [place(1, "Z", 7, 7), place(2, "E", 7, 8)], dict);
  assert.equal(unknown.reason, "unknown");
  assert.deepEqual(unknown.unknown, ["ZE"]);
});

test("a hook does not reuse a bonus, and a blank scores zero", () => {
  const dict = dictOf(["AT", "ATE", "HI"]);
  let board = commitBoard(emptyBoard(), [place(9, "T", 1, 0)]);
  const triple = analyze(board, [place(1, "A", 0, 0)], dict);
  assert.equal(triple.ok, true);
  assert.equal(triple.total, 6);
  board = commitBoard(board, [place(1, "A", 0, 0)]);
  const hook = analyze(board, [place(3, "E", 2, 0)], dict);
  assert.equal(hook.ok, true);
  assert.equal(hook.words[0].word, "ATE");
  assert.equal(hook.total, 3);

  const blank = analyze(emptyBoard(), [
    place(1, "H", 7, 7),
    place(2, "I", 7, 8, true),
  ], dict);
  assert.equal(blank.ok, true);
  assert.equal(blank.total, 8);
});

test("a parallel play scores the main word and each cross word", () => {
  const dict = dictOf(["AT", "HO", "AH", "TO"]);
  let board = emptyBoard();
  board = commitBoard(board, [place(1, "A", 7, 7), place(2, "T", 7, 8)]);
  const parallel = analyze(board, [place(3, "H", 8, 7), place(4, "O", 8, 8)], dict);
  assert.equal(parallel.ok, true);
  assert.equal(parallel.total, 14);
  const disconnected = analyze(board, [place(3, "H", 0, 0), place(4, "O", 0, 1)], dict);
  assert.equal(disconnected.reason, "connect");
});

test("seven tiles score the 50-point bonus once", () => {
  const dict = dictOf(["AAAAAAA"]);
  const placements = "AAAAAAA".split("").map((letter, index) => place(index + 1, letter, 7, 4 + index));
  const result = analyze(emptyBoard(), placements, dict);
  assert.equal(result.ok, true);
  assert.equal(result.bingo, true);
  assert.equal(result.total, 64);
});

test("playing the last tile moves the other rack's points across", () => {
  const game = createGame({ names: ["Mom", "Nell"], mode: "hotseat", rng: () => 0.2 });
  game.board = commitBoard(emptyBoard(), [place(50, "T", 7, 7)]);
  game.players[0].rack = [tile(1, "A")];
  game.players[0].score = 0;
  game.players[1].rack = [tile(2, "Q")];
  game.players[1].score = 0;
  game.bag.length = 0;
  game.turn = 0;
  const result = playMove(game, [place(1, "A", 7, 6)], dictOf(["AT"]));
  assert.equal(result.ok, true);
  assert.equal(game.phase, "over");
  assert.equal(game.end.reason, "out");
  assert.equal(game.players[0].score, 12);
  assert.equal(game.players[1].score, -10);
});

test("six scoreless turns end the game and subtract both racks", () => {
  const game = createGame({ names: ["Mom", "Nell"], mode: "hotseat", rng: () => 0.2 });
  game.players[0].rack = [tile(1, "A")];
  game.players[1].rack = [tile(2, "Q")];
  game.players[0].score = 10;
  game.players[1].score = 10;
  for (let i = 0; i < 6; i++) passTurn(game);
  assert.equal(game.phase, "over");
  assert.equal(game.end.reason, "stalemate");
  assert.equal(game.players[0].score, 9);
  assert.equal(game.players[1].score, 0);
});

test("a swap needs seven tiles in the bag and does not change the bag size", () => {
  const game = createGame({ names: ["Mom", "Nell"], mode: "bot", rng: () => 0.3 });
  assert.equal(game.bag.length, 86);
  assert.equal(game.players[0].rack.length, 7);
  const ids = game.players[0].rack.slice(0, 2).map((item) => item.id);
  const before = game.players[0].rack.map((item) => item.id).sort();
  const swapped = exchangeTiles(game, ids, () => 0.4);
  assert.equal(swapped.ok, true);
  assert.equal(game.bag.length, 86);
  assert.equal(game.players[0].rack.length, 7);
  assert.equal(game.turn, 1);
  assert.notDeepEqual(game.players[0].rack.map((item) => item.id).sort(), before);
  game.bag.length = 6;
  game.turn = 0;
  assert.equal(exchangeTiles(game, [game.players[0].rack[0].id]).reason, "bag");
});

test("an unknown word can be allowed and then stays playable", () => {
  const game = createGame({ names: ["Mom", "Nell"], mode: "hotseat", rng: () => 0.2 });
  game.players[0].rack = [tile(1, "Z"), tile(2, "E"), tile(3, "N")];
  const denied = playMove(game, [
    place(1, "Z", 7, 6),
    place(2, "E", 7, 7),
    place(3, "N", 7, 8),
  ], dictOf(["AT"]));
  assert.equal(denied.ok, false);
  const allowed = playMove(game, [
    place(1, "Z", 7, 6),
    place(2, "E", 7, 7),
    place(3, "N", 7, 8),
  ], dictOf(["AT"]), { allowUnknown: true });
  assert.equal(allowed.ok, true);
  assert.equal(game.extraSet.has("ZEN"), true);
  assert.equal(game.players[0].score > 0, true);
});
