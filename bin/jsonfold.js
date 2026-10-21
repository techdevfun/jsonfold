#!/usr/bin/env node
'use strict';

/**
 * jsonfold CLI — fold long JSON object keys into short aliases ($0, $1, …)
 * to save prompt tokens, and unfold them back. Lossless and reversible.
 *
 * Exit codes:
 *   0  success
 *   1  runtime error: invalid JSON, unreadable/unwritable file, bad map,
 *      or the internal round-trip check failed
 *   2  usage error: unknown command or flag, missing option value
 */

const fs = require('fs');
const path = require('path');

const { fold } = require('../lib/fold');
const { unfoldValue, mapFromObject } = require('../lib/unfold');
const { statsFor, CHARS_PER_TOKEN } = require('../lib/stats');
const { buildReceipt, humanReceipt, machineReceipt } = require('../lib/receipt');
const { formatBytes } = require('../lib/util');

const VERSION = require('../package.json').version;

const USAGE = `usage:
  jsonfold fold [INPUT] [-o FOLDED] [--map MAPFILE] [--pretty] [--receipt RECEIPT.json]
  jsonfold unfold [FOLDED] --map MAPFILE [-o RESTORED] [--pretty]
  jsonfold stats [INPUT] [--json]
  jsonfold --help | --version

  INPUT/FOLDED default to stdin ("-"); output defaults to stdout.
  The receipt is always printed to stderr, never to stdout, so piping works.
  Default MAPFILE for fold: <output>.map when -o is given, else ./fold.map.json
`;

function failRuntime(msg) {
  process.stderr.write(`jsonfold: error: ${msg}\n`);
  process.exit(1);
}

function failUsage(msg) {
  process.stderr.write(`jsonfold: ${msg}\n${USAGE}`);
  process.exit(2);
}

function printHelp() {
  process.stdout.write(
    `jsonfold v${VERSION} — fold JSON object keys into short aliases, reversibly.\n\n` +
    USAGE +
    `\ncommands:
  fold     rewrite object keys to short aliases; writes a map file and a
           receipt. Runs an internal fold→unfold→deep-equal check first.
  unfold   restore original keys using the map file written by fold.
  stats    show byte/key/token stats and projected savings (does not fold).

options:
  -o, --output FILE   write output to FILE instead of stdout
  --map FILE          map file to write (fold) or read (unfold)
  --pretty            indent output JSON with 2 spaces (default: minified)
  --receipt FILE      also write the fold receipt as machine-readable JSON
  --json              stats: print machine-readable JSON instead of text

exit codes: 0 ok · 1 invalid JSON / IO error / bad map / round-trip mismatch
            2 usage error
`
  );
}

function readInput(source) {
  try {
    if (source === '-' || source === undefined) {
      return { text: fs.readFileSync(0, 'utf8'), bytes: null, label: 'stdin' };
    }
    const text = fs.readFileSync(source, 'utf8');
    return { text, bytes: Buffer.byteLength(text, 'utf8'), label: source };
  } catch (err) {
    failRuntime(`cannot read ${source === '-' || source === undefined ? 'stdin' : source}: ${err.message}`);
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    failRuntime(`invalid JSON in ${label}: ${err.message}`);
  }
}

function writeOutput(text, outPath) {
  try {
    if (outPath) {
      fs.writeFileSync(outPath, text, 'utf8');
    } else {
      process.stdout.write(text);
    }
  } catch (err) {
    failRuntime(`cannot write ${outPath || 'stdout'}: ${err.message}`);
  }
}

// ---- argument parsing (by hand; zero dependencies) ----

function parseArgs(raw) {
  if (raw.length === 0 || raw[0] === '-h' || raw[0] === '--help') {
    printHelp();
    process.exit(0);
  }
  if (raw[0] === '-V' || raw[0] === '--version') {
    process.stdout.write(`jsonfold ${VERSION}\n`);
    process.exit(0);
  }

  const command = raw[0];
  if (!['fold', 'unfold', 'stats'].includes(command)) {
    failUsage(`unknown command '${command}'.`);
  }

  const opts = {
    command,
    positional: [],
    output: null,
    map: null,
    pretty: false,
    receipt: null,
    json: false,
  };

  const valueFlags = new Set(['-o', '--output', '--map', '--receipt']);
  const boolFlags = new Set(['--pretty', '--json']);

  for (let i = 1; i < raw.length; i++) {
    const arg = raw[i];
    if (valueFlags.has(arg)) {
      const value = raw[i + 1];
      if (value === undefined || value.startsWith('-')) {
        failUsage(`option '${arg}' needs a value.`);
      }
      i++;
      if (arg === '-o' || arg === '--output') opts.output = value;
      else if (arg === '--map') opts.map = value;
      else if (arg === '--receipt') opts.receipt = value;
    } else if (boolFlags.has(arg)) {
      if (arg === '--pretty') opts.pretty = true;
      else if (arg === '--json') opts.json = true;
    } else if (arg.startsWith('-')) {
      failUsage(`unknown option '${arg}'.`);
    } else {
      opts.positional.push(arg);
    }
  }

  if (opts.positional.length > 1) {
    failUsage(`too many positional arguments: ${opts.positional.join(' ')}.`);
  }
  return opts;
}

