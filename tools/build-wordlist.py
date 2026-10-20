#!/usr/bin/env python3
"""Rebuild words/words.txt from the public-domain ENABLE list plus words/supplement.txt.

Download ENABLE (public domain) first, for example:

  curl -fsSL -o /tmp/enable1.txt \\
    https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
  python3 tools/build-wordlist.py /tmp/enable1.txt
"""

import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
BLOCK = {
    line.strip()
    for line in (ROOT / "tools" / "block.sha256").read_text().splitlines()
    if line.strip() and not line.startswith("#")
}
WORD = re.compile(r"^[a-z]{2,15}$")


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: build-wordlist.py path/to/enable1.txt")
    enable = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    supplement = (ROOT / "words" / "supplement.txt").read_text(encoding="utf-8")
    words = set()
    for raw in enable.splitlines() + supplement.splitlines():
        word = raw.strip().lower()
        if WORD.fullmatch(word):
            words.add(word.upper())
    before = len(words)
    words = {w for w in words if hashlib.sha256(w.lower().encode()).hexdigest() not in BLOCK}
    out = "\n".join(sorted(words)) + "\n"
    dest = ROOT / "words" / "words.txt"
    dest.write_text(out, encoding="utf-8")
    print(f"wrote {dest} ({len(words)} words, removed {before - len(words)} blocked)")


if __name__ == "__main__":
    main()
