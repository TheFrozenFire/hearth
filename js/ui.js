import { premiumAt } from "./engine.js";

const PREMIUM_LABEL = { tw: "TW", dw: "DW", tl: "TL", dl: "DL", star: "" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function tileHTML(tile, className) {
  const letter = tile.letter ? esc(tile.letter) : "";
  const points = !tile.blank && tile.letter ? `<span class="pts">${tile.points}</span>` : "";
  const label = tile.blank ? (tile.letter ? `blank ${tile.letter}` : "blank") : `${tile.letter}, ${tile.points}`;
  return `<button type="button" class="tile ${tile.blank ? "blank" : ""} ${className || ""}" data-id="${tile.id}" data-letter="${esc(tile.letter || "")}" aria-label="${esc(label)}"><span class="letter">${letter}</span>${points}</button>`;
}

function lockedHTML(tile) {
  const letter = esc(tile.letter || "");
  const points = tile.blank ? "" : `<span class="pts">${tile.points}</span>`;
  return `<div class="tile locked ${tile.blank ? "blank" : ""}" aria-hidden="true"><span class="letter">${letter}</span>${points}</div>`;
}

function rulesHTML() {
  return `<h2>How to play</h2>
    <p>Make a word across or down. The tiles in one turn sit in a straight line, with no gaps.</p>
    <p>The first word covers the star. Every later word has to connect to a tile already on the board.</p>
    <p>Light blue doubles one letter. Dark blue triples one letter. Pink doubles the whole word. Red triples the whole word. The star doubles the word. A bonus counts only on the turn you cover it.</p>
    <p>Use all 7 tiles and you score 50 extra. A blank is any letter and scores nothing.</p>
    <p>Swap tiles only when at least 7 are left in the bag. The game ends when someone plays their last tile, or after six turns in a row with no points.</p>
    <p>Tap a tile, then tap a square. Tap a tile you just placed to pick it up. If you know a real word the list rejects, play it anyway. It counts for the rest of this game.</p>
    <p>No ads and no account. The game stays on this phone.</p>
    <button type="button" class="btn secondary" data-act="close">Close</button>`;
}

function historyHTML(history) {
  if (!history.length) return `<p class="note">Words you play will show up here.</p>`;
  const items = history.slice().reverse().map((entry) => `<li>${esc(historyLine(entry))}</li>`).join("");
  return `<ol class="log-list">${items}</ol>`;
}

export function historyLine(entry) {
  if (entry.action === "pass") return `${entry.name} passes`;
  if (entry.action === "exchange") return `${entry.name} swaps ${entry.count} tile${entry.count === 1 ? "" : "s"}`;
  const words = (entry.words || []).map((word) => word.word).join(", ");
  const bonus = entry.bingo ? " +50" : "";
  return `${entry.name} · ${words} · ${entry.score}${bonus}`;
}

function sheetHTML(state) {
  if (state.sheet === "help") return `<div class="sheet">${rulesHTML()}</div>`;
  if (state.sheet === "moves") {
    return `<div class="sheet"><h2>Moves</h2>${historyHTML(state.game.history)}<button type="button" class="btn secondary" data-act="close">Close</button></div>`;
  }
  if (state.sheet === "blank") {
    const keys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) =>
      `<button type="button" data-act="blank" data-letter="${letter}">${letter}</button>`,
    ).join("");
    return `<div class="sheet"><h2>Blank tile</h2><p>Choose a letter. It scores nothing.</p><div class="letters">${keys}</div><button type="button" class="btn ghost" data-act="cancel-blank">Put it back</button></div>`;
  }
  if (state.sheet === "pass") {
    return `<div class="sheet"><h2>Pass this turn?</h2><p>Pass when you can't make a word. Six turns in a row with no points ends the game.</p><div class="stack"><button type="button" class="btn primary" data-act="confirm-pass">Pass</button><button type="button" class="btn ghost" data-act="close">Keep playing</button></div></div>`;
  }
  if (state.sheet === "swap") {
    const count = state.marked.size;
    return `<div class="sheet"><h2>Swap ${count} tile${count === 1 ? "" : "s"}?</h2><p>They go back in the bag, and you draw the same number. This uses your turn.</p><div class="stack"><button type="button" class="btn primary" data-act="confirm-swap">Swap them</button><button type="button" class="btn ghost" data-act="close">Keep them</button></div></div>`;
  }
  if (state.sheet === "leave") {
    return `<div class="sheet"><h2>Leave this game?</h2><p>You can continue it later from the start screen. It stays on this phone.</p><div class="stack"><button type="button" class="btn primary" data-act="confirm-leave">Leave</button><button type="button" class="btn ghost" data-act="close">Keep playing</button></div></div>`;
  }
  return "";
}

