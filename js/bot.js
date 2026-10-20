import { childId } from "./dict.js";
import { analyze, isBoardEmpty, scorePlacements } from "./engine.js";

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SIZE = 15;

function anchorSet(board) {
  const anchors = new Set();
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (board[row][col]) continue;
      if (
        (row > 0 && board[row - 1][col]) ||
        (row < 14 && board[row + 1][col]) ||
        (col > 0 && board[row][col - 1]) ||
        (col < 14 && board[row][col + 1])
      ) {
        anchors.add(row * SIZE + col);
      }
    }
  }
  return anchors;
}

function earlierTwin(rack, used, index) {
  const tile = rack[index];
  for (let previous = 0; previous < index; previous++) {
    if (used[previous]) continue;
    if (tile.blank && rack[previous].blank) return true;
    if (!tile.blank && !rack[previous].blank && rack[previous].letter === tile.letter) return true;
  }
  return false;
}

function remember(found, move, rng) {
  if (!found.best || move.score > found.best.score) found.best = move;
  if (found.top.length < 8 || move.score > found.top[found.top.length - 1].score) {
    found.top.push(move);
    found.top.sort((a, b) => b.score - a.score);
    if (found.top.length > 8) found.top.pop();
  }
  if (move.score >= 8 && move.score <= 22) {
    found.seenMedium += 1;
    if (found.medium.length < 60) found.medium.push(move);
    else {
      const slot = Math.floor(rng() * found.seenMedium);
      if (slot < 60) found.medium[slot] = move;
    }
  }
}

export function generateMoves(board, rack, trie, dict, opts = {}) {
  const side = opts.side || null;
  const rng = opts.rng || Math.random;
  const deadline = performance.now() + (opts.budgetMs ?? 2500);
  const first = isBoardEmpty(board);
  const anchors = first ? null : anchorSet(board);
  const masks = new Int32Array(450);
  masks.fill(-2);
  const seen = new Set();
  const found = { best: null, top: [], medium: [], seenMedium: 0 };
  let steps = 0;
  let stop = false;

  function crossMask(row, col, dir) {
    const key = (dir === "h" ? 0 : 225) + row * SIZE + col;
    const cached = masks[key];
    if (cached !== -2) return cached === -1 ? null : cached;
    const dRow = dir === "h" ? 1 : 0;
    const dCol = dir === "h" ? 0 : 1;
    const prefix = [];
    let readRow = row - dRow;
    let readCol = col - dCol;
    while (readRow >= 0 && readRow < SIZE && readCol >= 0 && readCol < SIZE && board[readRow][readCol]) {
      prefix.push(board[readRow][readCol].letter);
      readRow -= dRow;
      readCol -= dCol;
    }
    prefix.reverse();
    const suffix = [];
    readRow = row + dRow;
    readCol = col + dCol;
    while (readRow >= 0 && readRow < SIZE && readCol >= 0 && readCol < SIZE && board[readRow][readCol]) {
      suffix.push(board[readRow][readCol].letter);
      readRow += dRow;
      readCol += dCol;
    }
    if (prefix.length === 0 && suffix.length === 0) {
      masks[key] = -1;
      return null;
    }
    const head = prefix.join("");
    const tail = suffix.join("");
    let mask = 0;
    for (let i = 0; i < 26; i++) {
      if (dict.has(head + ABC[i] + tail)) mask |= 1 << i;
    }
    masks[key] = mask;
    return mask;
  }

  function keep(placed) {
    if (stop) return;
    if ((++steps & 1023) === 0 && performance.now() > deadline) {
      stop = true;
      return;
    }
    if (first) {
      if (!placed.some((place) => place.row === 7 && place.col === 7)) return;
    } else if (!placed.some((place) => anchors.has(place.row * SIZE + place.col))) {
      return;
    }
    const key = placed
      .map((place) => `${place.row}.${place.col}.${place.letter}.${place.blank ? 1 : 0}`)
      .sort()
      .join("|");
    if (seen.has(key)) return;
    seen.add(key);
    const total = scorePlacements(board, placed);
    if (total < 0) return;
    const worthTop = found.top.length < 8 || total > found.top[found.top.length - 1].score;
    const worthBest = !found.best || total > found.best.score;
    const worthMedium = total >= 8 && total <= 22;
    if (!worthTop && !worthBest && !worthMedium) return;
    const copy = placed.map((place) => ({
      row: place.row,
      col: place.col,
      letter: place.letter,
      blank: !!place.blank,
      points: place.blank ? 0 : place.points,
      tileId: place.tileId,
    }));
    const analysis = analyze(board, copy, dict);
    if (!analysis.ok) return;
    remember(found, {
      score: analysis.total,
      bingo: analysis.bingo,
      words: analysis.words,
      placements: copy,
    }, rng);
  }

  function searchLine(dir, line) {
    const used = new Uint8Array(rack.length);
    const pos = (index) => (dir === "h" ? [line, index] : [index, line]);
    const isEmpty = (index) => {
      const [row, col] = pos(index);
      return !board[row][col];
    };

    function walk(index, node, extra, placed) {
      if (stop) return;
      const boundary = index === SIZE || isEmpty(index);
      const ended = (node >= 0 && trie.end[node] === 1) || (extra && extra.e);
      if (ended && placed.length && boundary) keep(placed);
      if (index === SIZE) return;
      if (isEmpty(index)) {
        if (placed.length >= rack.length) return;
        const [row, col] = pos(index);
        const mask = crossMask(row, col, dir);
        for (let tileIndex = 0; tileIndex < rack.length; tileIndex++) {
          if (used[tileIndex] || earlierTwin(rack, used, tileIndex)) continue;
          const tile = rack[tileIndex];
          const letters = tile.blank ? ABC : tile.letter;
          for (let letterIndex = 0; letterIndex < letters.length; letterIndex++) {
            const letter = letters[letterIndex];
            const code = letter.charCodeAt(0);
            if (mask !== null && ((mask >> (code - 65)) & 1) === 0) continue;
            const child = node >= 0 ? childId(trie, node, code) : -1;
            const extraChild = extra && extra.k[letter] ? extra.k[letter] : null;
            if (child < 0 && !extraChild) continue;
            used[tileIndex] = 1;
            placed.push({
              row,
              col,
              letter,
              blank: !!tile.blank,
              points: tile.blank ? 0 : tile.points,
              tileId: tile.id,
            });
            walk(index + 1, child, extraChild, placed);
            placed.pop();
            used[tileIndex] = 0;
          }
        }
      } else {
        const [row, col] = pos(index);
        const letter = board[row][col].letter;
        const child = node >= 0 ? childId(trie, node, letter.charCodeAt(0)) : -1;
        const extraChild = extra && extra.k[letter] ? extra.k[letter] : null;
        if (child < 0 && !extraChild) return;
        walk(index + 1, child, extraChild, placed);
      }
    }

    for (let start = 0; start < SIZE; start++) {
      if (stop) return;
      if (start > 0 && !isEmpty(start - 1)) continue;
      walk(start, 0, side, []);
    }
  }

  for (const dir of ["h", "v"]) {
    for (let line = 0; line < SIZE; line++) {
      if (stop) break;
      searchLine(dir, line);
    }
  }
  return found;
}