function stringify(value, pretty) {
  return pretty ? JSON.stringify(value, null, 2) + '\n' : JSON.stringify(value);
}

// ---- commands ----

function cmdFold(opts) {
  const input = readInput(opts.positional[0]);
  const parsed = parseJson(input.text, input.label);

  let result;
  try {
    result = fold(parsed);
  } catch (err) {
    failRuntime(err.message);
  }
  const { folded, map } = result;

  const outText = stringify(folded, opts.pretty);
  const originalBytes = Buffer.byteLength(input.text, 'utf8');
  const foldedBytes = Buffer.byteLength(outText, 'utf8');

  writeOutput(outText, opts.output);

  const mapPath = opts.map || (opts.output ? opts.output + '.map' : './fold.map.json');
  try {
    fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf8');
  } catch (err) {
    failRuntime(`cannot write map file ${mapPath}: ${err.message}`);
  }

  const receipt = buildReceipt({ originalBytes, foldedBytes, map });
  process.stderr.write(humanReceipt(receipt));

  if (opts.receipt) {
    try {
      fs.writeFileSync(opts.receipt, machineReceipt(receipt), 'utf8');
    } catch (err) {
      failRuntime(`cannot write receipt file ${opts.receipt}: ${err.message}`);
    }
  }
}

function cmdUnfold(opts) {
  const input = readInput(opts.positional[0]);
  const parsed = parseJson(input.text, input.label);

  const mapPath = opts.map || './fold.map.json';
  let mapObj;
  try {
    mapObj = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch (err) {
    failRuntime(`cannot read map file ${mapPath}: ${err.message}`);
  }

  let aliasToKey;
  try {
    aliasToKey = mapFromObject(mapObj);
  } catch (err) {
    failRuntime(err.message);
  }

  const unfolded = unfoldValue(parsed, aliasToKey);
  writeOutput(stringify(unfolded, opts.pretty), opts.output);
  process.stderr.write(
    `jsonfold: unfolded ${formatBytes(aliasToKey.size)} aliased keys using ${mapPath}\n`
  );
}

function cmdStats(opts) {
  const input = readInput(opts.positional[0]);
  const parsed = parseJson(input.text, input.label);
  const inputBytes = input.bytes === null
    ? Buffer.byteLength(input.text, 'utf8')
    : input.bytes;

  let s;
  try {
    s = statsFor(parsed, inputBytes);
  } catch (err) {
    failRuntime(err.message);
  }

  if (opts.json) {
    writeOutput(JSON.stringify(s, null, 2) + '\n', opts.output);
    return;
  }

  const lines = [
    `input: ${formatBytes(s.inputBytes)} bytes (${formatBytes(s.minifiedBytes)} minified)`,
    `object keys: ${formatBytes(s.keyOccurrences)} occurrences, ${s.uniqueKeys} unique`,
    'top keys by byte contribution:',
  ];
  for (const t of s.topKeys) {
    lines.push(
      `  ${t.key}  ${t.count} × ${t.keyBytes} B = ${formatBytes(t.bytes)} B`
    );
  }
  lines.push(`est. tokens: ~${formatBytes(s.estTokens)} (${s.heuristic} heuristic)`);
  lines.push(
    `if folded: ${formatBytes(s.projected.foldedBytes)} bytes — ` +
    `saves ${formatBytes(s.projected.savedBytes)} bytes ` +
    `(${s.projected.savedPct.toFixed(1)}% of minified), ` +
    `~${formatBytes(s.projected.estTokensSaved)} tokens`
  );
  lines.push(`(${s.projected.note})`);
  writeOutput(lines.join('\n') + '\n', opts.output);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.command === 'fold') cmdFold(opts);
  else if (opts.command === 'unfold') cmdUnfold(opts);
  else if (opts.command === 'stats') cmdStats(opts);
}

main();