function homeHTML(state) {
  return `<main class="home">
    <div class="brand">
      <div class="brand-tile" aria-hidden="true">H<span>4</span></div>
      <h1>Hearth</h1>
      <p class="tagline">A word game for the kitchen table.</p>
    </div>
    <div id="continue-card"></div>
    <label class="field">Your name
      <input id="player-name" maxlength="16" autocomplete="off" enterkeyhint="done" value="${esc(state.name)}">
    </label>
    <section class="card">
      <h2>Play with Nell</h2>
      <p>Nell plays on this phone. No account, and no waiting.</p>
      <div class="seg" role="radiogroup" aria-label="How hard Nell plays">
        <button type="button" data-act="diff" data-diff="gentle">Easy</button>
        <button type="button" data-act="diff" data-diff="fair">Fair</button>
      </div>
      <p class="note" id="diff-note"></p>
      <button type="button" class="btn primary" data-act="start-nell">Start</button>
    </section>
    <section class="card">
      <h2>Two players</h2>
      <p>Pass the phone back and forth. The other rack stays hidden.</p>
      <label class="field">Second player
        <input id="player-two" maxlength="16" autocomplete="off" placeholder="Player 2" value="${esc(state.name2)}">
      </label>
      <button type="button" class="btn secondary" data-act="start-hot">Start</button>
    </section>
    <p class="fine" id="load-note"></p>
    <button type="button" class="btn ghost" data-act="help">How to play</button>
  </main>
  <div id="sheet-root" class="sheet-root"></div>`;
}

function gameHTML() {
  return `<div class="table">
    <div class="play-col">
      <div class="game" id="game-screen">
        <header>
          <div class="top">
            <div class="score" id="score-0"></div>
            <div class="tools">
              <div class="bag" id="bag"></div>
              <div class="icon-row">
                <button type="button" class="icon-btn" data-act="zoom" id="zoom-btn">Bigger</button>
                <button type="button" class="icon-btn" data-act="help">Help</button>
                <button type="button" class="icon-btn" data-act="leave">Leave</button>
              </div>
            </div>
            <div class="score right" id="score-1"></div>
          </div>
          <p class="status" id="status" aria-live="polite"></p>
        </header>
        <div class="board-area" id="board-scroll">
          <div class="frame" id="frame"><div class="board" id="board" role="grid" aria-label="Board"></div></div>
        </div>
        <div class="dock">
          <div class="preview" id="preview"></div>
          <div class="tray" id="tray" role="group" aria-label="Your tiles"></div>
          <div class="actions" id="actions"></div>
        </div>
      </div>
    </div>
    <aside class="log-dock">
      <h2>Moves</h2>
      <div id="log-dock"></div>
    </aside>
  </div>
  <div id="sheet-root" class="sheet-root"></div>`;
}

function overHTML() {
  return `<main class="over">
    <h1 id="over-title"></h1>
    <div class="final" id="over-scores"></div>
    <p id="over-detail"></p>
    <p class="left-tiles" id="over-tiles"></p>
    <div class="stack">
      <button type="button" class="btn primary" data-act="again">Play again</button>
      <button type="button" class="btn ghost" data-act="home">Home</button>
    </div>
  </main>`;
}

