import { analyze, shuffle } from "./engine.js";
import { createGame, exchangeTiles, passTurn, playMove } from "./game.js";
import { createUI } from "./ui.js";

const SAVE_KEY = "hearth-game-v1";
const SETTINGS_KEY = "hearth-settings-v1";

const ui = {
  screen: "home",
  loadPct: 0,
  loadError: false,
  dictReady: false,
  workerReady: false,
  wordCount: 0,
  name: "Mom",
  name2: "",
  difficulty: "gentle",
  zoom: false,
  pending: [],
  selectedId: null,
  exchanging: false,
  marked: new Set(),
  sheet: null,
  blank: null,
  suggestion: null,
  thinking: false,
  thinkStarted: 0,
  status: "",
  statusSticky: true,
  shake: false,
  between: false,
  preview: null,
  previewText: "",
  keyboard: false,
  cursor: { row: 7, col: 7 },
  saved: null,
};

let dict = new Set();
let game = null;
let worker = null;
let latestRequest = 0;
let requestKind = "";
let queuedBot = null;

const root = document.querySelector("#app");
const update = createUI(root, {
  "start-nell": () => start("bot"),
  "start-hot": () => start("hotseat"),
  continue: continueGame,
  diff: (value) => {
    ui.difficulty = value;
    saveSettings();
    render();
  },
  help: () => {
    ui.sheet = "help";
    render();
  },
  close: () => {
    ui.sheet = null;
    render();
  },
  rename: (value) => {
    ui.name = value;
    saveSettings();
  },
  rename2: (value) => {
    ui.name2 = value;
    saveSettings();
  },
  play: () => commitPlay(false),
  anyway: () => commitPlay(true),
  recall: (id) => {
    ui.suggestion = null;
    ui.pending = typeof id === "number" ? ui.pending.filter((place) => place.tileId !== id) : [];
    ui.selectedId = null;
    refreshPreview();
    render();
    save();
  },
  shuffle: () => {
    if (!myTurn()) return;
    shuffle(visiblePlayer().rack);
    render();
  },
  swap: () => {
    if (!myTurn()) return;
    ui.exchanging = !ui.exchanging;
    ui.marked = new Set();
    ui.pending = [];
    ui.suggestion = null;
    ui.selectedId = null;
    refreshPreview();
    render();
  },
  pass: () => {
    if (!myTurn()) return;
    ui.sheet = "pass";
    render();
  },
  "confirm-pass": () => {
    const name = game.players[game.turn].name;
    ui.pending = [];
    ui.sheet = null;
    ui.exchanging = false;
    const result = passTurn(game);
    setStatus(`${name} passes.`);
    afterHuman(result.end);
  },
  "ask-swap": () => {
    if (!ui.marked.size) return;
    ui.sheet = "swap";
    render();
  },
  "confirm-swap": () => {
    ui.sheet = null;
    const result = exchangeTiles(game, [...ui.marked]);
    ui.exchanging = false;
    ui.marked = new Set();
    if (!result.ok) {
      setStatus("Not enough tiles left in the bag to swap.", false);
      render();
      return;
    }
    setStatus("Tiles swapped.");
    afterHuman(result.end);
  },
  suggest: requestSuggestion,
  accept: acceptSuggestion,
  dismiss: () => {
    ui.suggestion = null;
    render();
  },
  zoom: () => {
    ui.zoom = !ui.zoom;
    saveSettings();
    render();
  },
  leave: () => {
    if (game && game.phase === "play") ui.sheet = "leave";
    else ui.screen = "home";
    refreshSaved();
    render();
  },
  "confirm-leave": () => {
    ui.sheet = null;
    ui.screen = "home";
    ui.between = false;
    refreshSaved();
    render();
  },
  ready: () => {
    ui.between = false;
    setStatus(`${game.players[game.turn].name}'s turn.`);
    render();
  },
  moves: () => {
    ui.sheet = "moves";
    render();
  },
  blank: chooseBlank,
  "cancel-blank": () => {
    ui.blank = null;
    ui.sheet = null;
    render();
  },
  again: () => {
    if (game) {
      ui.name = game.players[0].name;
      if (game.mode === "hotseat") ui.name2 = game.players[1].name;
      ui.difficulty = game.difficulty || ui.difficulty;
    }
    start(game.mode);
  },
  home: () => {
    ui.screen = "home";
    refreshSaved();
    render();
  },
  place,
  tapRack,
  tapSquare,
});

