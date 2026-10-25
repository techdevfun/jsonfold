'use strict';

/**
 * Folding: rewrite object keys to short aliases.
 *
 * Values are never touched — numbers, strings, unicode, booleans and null
 * pass through exactly as parsed. Key order within each object is preserved.
 */

const { assignAliases } = require('./alias');
const { unfoldValue } = require('./unfold');
const { deepEqual } = require('./util');

/**
 * Walk the document and count every object key occurrence.
 * @returns {Array<{key:string,count:number,keyBytes:number}>}
 */
function countKeys(value) {
  const stats = new Map();
  (function walk(v) {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v !== null && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        let entry = stats.get(k);
        if (!entry) {
          entry = { key: k, count: 0, keyBytes: Buffer.byteLength(k, 'utf8') };
          stats.set(k, entry);
        }
        entry.count += 1;
        walk(v[k]);
      }
    }
  })(value);
  return [...stats.values()];
}

/**
 * Assign an own property, including for "__proto__": plain assignment
 * would invoke the Object.prototype setter and change the object's
 * prototype instead of storing a key, which used to make fold() refuse
 * any document containing a "__proto__" key (its round-trip check saw
 * the key vanish). Other keys assign normally.
 */
function assignOwn(obj, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(obj, key, {
      value, writable: true, enumerable: true, configurable: true,
    });
  } else {
    obj[key] = value;
  }
}

function foldValue(value, keyToAlias) {
  if (Array.isArray(value)) {
    return value.map((v) => foldValue(v, keyToAlias));
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      const alias = keyToAlias.has(k) ? keyToAlias.get(k) : k;
      assignOwn(out, alias, foldValue(value[k], keyToAlias));
    }
    return out;
  }
  return value;
}

/**
 * Fold a parsed JSON document.
 *
 * Always performs an internal round-trip check (fold → unfold →
 * deep-equal against the original) and throws on mismatch, so a bad
 * fold can never be silently written out.
 *
 * @returns {{ folded:any, map:object, keyStats:Array }}
 */
function fold(parsed) {
  const keyStats = countKeys(parsed);
  const { prefix, aliases, collisionAvoided } = assignAliases(keyStats);

  const folded = foldValue(parsed, aliases);

  const aliasToKey = new Map();
  for (const [original, alias] of aliases) aliasToKey.set(alias, original);
  const restored = unfoldValue(folded, aliasToKey);
  if (!deepEqual(restored, parsed)) {
    throw new Error(
      'jsonfold: internal round-trip check FAILED — ' +
      'fold→unfold did not reproduce the original document'
    );
  }

  const keyOccurrences = keyStats.reduce((n, s) => n + s.count, 0);
  const map = {
    jsonfold: 1,
    prefix,
    collisionAvoided,
    aliases: Object.fromEntries(aliases),
    keysAliased: aliases.size,
    uniqueKeys: keyStats.length,
    keyOccurrences,
  };
  return { folded, map, keyStats };
}

module.exports = { fold, foldValue, countKeys };