function paintHome(root, state) {
  const cont = root.querySelector("#continue-card");
  cont.innerHTML = state.saved
    ? `<button type="button" class="btn secondary" data-act="continue">${esc(state.saved.text)}</button>`
    : "";
  const name = root.querySelector("#player-name");
  if (name && document.activeElement !== name && name.value !== state.name) name.value = state.name;
  const name2 = root.querySelector("#player-two");
  if (name2 && document.activeElement !== name2 && name2.value !== state.name2) name2.value = state.name2;
  for (const button of root.querySelectorAll("[data-act='diff']")) {
    button.setAttribute("aria-checked", String(button.dataset.diff === state.difficulty));
  }
  const note = root.querySelector("#diff-note");
  note.textContent = state.difficulty === "fair"
    ? "Fair: Nell looks harder for a better word."
    : "Easy: Nell plays a steady, beatable game.";
  for (const button of root.querySelectorAll("[data-act='start-nell'], [data-act='start-hot'], [data-act='continue']")) {
    button.disabled = !state.dictReady;
  }
  const load = root.querySelector("#load-note");
  if (state.loadError) load.textContent = "The word list didn't load. Check the connection and reload the page.";
  else if (!state.dictReady) load.textContent = state.loadPct ? `Getting the word list ready… ${state.loadPct}%` : "Getting the word list ready…";
  else load.textContent = `${state.wordCount.toLocaleString()} words. No ads. Saved on this phone.`;
  paintSheet(root, state);
}

function rackTiles(state) {
  if (!state.game || state.between) return [];
  const owner = state.game.mode === "bot" ? state.game.players[0] : state.game.players[state.game.turn];
  const pending = new Set(state.pending.map((place) => place.tileId));
  return owner.rack.filter((tile) => !pending.has(tile.id));
}

function paintBoard(root, state) {
  const board = state.game.board;
  const pending = new Map(state.pending.map((place) => [`${place.row}-${place.col}`, place]));
  const ghosts = new Map();
  if (state.suggestion && state.suggestion.action === "play") {
    for (const place of state.suggestion.placements) ghosts.set(`${place.row}-${place.col}`, place);
  }
  const recent = new Set((state.game.recent || []).map((spot) => `${spot.row}-${spot.col}`));
  let html = "";
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const key = `${row}-${col}`;
      const premium = premiumAt(row, col);
      const classes = ["sq"];
      if (premium) classes.push(premium);
      if (recent.has(key)) classes.push("recent");
      if (state.keyboard && state.cursor && state.cursor.row === row && state.cursor.col === col) classes.push("cursor");
      let inner = "";
      const cell = board[row][col];
      if (cell) inner = lockedHTML(cell);
      else if (pending.has(key)) {
        const place = pending.get(key);
        inner = tileHTML({
          id: place.tileId,
          letter: place.letter,
          points: place.points,
          blank: place.blank,
        }, "provisional");
      } else if (ghosts.has(key)) {
        const place = ghosts.get(key);
        inner = `<div class="tile ghost ${place.blank ? "blank" : ""}" aria-hidden="true"><span class="letter">${esc(place.letter)}</span></div>`;
      } else if (premium === "star") inner = `<span class="star-mark" aria-hidden="true">★</span>`;
      else if (premium) inner = `<span class="sq-label">${PREMIUM_LABEL[premium]}</span>`;
      const bonus = premium ? ` ${PREMIUM_LABEL[premium] || "center star"}` : "";
      html += `<div class="${classes.join(" ")}" data-sq="${key}" role="gridcell" aria-label="Row ${row + 1}, column ${col + 1}${bonus}">${inner}</div>`;
    }
  }
  root.querySelector("#board").innerHTML = html;
}