function setStatus(text, sticky = true) {
  ui.status = text;
  ui.statusSticky = sticky;
}

function render() {
  ui.myTurn = myTurn();
  ui.workerReady = ui.workerReady;
  ui.game = game;
  update(ui);
}

function dictView() {
  return { has: (word) => dict.has(word) || (game && game.extraSet.has(word)) };
}

function myTurn() {
  return !!game && game.phase === "play" && !ui.thinking && !ui.between && (game.mode === "bot" ? game.turn === 0 : true);
}

function visiblePlayer() {
  if (!game) return null;
  return game.mode === "bot" ? game.players[0] : game.players[game.turn];
}

function refreshPreview() {
  if (!game || ui.pending.length === 0 || !ui.dictReady) {
    ui.preview = null;
    ui.previewText = "";
  } else {
    ui.preview = analyze(game.board, ui.pending, dictView());
    ui.previewText = explain(ui.preview);
  }
  const playable = ui.preview && (ui.preview.ok || ui.preview.reason === "unknown");
  if (!ui.statusSticky && playable) setStatus(`${game.players[game.turn].name}'s turn.`);
}

function explain(analysis) {
  if (!analysis) return "That play is not allowed.";
  if (analysis.reason === "unknown") {
    const words = analysis.unknown || [];
    if (words.length === 1) return `I don't have ${words[0]} in the word list.`;
    if (words.length > 1) return `I don't have ${words.slice(0, -1).join(", ")} or ${words.at(-1)} in the word list.`;
  }
  const messages = {
    empty: "Place at least one tile.",
    line: "Tiles have to sit in one straight line, across or down.",
    gap: "Leave no empty squares inside the word.",
    center: "The first word has to cover the star in the middle.",
    connect: "Connect your word to a tile already on the board.",
    occupied: "That square already has a tile.",
    short: "A word needs at least two letters.",
    blank: "Choose a letter for the blank tile.",
    overlap: "Each square can take one tile.",
    bounds: "That square is off the board.",
    rack: "Those tiles are not on your rack.",
    letter: "That tile doesn't match.",
  };
  return messages[analysis.reason] || "That play is not allowed.";
}

function place(tileId, row, col) {
  if (!myTurn() || ui.exchanging) return;
  ui.suggestion = null;
  if (game.board[row][col]) return;
  if (ui.pending.some((place) => place.row === row && place.col === col && place.tileId !== tileId)) return;
  const tile = visiblePlayer().rack.find((item) => item.id === tileId);
  if (!tile) return;
  ui.pending = ui.pending.filter((place) => place.tileId !== tileId);
  ui.selectedId = null;
  if (tile.blank) {
    ui.blank = { tileId, row, col };
    ui.sheet = "blank";
  } else {
    ui.pending.push({
      tileId,
      row,
      col,
      letter: tile.letter,
      blank: false,
      points: tile.points,
    });
    ui.cursor = { row, col };
  }
  refreshPreview();
  render();
  save();
}

function chooseBlank(letter) {
  if (!ui.blank || !/^[A-Z]$/.test(letter)) return;
  ui.pending.push({
    tileId: ui.blank.tileId,
    row: ui.blank.row,
    col: ui.blank.col,
    letter,
    blank: true,
    points: 0,
  });
  ui.blank = null;
  ui.sheet = null;
  refreshPreview();
  render();
  save();
}

