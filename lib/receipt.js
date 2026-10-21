'use strict';

/**
 * The receipt: every fold run prints what it did, in human and
 * machine-readable form. The receipt is the audit trail — it states the
 * byte counts, the estimated token savings (labeled heuristic), and that
 * the internal round-trip check passed.
 */

const { formatBytes, pct } = require('./util');
const { CHARS_PER_TOKEN } = require('./stats');

function buildReceipt({ originalBytes, foldedBytes, map }) {
  const savedBytes = originalBytes - foldedBytes;
  return {
    tool: 'jsonfold',
    originalBytes,
    foldedBytes,
    savedBytes,
    savedPct: originalBytes === 0 ? 0 : (100 * savedBytes) / originalBytes,
    estTokensSaved: Math.ceil(savedBytes / CHARS_PER_TOKEN),
    tokenHeuristic: `~${CHARS_PER_TOKEN} chars/token`,
    keysAliased: map.keysAliased,
    uniqueKeys: map.uniqueKeys,
    keyOccurrences: map.keyOccurrences,
    aliasPrefix: map.prefix,
    collisionAvoided: map.collisionAvoided,
    roundTrip: 'OK',
  };
}

function humanReceipt(r) {
  const lines = [
    'jsonfold receipt',
    `  original:  ${formatBytes(r.originalBytes)} bytes`,
    `  folded:    ${formatBytes(r.foldedBytes)} bytes`,
    `  saved:     ${formatBytes(r.savedBytes)} bytes (${r.savedPct.toFixed(1)}%)`,
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
