# jsonfold

Fold long JSON object keys into short aliases before pasting into a prompt.
Unfold them back afterwards. Lossless, reversible, and every run prints a
receipt you can verify.

## The problem

Paste a 40 KB API response into a chat and a surprising share of the tokens
are just key names repeated on every object: `stargazers_count`,
`stargazers_count`, `stargazers_count`…

- `jq -c` strips whitespace, but it can't shorten keys.
- "AI compressors" rewrite your data, and you can't check what they changed.

So you either burn tokens or you trust a black box with your payload.

## What jsonfold does

It renames long keys to `$0`, `$1`, … — ordered by bytes saved, so the most
expensive keys get the shortest aliases — and leaves everything else alone.
The output is still plain, readable JSON. A map file remembers the renaming,
and `unfold` restores the original byte-for-byte.

Every `fold` run does an internal round-trip check (`fold → unfold →
deep-equal`) before writing anything, and prints a receipt to stderr:

```
jsonfold receipt
  original:  3,760 bytes
  folded:    2,940 bytes
  saved:     820 bytes (21.8% of minified input)
  est. tokens saved: ~205 (~4 chars/token heuristic)
  keys aliased: 27 (of 29 unique, 133 occurrences)
  alias prefix: "$"
  round-trip: OK (fold→unfold→deep-equal)
```

Those are real numbers from the bundled demo (`examples/repo-list.json`,
an invented 3.8 KB repo-list payload that ships minified, so the 21.8% is
pure key-aliasing — no whitespace trickery). The receipt always measures
savings against the minified input, so folding a pretty-printed file never
credits its indentation to key-aliasing; `stats` projects from the same
baseline, so the two always agree.

## Install

No dependencies. Node ≥ 18.

```sh
git clone https://github.com/techdevfun/jsonfold.git
cd jsonfold
node bin/jsonfold.js --help
```

An npm release is planned; it isn't published yet.

## Usage in three steps

```sh
# 1. Fold. Writes folded.json + folded.json.map, prints the receipt to stderr.
node bin/jsonfold.js fold api.json -o folded.json

# 2. Paste folded.json into your prompt. Keep the .map file on your machine.

# 3. Unfold the model's output back to the original keys.
node bin/jsonfold.js unfold folded.json --map folded.json.map -o restored.json
```

Pipes work too — the receipt goes to stderr, never stdout:

```sh
cat api.json | node bin/jsonfold.js fold > folded.json
```

Not sure it's worth it? Ask first:

```sh
node bin/jsonfold.js stats api.json
```

`stats` shows byte counts, key counts, the top-10 keys by byte contribution,
an estimated token count, and the projected savings if you folded — without
writing anything.

More examples:

```sh
node bin/jsonfold.js fold api.json --pretty -o folded.json   # indented output
node bin/jsonfold.js fold api.json --receipt receipt.json    # machine-readable receipt
node bin/jsonfold.js stats api.json --json                   # stats as JSON
```

## The `$0` problem, handled

If your JSON already contains keys shaped like `$0`, `$1`, … — a naive
aliaser would create ambiguity on unfold. jsonfold detects this, switches
the alias prefix to the first safe candidate (`#`, `@`, `~`, `§`), and
records the switch in the map file. Unfolding needs no extra flags.

## Honest comparison

| Tool | What it does | What it doesn't do |
|---|---|---|
| `jq -c` | Minifies whitespace; full query language for JSON. | Can't shorten keys. No savings estimate, no receipt. |
| [jsonpack](https://npm.io/package/jsonpack) (npm, MIT) | Dictionary-encodes repeated keys *and values* into base-36 indices; output is a flat ASCII string for URLs / localStorage. Reversible with `unpack`. | Output is not readable JSON — you can't inspect or hand-edit it in a prompt. No receipt, no token estimate. Built for storage/transport, not prompts. |
| Lossy "AI compressors" / summarizers | Rewrite or drop content to save tokens. | Not reversible. You can't verify what changed. |
| **jsonfold** | Aliases keys only; output stays valid, readable JSON; reversible via a map file; every run prints a verifiable receipt and passes an internal round-trip check. | Doesn't touch values, doesn't dedupe strings, doesn't minify beyond key shortening (input is expected minified or use `--pretty` off). Token counts are a heuristic, not a tokenizer measurement. |

Prior-art note: a quick check of the npm registry and the web (2026-10-21)
found the `jsonfold` name free and no zero-dependency CLI doing reversible
key-aliasing with a printed, verifiable savings receipt. jsonpack is the
closest reversible tool, but it targets a different job (opaque transport
encoding). If you know of closer prior art, open an issue.

## What jsonfold is not

- **Not a lossy summarizer.** It never drops, reorders, or rewrites fields.
- **Doesn't touch values.** Numbers, strings, and unicode survive the
  round-trip byte-identical. Only object keys are renamed.
- **Not a general compressor.** Values aren't interned or encoded; if your
  payload's bulk is in long string values rather than repeated keys, `stats`
  will tell you folding isn't worth it.
- **Token numbers are estimates.** The ~4 chars/token figure is a rough
  heuristic, labeled everywhere it appears. It is not a measurement from
  any specific model's tokenizer.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Invalid JSON · unreadable/unwritable file · bad map file · internal round-trip check failed |
| 2 | Usage error: unknown command or option, missing option value |

## Roadmap

- Publish to npm (`npx jsonfold`).
- `--only` / `--ignore` key filters for payloads where some keys must stay readable.
- Benchmarks against jsonpack and gzip on standard corpora, published with methodology.
- A man page.

Out of scope by design: lossy modes, value interning, network calls of any
kind. This tool reads JSON and writes JSON, nothing else.

## License

MIT © 2026 techdevfun. See [LICENSE](LICENSE).