function tapRack(tileId) {
  if (!myTurn()) return;
  if (ui.exchanging) {
    if (ui.marked.has(tileId)) ui.marked.delete(tileId);
    else ui.marked.add(tileId);
    ui.marked = new Set(ui.marked);
    render();
    return;
  }
  ui.selectedId = ui.selectedId === tileId ? null : tileId;
  render();
}

function tapSquare(row, col) {
  if (!myTurn() || ui.exchanging) return;
  const pending = ui.pending.find((place) => place.row === row && place.col === col);
  if (pending) {
    ui.pending = ui.pending.filter((place) => place.tileId !== pending.tileId);
    refreshPreview();
    render();
    return;
  }
  if (game.board[row][col]) return;
  ui.cursor = { row, col };
  ui.keyboard = false;
  if (ui.selectedId != null) place(ui.selectedId, row, col);
  else render();
}

function commitPlay(allowUnknown) {
  if (!myTurn()) return;
  if (!ui.dictReady) return;
  if (ui.pending.length === 0) {
    setStatus("Place at least one tile.", false);
    render();
    return;
  }
  const name = game.players[game.turn].name;
  const result = playMove(game, ui.pending, dict, { allowUnknown });
  if (!result.ok) {
    ui.shake = true;
    setStatus(explain(result.analysis || { reason: result.reason }), false);
    refreshPreview();
    render();
    return;
  }
  const words = result.analysis.words.map((word) => word.word).join(", ");
  ui.pending = [];
  ui.suggestion = null;
  ui.preview = null;
  setStatus(`${name} played ${words} for ${result.analysis.total}.`);
  afterHuman(result.end);
}

function afterHuman(end) {
  ui.selectedId = null;
  ui.exchanging = false;
  ui.marked = new Set();
  save();
  if (end || game.phase === "over") {
    ui.screen = "over";
    ui.between = false;
    ui.thinking = false;
    render();
    return;
  }
  if (game.mode === "hotseat") {
    ui.between = true;
    ui.sheet = null;
    render();
    return;
  }
  askBot();
}

function askBot() {
  const bot = game.players[game.turn];
  if (!bot || !bot.isBot) return;
  ui.thinking = true;
  ui.thinkStarted = performance.now();
  setStatus("Nell is looking at her tiles…");
  const payload = {
    board: game.board,
    rack: bot.rack,
    bagCount: game.bag.length,
    difficulty: game.difficulty === "fair" ? "fair" : "gentle",
    extraWords: [...game.extraSet],
  };
  render();
  if (!ui.workerReady) queuedBot = payload;
  else postMove("bot", payload);
}

function requestSuggestion() {
  if (!myTurn() || !ui.workerReady) return;
  ui.pending = [];
  ui.suggestion = null;
  setStatus("Looking for a move…");
  refreshPreview();
  render();
  postMove("suggest", {
    board: game.board,
    rack: visiblePlayer().rack,
    bagCount: game.bag.length,
    difficulty: "best",
    extraWords: [...game.extraSet],
  });
}

function postMove(kind, payload) {
  latestRequest += 1;
  requestKind = kind;
  worker.postMessage({ type: "move", id: latestRequest, ...payload });
}

function applyBot(action) {
  if (!game || game.phase !== "play" || !game.players[game.turn].isBot) return;
  ui.thinking = false;
  if (action.action === "play") {
    const result = playMove(game, action.placements, dict);
    if (!result.ok) {
      passTurn(game);
      setStatus("Nell passes.");
    } else {
      const words = result.analysis.words.map((word) => word.word).join(", ");
      setStatus(`Nell played ${words} for ${result.analysis.total}.`);
    }
  } else if (action.action === "exchange") {
    const result = exchangeTiles(game, action.tileIds);
    if (!result.ok) {
      passTurn(game);
      setStatus("Nell passes.");
    } else setStatus(`Nell swaps ${action.tileIds.length} tile${action.tileIds.length === 1 ? "" : "s"}.`);
  } else {
    passTurn(game);
    setStatus("Nell passes.");
  }
  save();
  if (game.phase === "over") ui.screen = "over";
  render();
}

