// Compact trie: one typed array of edges, safe to keep on a phone.

export function parseWordList(text) {
  return text.trim().split(/\n+/);
}

export function buildTrie(words) {
  const sorted = Array.from(new Set(words)).sort();
  const chars = [];
  const next = [];
  const head = [];
  const num = [];
  const end = [];

  function addNode() {
    const id = head.length;
    head.push(0);
    num.push(0);
    end.push(0);
    return id;
  }

  function fill(node, depth, lo, hi) {
    let index = lo;
    if (index < hi && sorted[index].length === depth) {
      end[node] = 1;
      index += 1;
    }
    const groups = [];
    while (index < hi) {
      const code = sorted[index].charCodeAt(depth);
      let endIndex = index + 1;
      while (endIndex < hi && sorted[endIndex].charCodeAt(depth) === code) endIndex += 1;
      groups.push([code, index, endIndex]);
      index = endIndex;
    }
    const edge = chars.length;
    for (const [code] of groups) {
      chars.push(code);
      next.push(0);
    }
    head[node] = edge;
    num[node] = groups.length;
    for (let group = 0; group < groups.length; group++) {
      const child = addNode();
      next[edge + group] = child;
      fill(child, depth + 1, groups[group][1], groups[group][2]);
    }
  }

  const root = addNode();
  if (sorted.length) fill(root, 0, 0, sorted.length);
  return {
    chars: Uint8Array.from(chars),
    next: Uint32Array.from(next),
    head: Uint32Array.from(head),
    num: Uint8Array.from(num),
    end: Uint8Array.from(end),
  };
}

export function childId(trie, node, code) {
  let lo = trie.head[node];
  let hi = lo + trie.num[node] - 1;
  const chars = trie.chars;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const found = chars[mid];
    if (found === code) return trie.next[mid];
    if (found < code) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function trieHas(trie, word) {
  let node = 0;
  for (let i = 0; i < word.length; i++) {
    node = childId(trie, node, word.charCodeAt(i));
    if (node < 0) return false;
  }
  return trie.end[node] === 1;
}

export function emptySide() {
  return { e: false, k: Object.create(null) };
}

export function sideInsert(root, word) {
  let node = root;
  for (let i = 0; i < word.length; i++) {
    const letter = word[i];
    let child = node.k[letter];
    if (!child) node.k[letter] = child = { e: false, k: Object.create(null) };
    node = child;
  }
  node.e = true;
}
