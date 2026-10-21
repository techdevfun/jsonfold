'use strict';

/**
 * Alias assignment for jsonfold.
 *
 * Aliases look like `$0`, `$1`, … — short, and visibly not real keys.
 * Keys are aliased in order of estimated bytes saved
 * (occurrences × (keyBytes − aliasBytes)), so the most expensive keys
 * get the shortest aliases first.
 */

const DEFAULT_PREFIX = '$';
// Tried in order when the default prefix would collide with existing keys.
const PREFIX_CANDIDATES = ['$', '#', '@', '~', '§'];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(prefix) {
  return new RegExp('^' + escapeRegExp(prefix) + '\\d+$');
}

/**
 * Pick an alias prefix that cannot be confused with an existing key.
 *
 * If any original key already matches the alias pattern (e.g. a document
 * that literally contains the key "$0"), the default prefix is unsafe:
 * unfolding would be ambiguous. In that case the first candidate prefix
 * with zero collisions is chosen and the switch is recorded in the map
 * file so `unfold` needs no guesswork.
 *
 * @param {string[]} keys every distinct object key in the document
 * @returns {{ prefix: string, collisionAvoided: boolean }}
 * @throws when every candidate prefix collides (pathological input)
 */
function pickPrefix(keys) {
  for (const prefix of PREFIX_CANDIDATES) {
    const re = aliasPattern(prefix);
    if (!keys.some((k) => re.test(k))) {
      return { prefix, collisionAvoided: prefix !== DEFAULT_PREFIX };
    }
  }
  throw new Error(
    'jsonfold: every alias prefix candidate ($ # @ ~ §) collides with an ' +
    'existing key shaped like <prefix><digits>; refusing to fold'
  );
}

function aliasLength(prefix, index) {
  return Buffer.byteLength(prefix + String(index), 'utf8');
}

/**
 * @param {Array<{key:string,count:number,keyBytes:number}>} keyStats
 * @returns {{ prefix:string, aliases:Map<string,string>, collisionAvoided:boolean }}
 */
function assignAliases(keyStats) {
  const keys = keyStats.map((s) => s.key);
  const { prefix, collisionAvoided } = pickPrefix(keys);

  // Order by estimated savings. aliasLength depends on the final index,
  // so estimate with a one-digit index; the strictly-shorter filter below
  // is applied with the real alias length. Tie-break on the key itself so
  // the output is deterministic.
  const ordered = [...keyStats].sort((a, b) => {
    const sa = a.count * (a.keyBytes - aliasLength(prefix, 0));
    const sb = b.count * (b.keyBytes - aliasLength(prefix, 0));
    if (sb !== sa) return sb - sa;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const aliases = new Map();
  ordered.forEach((s, i) => {
    const alias = prefix + i;
    // Only alias when the alias is strictly shorter than the key.
    // Short keys like "id" (2 bytes vs "$0" at 2 bytes) are left alone.
    if (Buffer.byteLength(alias, 'utf8') < s.keyBytes) {
      aliases.set(s.key, alias);
    }
  });

  return { prefix, aliases, collisionAvoided };
}

module.exports = { assignAliases, pickPrefix, DEFAULT_PREFIX, PREFIX_CANDIDATES };