function paintGame(root, state) {
  const game = state.game;
  const screen = root.querySelector("#game-screen");
  screen.classList.toggle("zoomed", state.zoom);
  root.querySelector("#zoom-btn").textContent = state.zoom ? "Fit" : "Bigger";
  game.players.forEach((player, index) => {
    const card = root.querySelector(`#score-${index}`);
    const active = game.phase === "play" && game.turn === index;
    card.className = `score${index === 1 ? " right" : ""}${active ? " active" : ""}${active && state.thinking ? " thinking" : ""}`;
    card.innerHTML = `<span class="who">${esc(player.name)}</span><div class="pts">${player.score}</div>`;
  });
  root.querySelector("#bag").textContent = `${game.bag.length} left`;
  root.querySelector("#status").textContent = state.status || "";
  const frame = root.querySelector("#frame");
  if (state.shake) {
    frame.classList.remove("shake");
    void frame.offsetWidth;
    frame.classList.add("shake");
    state.shake = false;
  }
  const scroll = root.querySelector("#board-scroll");
  const left = scroll.scrollLeft;
  const top = scroll.scrollTop;
  paintBoard(root, state);
  scroll.scrollLeft = left;
  scroll.scrollTop = top;

  const hinted = new Set(
    state.suggestion && state.suggestion.action === "play"
      ? state.suggestion.placements.map((place) => place.tileId)
      : [],
  );
  const tiles = rackTiles(state).map((tile) => {
    const classes = [];
    if (tile.id === state.selectedId) classes.push("selected");
    if (state.marked.has(tile.id)) classes.push("marked");
    if (hinted.has(tile.id)) classes.push("hinted");
    return tileHTML(tile, classes.join(" "));
  }).join("");
  root.querySelector("#tray").innerHTML = tiles || `<span class="fine" style="color:#f6e7d4"> </span>`;

  const preview = root.querySelector("#preview");
  preview.className = "preview";
  if (state.exchanging) {
    const count = state.marked.size;
    preview.classList.add("good");
    preview.textContent = game.bag.length < 7
      ? "Not enough tiles left in the bag to swap."
      : count ? `${count} selected to swap.` : "Tap the tiles you want to swap.";
  } else if (!state.pending.length) {
    preview.textContent = state.suggestion && state.suggestion.action === "play"
      ? `Suggestion · ${state.suggestion.words.map((word) => `${word.word} ${word.score}`).join(" · ")} · ${state.suggestion.score}`
      : "";
    if (state.suggestion) preview.classList.add("good");
  } else if (state.preview && (state.preview.ok || state.preview.reason === "unknown")) {
    const parts = state.preview.words.map((word) => `${word.word} ${word.score}`);
    if (state.preview.bingo) parts.push("bonus 50");
    preview.textContent = `${parts.join(" · ")} · ${state.preview.total} points`;
    preview.classList.add(state.preview.ok ? "good" : "bad");
  } else if (state.preview) {
    preview.textContent = state.previewText;
    preview.classList.add("bad");
  }

  const playLabel = state.pending.length && state.preview && state.preview.ok
    ? `Play · ${state.preview.total}`
    : "Play word";
  const mine = state.myTurn;
  const canScore = mine && state.dictReady;
  root.querySelector("#actions").innerHTML = `
    <button type="button" class="btn primary play" data-act="play" ${canScore ? "" : "disabled"}>${esc(playLabel)}</button>
    ${state.preview && state.preview.reason === "unknown" ? `<button type="button" class="btn secondary wide" data-act="anyway" ${canScore ? "" : "disabled"}>Play it anyway</button>` : ""}
    <button type="button" class="btn ghost" data-act="recall" ${mine && state.pending.length ? "" : "disabled"}>Recall</button>
    <button type="button" class="btn ghost" data-act="shuffle" ${mine ? "" : "disabled"}>Shuffle</button>
    <button type="button" class="btn ghost" data-act="swap" ${mine ? "" : "disabled"}>${state.exchanging ? "Cancel" : "Swap"}</button>
    <button type="button" class="btn ghost" data-act="pass" ${mine ? "" : "disabled"}>Pass</button>
    <button type="button" class="btn ghost wide" data-act="suggest" ${mine && state.workerReady ? "" : "disabled"}>Suggest a move</button>
    <button type="button" class="btn ghost wide moves-btn" data-act="moves">Moves</button>
    ${state.suggestion ? `<button type="button" class="btn secondary wide" data-act="accept">Play this suggestion</button><button type="button" class="btn ghost wide" data-act="dismiss">Clear suggestion</button>` : ""}
    ${state.exchanging && state.marked.size && game.bag.length >= 7 ? `<button type="button" class="btn primary wide" data-act="ask-swap">Swap ${state.marked.size}</button>` : ""}
  `;
  const dock = root.querySelector("#log-dock");
  if (dock) dock.innerHTML = historyHTML(game.history);
  paintSheet(root, state);
}

