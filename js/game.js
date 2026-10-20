import {
  analyze,
  commitBoard,
  createBag,
  drawTiles,
  emptyBoard,
  rackValue,
  shuffle,
} from "./engine.js";

export function createGame({ names, mode, difficulty = "gentle", rng = Math.random }) {
  const bag = shuffle(createBag(), rng);
  const players = names.map((name, index) => ({
    name: (name || "").trim() || (index === 0 ? "You" : "Player 2"),
    score: 0,
    rack: drawTiles(bag, 7),
    isBot: mode === "bot" && index === 1,
  }));
  if (mode === "bot") players[1].name = "Nell";
  return {
    mode,
    difficulty,
    players,
    board: emptyBoard(),
    bag,
    turn: 0,
    consecutiveScoreless: 0,
    history: [],
    recent: [],
    extraSet: new Set(),
    phase: "play",
    end: null,
  };
}

function dictionaryOf(game, dict) {
  return { has: (word) => dict.has(word) || game.extraSet.has(word) };
}

function finish(game, reason) {
  const remain = game.players.map((player) => rackValue(player.rack));
  if (reason === "out") {
    const winner = game.turn;
    for (let index = 0; index < game.players.length; index++) {
      if (index === winner) continue;
      game.players[winner].score += remain[index];
      game.players[index].score -= remain[index];
    }
  } else {
    for (let index = 0; index < game.players.length; index++) {
      game.players[index].score -= remain[index];
    }
  }
  game.phase = "over";
  game.end = {
    reason,
    remain,
    outName: reason === "out" ? game.players[game.turn].name : null,
  };
  return game.end;
}

function markScoreless(game) {
  game.consecutiveScoreless += 1;
  if (game.consecutiveScoreless >= 6) return finish(game, "stalemate");
  game.turn = (game.turn + 1) % game.players.length;
  return null;
}

export function playMove(game, placements, dict, opts = {}) {
  if (game.phase !== "play") return { ok: false, reason: "over" };
  const player = game.players[game.turn];
  const rackById = new Map(player.rack.map((tile) => [tile.id, tile]));
  for (const place of placements) {
    const tile = rackById.get(place.tileId);
    if (!tile) return { ok: false, reason: "rack" };
    if (tile.blank) {
      if (!place.blank || !/^[A-Z]$/.test(place.letter || "")) {
        return { ok: false, reason: "blank" };
      }
    } else if (tile.letter !== place.letter || place.blank) {
      return { ok: false, reason: "letter" };
    }
  }

  let analysis = analyze(game.board, placements, dictionaryOf(game, dict));
  if (!analysis.ok && opts.allowUnknown && analysis.reason === "unknown") {
    for (const word of analysis.unknown) game.extraSet.add(word);
    analysis = { ...analysis, ok: true, reason: null };
  }
  if (!analysis.ok) return { ok: false, analysis };

  const used = new Set(placements.map((place) => place.tileId));
  game.board = commitBoard(game.board, placements);
  player.rack = player.rack.filter((tile) => !used.has(tile.id));
  player.score += analysis.total;
  const emptied = player.rack.length === 0;
  player.rack.push(...drawTiles(game.bag, 7 - player.rack.length));
  game.recent = placements.map((place) => ({ row: place.row, col: place.col }));
  game.history.push({
    name: player.name,
    action: "play",
    score: analysis.total,
    words: analysis.words,
    bingo: analysis.bingo,
  });
  if (analysis.total === 0) game.consecutiveScoreless += 1;
  else game.consecutiveScoreless = 0;

  let end = null;
  if (emptied && player.rack.length === 0) end = finish(game, "out");
  else if (game.consecutiveScoreless >= 6) end = finish(game, "stalemate");
  else game.turn = (game.turn + 1) % game.players.length;
  return { ok: true, analysis, end };
}

export function passTurn(game) {
  if (game.phase !== "play") return { ok: false, reason: "over" };
  game.history.push({
    name: game.players[game.turn].name,
    action: "pass",
    score: 0,
    words: [],
    bingo: false,
  });
  return { ok: true, end: markScoreless(game) };
}

export function exchangeTiles(game, tileIds, rng = Math.random) {
  if (game.phase !== "play") return { ok: false, reason: "over" };
  if (game.bag.length < 7) return { ok: false, reason: "bag" };
  const player = game.players[game.turn];
  const want = new Set(tileIds);
  if (want.size === 0) return { ok: false, reason: "empty" };
  const giving = player.rack.filter((tile) => want.has(tile.id));
  if (giving.length !== want.size) return { ok: false, reason: "rack" };
  const drawn = drawTiles(game.bag, giving.length);
  player.rack = player.rack.filter((tile) => !want.has(tile.id)).concat(drawn);
  for (const tile of giving) {
    if (tile.blank) tile.letter = "";
    game.bag.push(tile);
  }
  shuffle(game.bag, rng);
  game.history.push({
    name: player.name,
    action: "exchange",
    count: giving.length,
    score: 0,
    words: [],
    bingo: false,
  });
  return { ok: true, end: markScoreless(game) };
}
