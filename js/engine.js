// Kitchen-table word game rules: a 15×15 board, 100 tiles, and the usual bonuses.

export const BOARD_SIZE = 15;

const PREMIUM_ROWS = [
  "T..d...T...d..T",
  ".D...t...t...D.",
  "..D...d.d...D..",
  "d..D...d...D..d",
  "....D.....D....",
  ".t...t...t...t.",
  "..d...d.d...d..",
  "T..d...*...d..T",
  "..d...d.d...d..",
  ".t...t...t...t.",
  "....D.....D....",
  "d..D...d...D..d",
  "..D...d.d...D..",
  ".D...t...t...D.",
  "T..d...T...d..T",
];

const PREMIUM_NAME = { T: "tw", D: "dw", t: "tl", d: "dl", "*": "star" };

export const POINTS = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

const COUNTS = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
};

const over = new Array(BOARD_SIZE * BOARD_SIZE);

export function premiumAt(row, col) {
  return PREMIUM_NAME[PREMIUM_ROWS[row][col]] || null;
}

export function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

export function isBoardEmpty(board) {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col]) return false;
    }
  }
  return true;
}

export function createBag() {
  const tiles = [];
  let id = 1;
  for (const [letter, count] of Object.entries(COUNTS)) {
    for (let i = 0; i < count; i++) {
      tiles.push({ id: id++, letter, points: POINTS[letter], blank: false });
    }
  }
  tiles.push({ id: id++, letter: "", points: 0, blank: true });
  tiles.push({ id: id++, letter: "", points: 0, blank: true });
  return tiles;
}

export function shuffle(items, rng = Math.random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
  return items;
}

export function drawTiles(bag, count) {
  const drawn = [];
  for (let i = 0; i < count && bag.length; i++) drawn.push(bag.pop());
  return drawn;
}

export function rackValue(rack) {
  let total = 0;
  for (const tile of rack) {
    if (!tile.blank) total += POINTS[tile.letter] || 0;
  }
  return total;
}

export function commitBoard(board, placements) {
  const next = board.map((row) => row.slice());
  for (const place of placements) {
    next[place.row][place.col] = {
      letter: place.letter,
      points: place.blank ? 0 : POINTS[place.letter] || 0,
      blank: !!place.blank,
      id: place.tileId,
    };
  }
  return next;
}

function fail(reason) {
  return { ok: false, reason, unknown: [], words: [], total: 0, bingo: false };
}

function cellAt(board, row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
  return over[row * BOARD_SIZE + col] || board[row][col] || null;
}

function readWord(board, row, col, dRow, dCol, wantWords) {
  if (!cellAt(board, row, col)) return null;
  let startRow = row;
  let startCol = col;
  while (cellAt(board, startRow - dRow, startCol - dCol)) {
    startRow -= dRow;
    startCol -= dCol;
  }
  let sum = 0;
  let multiplier = 1;
  let length = 0;
  let letters = "";
  let touches = false;
  let covers = false;
  let hasNew = false;
  let readRow = startRow;
  let readCol = startCol;
  while (true) {
    const tile = cellAt(board, readRow, readCol);
    if (!tile) break;
    length += 1;
    const isNew = over[readRow * BOARD_SIZE + readCol] != null;
    if (isNew) hasNew = true;
    else touches = true;
    if (readRow === 7 && readCol === 7) covers = true;
    let points = tile.blank ? 0 : POINTS[tile.letter] || 0;
    if (isNew) {
      const premium = premiumAt(readRow, readCol);
      if (premium === "dl") points *= 2;
      else if (premium === "tl") points *= 3;
      else if (premium === "dw" || premium === "star") multiplier *= 2;
      else if (premium === "tw") multiplier *= 3;
    }
    sum += points;
    if (wantWords) letters += tile.letter;
    readRow += dRow;
    readCol += dCol;
  }
  if (length < 2 || !hasNew) return null;
  return {
    word: letters,
    score: sum * multiplier,
    dir: dRow === 0 ? "h" : "v",
    touches,
    covers,
  };
}

// `wantWords` asks for the spellings. The move search scores without them.
export function evaluate(board, placements, dict, wantWords) {
  if (!placements || placements.length === 0) return fail("empty");
  const seen = new Set();
  for (const place of placements) {
    if (
      !Number.isInteger(place.row) ||
      !Number.isInteger(place.col) ||
      place.row < 0 || place.row >= BOARD_SIZE ||
      place.col < 0 || place.col >= BOARD_SIZE
    ) {
      return fail("bounds");
    }
    if (!/^[A-Z]$/.test(place.letter || "")) return fail("blank");
    const key = place.row * BOARD_SIZE + place.col;
    if (seen.has(key)) return fail("overlap");
    seen.add(key);
    if (board[place.row][place.col]) return fail("occupied");
  }

  const sameRow = placements.every((place) => place.row === placements[0].row);
  const sameCol = placements.every((place) => place.col === placements[0].col);
  if (!sameRow && !sameCol) return fail("line");

  for (const place of placements) over[place.row * BOARD_SIZE + place.col] = place;
  try {
    if (placements.length > 1) {
      const across = sameRow;
      const fixed = across ? placements[0].row : placements[0].col;
      const indexes = placements.map((place) => (across ? place.col : place.row)).sort((a, b) => a - b);
      for (let index = indexes[0]; index <= indexes[indexes.length - 1]; index++) {
        const row = across ? fixed : index;
        const col = across ? index : fixed;
        if (!cellAt(board, row, col)) return fail("gap");
      }
    }

    const first = isBoardEmpty(board);
    const words = [];
    let touches = false;
    let covers = false;
    const consider = (row, col, dRow, dCol) => {
      const word = readWord(board, row, col, dRow, dCol, wantWords);
      if (!word) return;
      words.push(word);
      if (word.touches) touches = true;
      if (word.covers) covers = true;
    };

    if (placements.length === 1 || sameRow) consider(placements[0].row, placements[0].col, 0, 1);
    if (placements.length === 1 || sameCol) consider(placements[0].row, placements[0].col, 1, 0);
    if (placements.length > 1) {
      const dRow = sameRow ? 1 : 0;
      const dCol = sameRow ? 0 : 1;
      for (const place of placements) consider(place.row, place.col, dRow, dCol);
    }

    if (words.length === 0) return fail("short");
    if (first && !covers) return fail("center");
    if (!first && !touches) return fail("connect");

    const unknown = [];
    if (wantWords && dict) {
      for (const word of words) {
        if (!dict.has(word.word)) unknown.push(word.word);
      }
    }

    let total = 0;
    for (const word of words) total += word.score;
    const bingo = placements.length === 7;
    if (bingo) total += 50;
    const listed = wantWords
      ? words.map((word) => ({ word: word.word, score: word.score, dir: word.dir }))
      : [];

    if (unknown.length) {
      return { ok: false, reason: "unknown", unknown, words: listed, total, bingo };
    }
    return { ok: true, reason: null, unknown: [], words: listed, total, bingo };
  } finally {
    for (const place of placements) over[place.row * BOARD_SIZE + place.col] = undefined;
  }
}

export function analyze(board, placements, dict) {
  return evaluate(board, placements, dict, true);
}

export function scorePlacements(board, placements) {
  const result = evaluate(board, placements, null, false);
  return result.ok ? result.total : -1;
}
