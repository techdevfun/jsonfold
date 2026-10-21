#!/bin/sh
# Demo: fold the example API response and print the receipt.
# Output is deterministic — CI diffs it against expected-output.txt.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM
node "$ROOT/bin/jsonfold.js" fold \
  "$ROOT/examples/repo-list.json" \
  -o "$TMP/folded.json" \
  --map "$TMP/fold.map.json" 2>&1
