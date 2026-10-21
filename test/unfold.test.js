'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fold } = require('../lib/fold');
const { unfoldValue, mapFromObject } = require('../lib/unfold');

function invert(map) {
  return new Map(Object.entries(map.aliases).map(([k, v]) => [v, k]));
}

test('unfold restores the original document exactly', () => {
  const doc = { repository_name: 'demo', items: [{ stargazers_count: 42 }] };
  const { folded, map } = fold(doc);
  assert.deepEqual(unfoldValue(folded, invert(map)), doc);
});

test('unfold respects a non-default prefix from the map', () => {
  const doc = { $0: 'already looks like an alias', repository_name: 'x' };
  const { folded, map } = fold(doc);
  assert.equal(map.prefix, '#');
  assert.deepEqual(unfoldValue(folded, mapFromObject(map)), doc);
});

test('keys with no map entry pass through unchanged', () => {
  const restored = unfoldValue({ $0: 1, unknown_key: 2 }, new Map([['$0', 'aaa']]));
  assert.deepEqual(restored, { aaa: 1, unknown_key: 2 });
});

test('mapFromObject rejects anything that is not a jsonfold map', () => {
  assert.throws(() => mapFromObject(null), /not a valid jsonfold map/);
  assert.throws(() => mapFromObject({ jsonfold: 1 }), /not a valid jsonfold map/);
  assert.throws(() => mapFromObject({ aliases: {} }), /not a valid jsonfold map/);
  assert.throws(() => mapFromObject({ jsonfold: 1, aliases: [] }), /not a valid jsonfold map/);
  assert.throws(
    () => mapFromObject({ jsonfold: 1, aliases: { a: 5 } }),
    /invalid alias/
  );
});