function pick(list, rng) {
  if (list.length === 1) return list[0];
  const index = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[index];
}

function weighted(list, rng) {
  let total = 0;
  const weights = list.map((move) => {
    const weight = move.score * move.score + 1;
    total += weight;
    return weight;
  });
  let cursor = rng() * total;
  for (let i = 0; i < list.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return list[i];
  }
  return list[0];
}

function dumpIds(rack) {
  const letters = rack.filter((tile) => !tile.blank);
  if (letters.length === 0) return [];
  const vowels = letters.filter((tile) => "AEIOU".includes(tile.letter));
  if (vowels.length === 0) return letters.map((tile) => tile.id);
  if (vowels.length === letters.length) return letters.slice(1).map((tile) => tile.id);
  const strandedQ = letters.some((tile) => tile.letter === "Q") && !letters.some((tile) => tile.letter === "U");
  if (strandedQ) {
    return letters.filter((tile) => tile.letter === "Q" || !"AEIOU".includes(tile.letter)).map((tile) => tile.id);
  }
  const consonants = letters
    .filter((tile) => !"AEIOU".includes(tile.letter))
    .sort((a, b) => b.points - a.points);
  return consonants.slice(0, Math.max(1, consonants.length - 1)).map((tile) => tile.id);
}

function asPlay(move) {
  return {
    action: "play",
    placements: move.placements,
    words: move.words,
    score: move.score,
    bingo: move.bingo,
  };
}

export function chooseAction({ board, rack, bagCount, trie, dict, side = null, difficulty = "gentle", rng = Math.random, budgetMs }) {
  const found = generateMoves(board, rack, trie, dict, { side, rng, budgetMs });
  if (found.best) {
    if (difficulty === "best") return asPlay(found.best);
    if (difficulty === "fair") return asPlay(weighted(found.top.length ? found.top : [found.best], rng));
    if (rng() < 0.22 && found.best.score >= 8) return asPlay(pick(found.top, rng));
    if (found.medium.length) return asPlay(pick(found.medium, rng));
    return asPlay(found.best);
  }
  if (bagCount >= 7) {
    const tileIds = dumpIds(rack);
    if (tileIds.length) return { action: "exchange", tileIds };
  }
  return { action: "pass" };
}
