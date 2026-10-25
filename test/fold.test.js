'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fold, countKeys } = require('../lib/fold');
const { unfoldValue } = require('../lib/unfold');
const { deepEqual } = require('../lib/util');

test('fold rewrites keys in nested objects and objects inside arrays', () => {
  const doc = {
    repository_name: 'demo',
    items: [{ repository_name: 'x', stargazers_count: 3 }],
  };
  const { folded, map } = fold(doc);
  assert.deepEqual(folded, {
    [map.aliases.repository_name]: 'demo',
    [map.aliases.items]: [{ [map.aliases.repository_name]: 'x', [map.aliases.stargazers_count]: 3 }],
  });
});

test('values are never touched: numbers, strings, unicode, booleans, null', () => {
  const doc = {
    longkeyname: -0,
    anotherkey: 9007199254740993,
    thirdkey: 'héllo wörld 日本語',
    fourthkey: true,
    fifthkey: null,
    sixthkey: 1.5e-7,
  };
  const { folded, map } = fold(doc);
  const aliasToKey = new Map(Object.entries(map.aliases).map(([k, v]) => [v, k]));
  const restored = unfoldValue(folded, aliasToKey);
  assert.ok(deepEqual(restored, doc), 'round-trip must preserve every value exactly');
  assert.equal(restored.thirdkey, 'héllo wörld 日本語');
  assert.ok(Object.is(restored.longkeyname, -0), '-0 must survive the round trip');
});

test('a "__proto__" key folds and unfolds as data, without polluting prototypes', () => {
  const doc = JSON.parse('{"__proto__": {"polluted": false}, "repository_name": "x", "nested": {"__proto__": 1}}');
  const { folded, map } = fold(doc);
  const aliasToKey = new Map(Object.entries(map.aliases).map(([k, v]) => [v, k]));
  const restored = unfoldValue(folded, aliasToKey);
  assert.ok(deepEqual(restored, doc), 'round-trip must preserve the __proto__ key');
  assert.equal(Object.getPrototypeOf(restored), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.ok(Object.prototype.hasOwnProperty.call(restored, '__proto__'), 'restored object must own the __proto__ key');
  assert.deepEqual(restored['__proto__'], { polluted: false });
});

test('keys too short to benefit keep their original names', () => {
  const { folded } = fold({ id: 1, repository_name: 'x' });
  assert.ok('id' in folded, '"id" must not be renamed');
  assert.ok(!('repository_name' in folded), 'long key must be renamed');
});

test('countKeys counts occurrences across nesting', () => {
  const stats = countKeys({ aaaa: [{ aaaa: 1 }, { bbbb: 2 }], bbbb: 3 });
  const byKey = Object.fromEntries(stats.map((s) => [s.key, s.count]));
  assert.equal(byKey.aaaa, 2);
  assert.equal(byKey.bbbb, 2);
});

test('round-trip holds for a deeply nested mixed document', () => {
  const doc = {
    level_one_key: {
      level_two_key: [{ level_three_key: [1, 'two', { level_four_key: null }] }],
    },
    top_array: [[], [{}]],
  };
  const { folded, map } = fold(doc);
  const aliasToKey = new Map(Object.entries(map.aliases).map(([k, v]) => [v, k]));
  assert.ok(deepEqual(unfoldValue(folded, aliasToKey), doc));
});

test('round-trip holds for empty documents', () => {
  for (const doc of [{}, [], { empty_object: {}, empty_array: [] }]) {
    const { folded, map } = fold(doc);
    const aliasToKey = new Map(Object.entries(map.aliases).map(([k, v]) => [v, k]));
    assert.ok(deepEqual(unfoldValue(folded, aliasToKey), doc), JSON.stringify(doc));
  }
});

test('map file records prefix, aliases and key counts', () => {
  const { map } = fold({ repository_name: 'x', id: 1 });
  assert.equal(map.jsonfold, 1);
  assert.equal(map.prefix, '$');
  assert.equal(map.collisionAvoided, false);
  assert.deepEqual(map.aliases, { repository_name: '$0' });
  assert.equal(map.keysAliased, 1);
  assert.equal(map.uniqueKeys, 2);
  assert.equal(map.keyOccurrences, 2);
});

test('collision is recorded in the map', () => {
  const { map } = fold({ $0: 'tricky', repository_name: 'x' });
  assert.equal(map.collisionAvoided, true);
  assert.equal(map.prefix, '#');
});

test('deepEqual is strict about values and key sets', () => {
  assert.ok(deepEqual({ a: 1, b: [2] }, { b: [2], a: 1 }));
  assert.ok(!deepEqual({ a: 1 }, { a: '1' }));
  assert.ok(!deepEqual({ a: 1 }, { a: 1, b: 2 }));
  assert.ok(!deepEqual([1, 2], [2, 1]));
  assert.ok(!deepEqual({ a: -0 }, { a: 0 }));
});

test('savings math is exact on a small known document', () => {
  // "aaaa" ×2: alias "$0" saves 2 bytes per occurrence → 4 bytes total.
  const doc = [{ aaaa: 1 }, { aaaa: 2 }];
  const { folded, map } = fold(doc);
  assert.deepEqual(map.aliases, { aaaa: '$0' });
  const originalBytes = Buffer.byteLength('[{"aaaa":1},{"aaaa":2}]', 'utf8');
  const foldedBytes = Buffer.byteLength(JSON.stringify(folded), 'utf8');
  assert.equal(originalBytes, 23);
  assert.equal(foldedBytes, 19);
  assert.equal(originalBytes - foldedBytes, 4);
});