function acceptSuggestion() {
  if (!ui.suggestion || ui.suggestion.action !== "play" || !myTurn()) return;
  ui.pending = ui.suggestion.placements.map((place) => ({ ...place }));
  ui.suggestion = null;
  refreshPreview();
  commitPlay(false);
}

function start(mode) {
  const names = mode === "bot" ? [ui.name, "Nell"] : [ui.name, ui.name2];
  game = createGame({
    names,
    mode,
    difficulty: ui.difficulty,
    rng: rngFromQuery(),
  });
  ui.pending = [];
  ui.selectedId = null;
  ui.exchanging = false;
  ui.marked = new Set();
  ui.sheet = null;
  ui.suggestion = null;
  ui.thinking = false;
  ui.between = false;
  ui.preview = null;
  ui.screen = "game";
  setStatus(`${game.players[0].name}'s turn. The first word covers the star.`);
  saveSettings();
  save();
  render();
}

function restoreGame(loaded) {
  game = loaded.game;
  ui.pending = loaded.pending || [];
  ui.selectedId = null;
  ui.sheet = null;
  ui.suggestion = null;
  ui.thinking = false;
  ui.exchanging = false;
  ui.marked = new Set();
  ui.between = !!loaded.between;
  ui.screen = game.phase === "over" ? "over" : "game";
  refreshPreview();
  if (game.phase === "play" && !ui.between && game.players[game.turn].isBot) askBot();
  else {
    setStatus(loaded.status || (game.phase === "play" ? `${game.players[game.turn].name}'s turn.` : ""));
    render();
  }
}

function continueGame() {
  const loaded = loadGame();
  if (!loaded) return;
  restoreGame(loaded);
}

function save() {
  if (!game) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1,
      mode: game.mode,
      difficulty: game.difficulty,
      players: game.players,
      turn: game.turn,
      board: game.board,
      bag: game.bag,
      consecutiveScoreless: game.consecutiveScoreless,
      history: game.history.slice(-80),
      recent: game.recent,
      extraWords: [...game.extraSet],
      phase: game.phase,
      end: game.end,
      pending: ui.pending,
      between: ui.between,
      status: ui.status,
    }));
  } catch {
    // Private mode can refuse storage. The game still plays.
  }
  refreshSaved();
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.players) return null;
    data.extraSet = new Set(data.extraWords || []);
    return {
      game: data,
      pending: data.pending || [],
      between: !!data.between,
      status: typeof data.status === "string" ? data.status : "",
    };
  } catch {
    return null;
  }
}

function refreshSaved() {
  const loaded = loadGame();
  if (!loaded) {
    ui.saved = null;
    return;
  }
  const [first, second] = loaded.game.players;
  ui.saved = {
    text: loaded.game.phase === "over"
      ? `Last game · ${first.name} ${first.score}, ${second.name} ${second.score}`
      : `Continue · ${first.name} ${first.score}, ${second.name} ${second.score}`,
  };
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      name: ui.name,
      name2: ui.name2,
      difficulty: ui.difficulty,
      zoom: ui.zoom,
    }));
  } catch {
    // Ignore storage failures.
  }
}

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (!data) return;
    if (typeof data.name === "string") ui.name = data.name;
    if (typeof data.name2 === "string") ui.name2 = data.name2;
    if (data.difficulty === "fair" || data.difficulty === "gentle") ui.difficulty = data.difficulty;
    if (typeof data.zoom === "boolean") ui.zoom = data.zoom;
  } catch {
    // Ignore a broken settings value.
  }
}

