'use strict';

/**
 * The receipt: every fold run prints what it did, in human and
 * machine-readable form. The receipt is the audit trail — it states the
 * byte counts, the estimated token savings (labeled heuristic), and that
 * the internal round-trip check passed.
 */

const { formatBytes, pct } = require('./util');
const { CHARS_PER_TOKEN } = require('./stats');

function buildReceipt({ originalBytes, minifiedBytes, foldedBytes, writtenBytes, map }) {
  // Savings are measured against the MINIFIED input, never the raw bytes:
  // pretty-printed whitespace is not folding's doing, so crediting it
  // would inflate the receipt. `stats` projects from the same baseline.
  // foldedBytes must likewise be the MINIFIED folded size, so a
  // --pretty run reports the same savings as a minified one; when the
  // bytes actually written differ (pretty output), they are reported
  // separately as writtenBytes instead of being charged to the savings.
  const baseline = minifiedBytes === undefined ? originalBytes : minifiedBytes;
  const savedBytes = Math.max(0, baseline - foldedBytes);
  const receipt = {
    tool: 'jsonfold',
    originalBytes,
    minifiedBytes: baseline,
    foldedBytes,
    savedBytes,
    savedPct: baseline === 0 ? 0 : (100 * savedBytes) / baseline,
    estTokensSaved: Math.ceil(savedBytes / CHARS_PER_TOKEN),
    tokenHeuristic: `~${CHARS_PER_TOKEN} chars/token`,
    keysAliased: map.keysAliased,
    uniqueKeys: map.uniqueKeys,
    keyOccurrences: map.keyOccurrences,
    aliasPrefix: map.prefix,
    collisionAvoided: map.collisionAvoided,
    roundTrip: 'OK',
  };
  if (writtenBytes !== undefined && writtenBytes !== foldedBytes) {
    receipt.writtenBytes = writtenBytes;
  }
  return receipt;
}

function humanReceipt(r) {
  const originalLine =
    r.originalBytes === r.minifiedBytes
      ? `  original:  ${formatBytes(r.originalBytes)} bytes`
      : `  original:  ${formatBytes(r.originalBytes)} bytes` +
        ` (${formatBytes(r.minifiedBytes)} minified)`;
  const lines = [
    'jsonfold receipt',
    originalLine,
    `  folded:    ${formatBytes(r.foldedBytes)} bytes`,
    ...(r.writtenBytes !== undefined
      ? [`  written:   ${formatBytes(r.writtenBytes)} bytes (pretty-printed output)`]
      : []),
    `  saved:     ${formatBytes(r.savedBytes)} bytes (${r.savedPct.toFixed(1)}% of minified input)`,
    `  est. tokens saved: ~${formatBytes(r.estTokensSaved)} (${r.tokenHeuristic} heuristic)`,
    `  keys aliased: ${r.keysAliased} (of ${r.uniqueKeys} unique, ${formatBytes(r.keyOccurrences)} occurrences)`,
    `  alias prefix: "${r.aliasPrefix}"${r.collisionAvoided ? ' (collision with existing keys avoided)' : ''}`,
    `  round-trip: ${r.roundTrip} (fold→unfold→deep-equal)`,
  ];
  return lines.join('\n') + '\n';
}

function machineReceipt(r) {
  return JSON.stringify(r, null, 2) + '\n';
}

module.exports = { buildReceipt, humanReceipt, machineReceipt };
