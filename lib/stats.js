'use strict';

/**
 * stats: describe a document and project what folding would save.
 *
 * Token estimates are a rough heuristic (≈4 characters per token).
 * They are labeled as such everywhere they appear — they are not a
 * measurement of any specific model's tokenizer.
 */

const { fold, countKeys } = require('./fold');

const CHARS_PER_TOKEN = 4;

function estimateTokens(bytes) {
  return Math.ceil(bytes / CHARS_PER_TOKEN);
}

/**
 * @param {any} parsed the parsed JSON document
 * @param {number} inputBytes byte size of the input as read (file or stdin)
 */
function statsFor(parsed, inputBytes) {
  const keyStats = countKeys(parsed);
  const minified = JSON.stringify(parsed);
  const minifiedBytes = Buffer.byteLength(minified, 'utf8');

  const keyOccurrences = keyStats.reduce((n, s) => n + s.count, 0);
  const topKeys = keyStats
    .map((s) => ({
      key: s.key,
      count: s.count,
      keyBytes: s.keyBytes,
      bytes: s.count * s.keyBytes,
    }))
    .sort((a, b) => b.bytes - a.bytes || (a.key < b.key ? -1 : 1))
    .slice(0, 10);

  // Project savings against the minified original, so whitespace
  // differences don't inflate the number.
  const { folded, map } = fold(parsed);
  const foldedBytes = Buffer.byteLength(JSON.stringify(folded), 'utf8');
  const savedBytes = Math.max(0, minifiedBytes - foldedBytes);

  return {
    inputBytes,
    minifiedBytes,
    keyOccurrences,
    uniqueKeys: keyStats.length,
    topKeys,
    estTokens: estimateTokens(inputBytes),
    heuristic: `~${CHARS_PER_TOKEN} chars/token`,
    projected: {
      foldedBytes,
      savedBytes,
      savedPct: minifiedBytes === 0 ? 0 : (100 * savedBytes) / minifiedBytes,
      estTokensSaved: estimateTokens(savedBytes),
      keysAliased: map.keysAliased,
      // The map file itself is overhead you keep locally — it is not
      // pasted into the prompt, so it is excluded from the projection.
      note: 'map file excluded: keep it locally, only the folded JSON goes into the prompt',
    },
  };
}

module.exports = { statsFor, estimateTokens, CHARS_PER_TOKEN };
