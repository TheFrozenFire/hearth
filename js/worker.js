import { chooseAction } from "./bot.js";
import { buildTrie, emptySide, sideInsert } from "./dict.js";

let words = null;
let trie = null;

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      words = new Set(message.text.trim().split(/\n+/));
      trie = buildTrie(words);
      self.postMessage({ type: "ready", count: words.size });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error && error.message || error) });
    }
    return;
  }
  if (message.type !== "move" || !trie) return;
  const extra = new Set(message.extraWords || []);
  const side = emptySide();
  for (const word of extra) sideInsert(side, word);
  const dict = { has: (word) => words.has(word) || extra.has(word) };
  const action = chooseAction({
    board: message.board,
    rack: message.rack,
    bagCount: message.bagCount,
    trie,
    side,
    dict,
    difficulty: message.difficulty,
    rng: Math.random,
  });
  self.postMessage({ type: "action", id: message.id, action });
};