function rngFromQuery() {
  const seed = Number(new URLSearchParams(location.search).get("seed"));
  if (!Number.isFinite(seed)) return Math.random;
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadWords() {
  const response = await fetch(new URL("../words/words.txt", import.meta.url));
  if (!response.ok) throw new Error(String(response.status));
  if (!response.body) return response.text();
  const length = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (length) {
      const pct = Math.min(99, Math.round((received / length) * 100));
      if (pct !== ui.loadPct) {
        ui.loadPct = pct;
        if (ui.screen === "home") render();
      }
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

function bootWorker(text) {
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (event) => {
    const message = event.data;
    if (message.type === "ready") {
      ui.workerReady = true;
      if (queuedBot) {
        postMove("bot", queuedBot);
        queuedBot = null;
      } else if (ui.screen === "home" || ui.screen === "game") render();
      return;
    }
    if (message.type === "error") {
      if (ui.thinking && game) {
        passTurn(game);
        ui.thinking = false;
        setStatus("Nell passes.");
        save();
        if (game.phase === "over") ui.screen = "over";
        render();
      }
      return;
    }
    if (message.type !== "action" || message.id !== latestRequest) return;
    if (requestKind === "suggest") {
      ui.suggestion = message.action && message.action.action === "play" ? message.action : null;
      setStatus(ui.suggestion
        ? `One idea: ${ui.suggestion.words.map((word) => word.word).join(", ")} for ${ui.suggestion.score}.`
        : "No word from these tiles. You can pass or swap.");
      render();
      return;
    }
    const wait = Math.max(0, 700 - (performance.now() - ui.thinkStarted));
    setTimeout(() => applyBot(message.action), wait);
  };
  worker.postMessage({ type: "init", text });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    ui.sheet = null;
    ui.blank = null;
    ui.suggestion = null;
    if (ui.pending.length) ui.pending = [];
    ui.exchanging = false;
    refreshPreview();
    render();
    save();
    return;
  }
  if (ui.screen !== "game" || ui.sheet || ui.between || !myTurn()) return;
  if (event.target.closest && event.target.closest("input, textarea")) return;
  if (event.key === "Enter") {
    event.preventDefault();
    if (ui.selectedId != null) place(ui.selectedId, ui.cursor.row, ui.cursor.col);
    else commitPlay(false);
    return;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    ui.pending.pop();
    refreshPreview();
    render();
    return;
  }
  const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
  if (step) {
    event.preventDefault();
    ui.keyboard = true;
    ui.cursor = {
      row: Math.max(0, Math.min(14, ui.cursor.row + step[0])),
      col: Math.max(0, Math.min(14, ui.cursor.col + step[1])),
    };
    render();
    return;
  }
  if (/^[a-zA-Z]$/.test(event.key)) {
    const letter = event.key.toUpperCase();
    const pending = new Set(ui.pending.map((place) => place.tileId));
    const choices = visiblePlayer().rack.filter((tile) => !pending.has(tile.id) && !tile.blank && tile.letter === letter);
    if (!choices.length) return;
    const index = choices.findIndex((tile) => tile.id === ui.selectedId);
    ui.selectedId = choices[(index + 1) % choices.length].id;
    render();
  }
});

if (location.hostname.endsWith("github.io") && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
}

function persistOnHide() {
  if (document.visibilityState === "hidden") save();
}

document.addEventListener("visibilitychange", persistOnHide);
window.addEventListener("pagehide", () => save());

loadSettings();
const saved = loadGame();
if (saved && saved.game.phase === "play") restoreGame(saved);
else {
  refreshSaved();
  render();
}

loadWords().then((text) => {
  const words = text.trim().split(/\n+/);
  dict = new Set(words);
  ui.wordCount = words.length;
  ui.dictReady = true;
  ui.loadPct = 100;
  refreshPreview();
  bootWorker(text);
  render();
}).catch(() => {
  ui.loadError = true;
  render();
});