function paintOver(root, state) {
  const game = state.game;
  const [first, second] = game.players;
  const winner = first.score === second.score ? null : (first.score > second.score ? first : second);
  root.querySelector("#over-title").textContent = winner ? `${winner.name} wins` : "It's a tie";
  root.querySelector("#over-scores").innerHTML = game.players.map((player) =>
    `<div class="score"><span class="who">${esc(player.name)}</span><div class="pts">${player.score}</div></div>`,
  ).join("");
  const detail = root.querySelector("#over-detail");
  if (game.end && game.end.reason === "out") {
    const loserIndex = game.players.findIndex((player) => player.name !== game.end.outName);
    const other = game.players[loserIndex];
    detail.textContent = `${game.end.outName} used the last tile. ${other.name}'s last tiles were worth ${game.end.remain[loserIndex]}, so those points moved across.`;
  } else {
    detail.textContent = "Six turns in a row scored nothing, so the game ends. Each player subtracts the tiles still on the rack.";
  }
  const tiles = game.players.map((player) => {
    const letters = player.rack.map((tile) => (tile.blank && !tile.letter ? "?" : tile.letter)).join(" ");
    return letters ? `${player.name}: ${letters}` : "";
  }).filter(Boolean);
  root.querySelector("#over-tiles").textContent = tiles.length ? `Tiles left — ${tiles.join(" · ")}` : "";
}

function paintSheet(root, state) {
  const host = root.querySelector("#sheet-root");
  if (!host) return;
  if (state.between && state.game) {
    const name = state.game.players[state.game.turn].name;
    host.innerHTML = `<div class="cover"><div class="card"><div class="brand-tile" aria-hidden="true">H<span>4</span></div><h2>Pass the phone to ${esc(name)}</h2><p>${esc(state.status || "The tiles stay hidden until you are ready.")}</p><button type="button" class="btn primary" data-act="ready">I'm ready</button></div></div>`;
    return;
  }
  if (!state.sheet) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `<div class="sheet-back">${sheetHTML(state)}</div>`;
}

const BOARD_LIMIT = 15;

function spotKey(spot) {
  return `${spot.row}-${spot.col}`;
}

