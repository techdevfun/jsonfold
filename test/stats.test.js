'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { statsFor, estimateTokens, CHARS_PER_TOKEN } = require('../lib/stats');

test('stats shape contains every documented field', () => {
  const s = statsFor({ repository_name: 'x' }, 100);
  for (const field of [
    'inputBytes', 'minifiedBytes', 'keyOccurrences', 'uniqueKeys',
    'topKeys', 'estTokens', 'heuristic', 'projected',
  ]) {
    assert.ok(field in s, `missing field: ${field}`);
  }
  for (const field of ['foldedBytes', 'savedBytes', 'savedPct', 'estTokensSaved', 'keysAliased', 'note']) {
    assert.ok(field in s.projected, `missing projected field: ${field}`);
  }
});

test('top keys are ordered by byte contribution, descending', () => {
  const doc = { longkeyname: [1, 2, 3], id: 1 };
  const s2 = statsFor(doc, 50);
  assert.ok(Array.isArray(s2.topKeys));
  // "longkeyname": 1 × 11 B = 11 B beats "id": 1 × 2 B = 2 B
  assert.equal(s2.topKeys[0].key, 'longkeyname');
  assert.equal(s2.topKeys[0].bytes, 11);
  assert.ok(s2.topKeys.length <= 10);
});

test('token estimate is ceil(bytes/4) and the heuristic is labeled', () => {
  assert.equal(estimateTokens(100), 25);
  assert.equal(estimateTokens(101), 26);
  assert.equal(CHARS_PER_TOKEN, 4);
  const s = statsFor({ a: 1 }, 101);
  assert.equal(s.estTokens, 26);
  assert.match(s.heuristic, /4 chars\/token/);
});

test('projected savings compare folded bytes against minified input', () => {
  const doc = [{ aaaa: 1 }, { aaaa: 2 }];
  const minBytes = Buffer.byteLength(JSON.stringify(doc), 'utf8'); // 23
  const s = statsFor(doc, 100);
  assert.equal(s.projected.foldedBytes, 19);
  assert.equal(s.projected.savedBytes, minBytes - 19);
  assert.equal(s.projected.keysAliased, 1);
  assert.ok(s.projected.savedPct > 0);
});

test('projected savings exclude whitespace inflation', () => {
  const pretty = '{\n  "repository_name": "x"\n}\n';
  const minified = '{"repository_name":"x"}';
  const s = statsFor(JSON.parse(pretty), Buffer.byteLength(pretty, 'utf8'));
  assert.equal(s.minifiedBytes, Buffer.byteLength(minified, 'utf8'));
  // savings must be relative to the minified form, not the pretty input
  assert.ok(s.projected.savedBytes <= s.minifiedBytes);
});

test('stats on a keyless document report zero keys without crashing', () => {
  const s = statsFor([1, 2, 3], 7);
  assert.equal(s.keyOccurrences, 0);
  assert.equal(s.uniqueKeys, 0);
  assert.deepEqual(s.topKeys, []);
});
