'use strict';

/**
 * Unfolding: restore original keys from a folded document using a map file.
 * Keys with no entry in the map are passed through unchanged.
 */

function unfoldValue(value, aliasToKey) {
  if (Array.isArray(value)) {
    return value.map((v) => unfoldValue(v, aliasToKey));
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      const original = aliasToKey.has(k) ? aliasToKey.get(k) : k;
      out[original] = unfoldValue(value[k], aliasToKey);
    }
    return out;
  }
  return value;
}

/**
 * Validate a parsed map file and return its alias→original-key lookup.
 * @throws on anything that is not a jsonfold map.
 */
function mapFromObject(obj) {
  if (
    !obj ||
    typeof obj !== 'object' ||
    Array.isArray(obj) ||
    obj.jsonfold !== 1 ||
    !obj.aliases ||
    typeof obj.aliases !== 'object' ||
    Array.isArray(obj.aliases)
  ) {
    throw new Error(
      'jsonfold: map file is not a valid jsonfold map ' +
      '(expected {"jsonfold":1,"aliases":{...}})'
    );
  }
  const aliasToKey = new Map();
  for (const [original, alias] of Object.entries(obj.aliases)) {
    if (typeof alias !== 'string') {
      throw new Error(`jsonfold: invalid alias for key "${original}" in map file`);
    }
    aliasToKey.set(alias, original);
  }
  return aliasToKey;
}

module.exports = { unfoldValue, mapFromObject };