// Squares a dragged tile should jump to: the opening cross, the empty
// squares beside tiles already on the board, or the next square in the
// line being built this turn.
export function snapSquares(locked, pending) {
  const blocked = new Set([...locked, ...pending].map(spotKey));
  const targets = new Set();
  const add = (row, col) => {
    if (row < 0 || col < 0 || row >= BOARD_LIMIT || col >= BOARD_LIMIT) return;
    const key = `${row}-${col}`;
    if (!blocked.has(key)) targets.add(key);
  };
  const beside = (row, col) => {
    add(row - 1, col);
    add(row + 1, col);
    add(row, col - 1);
    add(row, col + 1);
  };

  if (pending.length === 0 && locked.length === 0) {
    for (let i = 0; i < BOARD_LIMIT; i++) {
      add(7, i);
      add(i, 7);
    }
    return targets;
  }
  if (pending.length === 0) {
    for (const spot of locked) beside(spot.row, spot.col);
    return targets;
  }

  const rows = new Set(pending.map((spot) => spot.row));
  const cols = new Set(pending.map((spot) => spot.col));
  if (rows.size === 1) {
    const row = pending[0].row;
    const placed = pending.map((spot) => spot.col);
    const min = Math.min(...placed);
    const max = Math.max(...placed);
    for (let col = min - 1; col <= max + 1; col++) add(row, col);
    if (pending.length === 1) beside(row, pending[0].col);
  } else if (cols.size === 1) {
    const col = pending[0].col;
    const placed = pending.map((spot) => spot.row);
    const min = Math.min(...placed);
    const max = Math.max(...placed);
    for (let row = min - 1; row <= max + 1; row++) add(row, col);
    if (pending.length === 1) beside(pending[0].row, col);
  } else {
    for (const spot of pending) beside(spot.row, spot.col);
  }
  return targets;
}

