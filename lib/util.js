'use strict';

/**
 * Structural deep-equal used by the fold round-trip check.
 * Objects compare key-order-insensitively; arrays are order-sensitive;
 * values are never coerced (Object.is semantics, so -0 and NaN behave
 * exactly as parsed).
 */
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k])
  );
}

function formatBytes(n) {
  return n.toLocaleString('en-US');
}

function pct(part, whole) {
  if (whole === 0) return '0.0';
  return ((100 * part) / whole).toFixed(1);
}

module.exports = { deepEqual, formatBytes, pct };
