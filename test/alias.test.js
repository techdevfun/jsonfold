'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assignAliases, pickPrefix } = require('../lib/alias');

const stat = (key, count) => ({ key, count, keyBytes: Buffer.byteLength(key, 'utf8') });

test('aliases are assigned in order of bytes saved (count × (keylen − aliaslen))', () => {
  // "longkeyname" occurs once: saves 1×(11−2)=9
  // "mediumkey" occurs twice: saves 2×(9−2)=14 → aliased first
  const { aliases } = assignAliases([stat('longkeyname', 1), stat('mediumkey', 2)]);
  assert.equal(aliases.get('mediumkey'), '$0');
  assert.equal(aliases.get('longkeyname'), '$1');
});

test('a key is not aliased when the alias is not strictly shorter', () => {
  const { aliases } = assignAliases([stat('id', 50), stat('a', 50), stat('name', 1)]);
  assert.ok(!aliases.has('id'), '"id" (2 bytes) must not become "$0" (2 bytes)');
  assert.ok(!aliases.has('a'), '"a" must not be aliased');
  assert.equal(aliases.get('name'), '$0');
});

test('no keys means no aliases and no crash', () => {
  const { aliases, prefix, collisionAvoided } = assignAliases([]);
  assert.equal(aliases.size, 0);
  assert.equal(prefix, '$');
  assert.equal(collisionAvoided, false);
});

test('ordering ties break deterministically on the key name', () => {
  const once = [stat('zebrakey', 1), stat('applekey', 1)];
  const a = assignAliases(once);
  const b = assignAliases([stat('applekey', 1), stat('zebrakey', 1)]);
  assert.deepEqual([...a.aliases.entries()], [...b.aliases.entries()]);
});

test('existing "$<digits>" keys push the prefix to the next candidate', () => {
  // "$123456789" is long enough to be aliased, and shaped like an alias.
  const { prefix, collisionAvoided, aliases } = assignAliases([
    stat('$123456789', 3),
    stat('longkeyname', 3),
  ]);
  assert.equal(prefix, '#');
  assert.equal(collisionAvoided, true);
  assert.ok(aliases.get('$123456789').startsWith('#'));
  assert.ok(aliases.get('longkeyname').startsWith('#'));
  assert.ok(![...aliases.values()].some((a) => a.startsWith('$')));
});

test('several colliding prefixes keep moving down the candidate list', () => {
  const { prefix } = pickPrefix(['$0', '#1', '@2', '~3']);
  assert.equal(prefix, '§');
});

test('throws when every candidate prefix collides', () => {
  assert.throws(
    () => pickPrefix(['$0', '#1', '@2', '~3', '§4']),
    /every alias prefix candidate/
  );
});

test('unicode keys are measured in bytes, not characters', () => {
  // "t\u00ebst" is 4 chars but 5 bytes in UTF-8; alias "$0" is 2 bytes → aliased.
  const key = 't\u00ebst';
  assert.equal(Buffer.byteLength(key, 'utf8'), 5);
  const { aliases } = assignAliases([stat(key, 10)]);
  assert.equal(aliases.get(key), '$0');
});