export function createUI(root, handlers) {
  let screen = "";
  let pointer = null;

  function floater(tile) {
    let node = document.getElementById("drag-tile");
    if (!node) {
      node = document.createElement("div");
      node.id = "drag-tile";
      node.className = "tile";
      node.style.position = "fixed";
      node.style.zIndex = "40";
      node.style.pointerEvents = "none";
      node.style.width = "52px";
      node.style.height = "56px";
      node.style.fontSize = "28px";
      document.body.appendChild(node);
    }
    node.innerHTML = `<span class="letter">${esc(tile.letter || "")}</span>`;
    node.hidden = false;
    return node;
  }

  function moveFloater(node, event) {
    node.classList.remove("snapped");
    node.style.width = "52px";
    node.style.height = "56px";
    node.style.fontSize = "28px";
    node.style.left = `${event.clientX - 26}px`;
    node.style.top = `${event.clientY - 40}px`;
  }

  function seatFloater(node, snap) {
    node.classList.add("snapped");
    const rect = snap.el.getBoundingClientRect();
    node.style.width = `${Math.max(8, rect.width - 2)}px`;
    node.style.height = `${Math.max(8, rect.height - 2)}px`;
    node.style.fontSize = `${Math.max(10, rect.width * 0.5)}px`;
    node.style.left = `${rect.left + 1}px`;
    node.style.top = `${rect.top + 1}px`;
  }

  function clearSnap() {
    const marked = document.querySelector(".sq.snap");
    if (marked) marked.classList.remove("snap");
  }

  function clearFloater() {
    const node = document.getElementById("drag-tile");
    if (node) node.remove();
    clearSnap();
  }

  function boardSpots(ignoreKey) {
    const locked = [];
    const pending = [];
    for (const el of document.querySelectorAll("#board [data-sq]")) {
      if (el.dataset.sq === ignoreKey) continue;
      const [row, col] = el.dataset.sq.split("-").map(Number);
      if (el.querySelector(".tile.locked")) locked.push({ row, col });
      else if (el.querySelector(".tile.provisional")) pending.push({ row, col });
    }
    return { locked, pending };
  }

  function chooseSnap(x, y, ignoreKey) {
    const { locked, pending } = boardSpots(ignoreKey);
    const targets = snapSquares(locked, pending);
    let preferred = null;
    let under = null;
    for (const el of document.querySelectorAll("#board [data-sq]")) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      const [row, col] = el.dataset.sq.split("-").map(Number);
      const info = { row, col, el, dist, size: rect.width };
      const key = `${row}-${col}`;
      const taken = key !== ignoreKey && el.querySelector(".tile.locked, .tile.provisional");
      if (!taken && (!under || dist < under.dist)) under = info;
      if (targets.has(key) && (!preferred || dist < preferred.dist)) preferred = info;
    }
    if (preferred && preferred.dist <= preferred.size * 0.85) return preferred;
    if (under && under.dist <= under.size * 0.75) return under;
    return null;
  }

  function showSnap(snap) {
    const marked = document.querySelector(".sq.snap");
    if (marked && (!snap || marked !== snap.el)) marked.classList.remove("snap");
    if (snap) snap.el.classList.add("snap");
  }

  root.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const tile = event.target.closest && event.target.closest(".tile[data-id]");
    const square = event.target.closest && event.target.closest("[data-sq]");
    if (!tile && !square) return;
    pointer = {
      id: tile ? Number(tile.dataset.id) : null,
      letter: tile ? tile.dataset.letter : "",
      fromBoard: !!(tile && tile.closest(".sq")),
      square: square ? square.dataset.sq : null,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      snap: null,
      pointerId: event.pointerId,
    };
    if (tile && tile.setPointerCapture) tile.setPointerCapture(event.pointerId);
  });

  root.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.id == null) return;
    const node = pointer.moved ? document.getElementById("drag-tile") : null;
    if (!pointer.moved && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) {
      pointer.moved = true;
      const created = floater({ letter: pointer.letter });
      moveFloater(created, event);
    }
    const floaterNode = node || document.getElementById("drag-tile");
    if (!pointer.moved || !floaterNode) return;
    const ignore = pointer.fromBoard ? pointer.square : null;
    const snap = chooseSnap(event.clientX, event.clientY, ignore);
    const previous = pointer.snap ? `${pointer.snap.row}-${pointer.snap.col}` : "";
    pointer.snap = snap ? { row: snap.row, col: snap.col } : null;
    const next = pointer.snap ? `${pointer.snap.row}-${pointer.snap.col}` : "";
    if (next !== previous && next && navigator.vibrate) {
      try { navigator.vibrate(10); } catch { /* some browsers refuse a buzz */ }
    }
    showSnap(snap);
    if (snap) seatFloater(floaterNode, snap);
    else moveFloater(floaterNode, event);
  });

  function finishPointer(event) {
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const info = pointer;
    pointer = null;
    clearFloater();
    if (info.id != null && info.moved) {
      if (info.snap) handlers.place(info.id, info.snap.row, info.snap.col);
      else if (info.fromBoard) handlers.recall(info.id);
      return;
    }
    if (info.id != null && !info.moved) {
      if (info.fromBoard) handlers.recall(info.id);
      else handlers.tapRack(info.id);
      return;
    }
    if (info.square && !info.moved) {
      const [row, col] = info.square.split("-").map(Number);
      handlers.tapSquare(row, col);
    }
  }

  root.addEventListener("pointerup", finishPointer);
  root.addEventListener("pointercancel", (event) => {
    if (pointer && pointer.pointerId === event.pointerId) {
      pointer = null;
      clearFloater();
    }
  });

  root.addEventListener("click", (event) => {
    const button = event.target.closest && event.target.closest("[data-act]");
    if (!button || button.disabled) return;
    const action = button.dataset.act;
    if (action === "diff") handlers.diff(button.dataset.diff);
    else if (action === "blank") handlers.blank(button.dataset.letter);
    else if (handlers[action]) handlers[action]();
  });

  root.addEventListener("input", (event) => {
    if (event.target.id === "player-name") handlers.rename(event.target.value);
    if (event.target.id === "player-two") handlers.rename2(event.target.value);
  });

  return function update(state) {
    if (screen !== state.screen) {
      screen = state.screen;
      root.innerHTML = state.screen === "game" ? gameHTML() : state.screen === "over" ? overHTML() : homeHTML(state);
    }
    if (state.screen === "home") paintHome(root, state);
    else if (state.screen === "game") paintGame(root, state);
    else paintOver(root, state);
  };
}
