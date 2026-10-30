'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'jsonfold.js');

function run(args, { input = null, cwd = null } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    input,
    cwd: cwd || fs.mkdtempSync(path.join(os.tmpdir(), 'jsonfold-cli-')),
    encoding: 'utf8',
  });
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jsonfold-cli-'));
}

test('invalid JSON exits 1', () => {
  const r = run(['fold'], { input: '{not json' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid JSON/);
});

test('unknown command exits 2', () => {
  const r = run(['squash']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown command/);
});

test('unknown option exits 2', () => {
  const r = run(['fold', '--bogus'], { input: '{}' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option/);
});

test('missing option value exits 2', () => {
  const r = run(['fold', '-o'], { input: '{}' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /needs a value/);
});

test('missing input file exits 1, not 2', () => {
  const dir = tmpdir();
  const r = run(['fold', path.join(dir, 'nope.json')], { cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read/);
});

test('stdin → stdout fold works; receipt goes to stderr, never stdout', () => {
  const r = run(['fold'], { input: '{"repository_name":"demo"}' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"$0":"demo"}');
  assert.match(r.stderr, /jsonfold receipt/);
  assert.match(r.stderr, /round-trip: OK/);
  assert.ok(!r.stdout.includes('receipt'), 'receipt must not leak into stdout');
});

test('default map path is <output>.map when -o is given', () => {
  const dir = tmpdir();
  const src = path.join(dir, 'in.json');
  const out = path.join(dir, 'folded.json');
  fs.writeFileSync(src, '{"repository_name":"x"}');
  const r = run(['fold', src, '-o', out], { cwd: dir });
  assert.equal(r.status, 0);
  assert.ok(fs.existsSync(out + '.map'), 'expected folded.json.map');
  const map = JSON.parse(fs.readFileSync(out + '.map', 'utf8'));
  assert.deepEqual(map.aliases, { repository_name: '$0' });
});

test('default map path is ./fold.map.json when reading stdin without -o', () => {
  const dir = tmpdir();
  const r = run(['fold'], { input: '{"repository_name":"x"}', cwd: dir });
  assert.equal(r.status, 0);
  assert.ok(fs.existsSync(path.join(dir, 'fold.map.json')));
});

test('receipt measures savings against minified input, not raw whitespace', () => {
  const dir = tmpdir();
  const pretty = '{\n  "repositoryName": "demo",\n  "stargazersCount": 7\n}\n';
  const r = run(['fold'], { input: pretty, cwd: dir });
  assert.equal(r.status, 0);
  const m = r.stderr.match(/saved:\s+([\d,]+) bytes/);
  assert.ok(m, 'receipt must print a saved line');
  const reported = Number(m[1].replace(/,/g, ''));
  const minifiedBytes = Buffer.byteLength(JSON.stringify(JSON.parse(pretty)));
  const honest = minifiedBytes - Buffer.byteLength(r.stdout);
  assert.equal(
    reported, honest,
    'receipt must not credit pretty-printed whitespace to folding'
  );
});

test('--receipt writes machine-readable receipt JSON', () => {
  const dir = tmpdir();
  const receiptPath = path.join(dir, 'receipt.json');
  const r = run(['fold', '--receipt', receiptPath], {
    input: '{"repository_name":"x"}',
    cwd: dir,
  });
  assert.equal(r.status, 0);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.tool, 'jsonfold');
  assert.equal(receipt.roundTrip, 'OK');
  assert.ok(receipt.savedBytes >= 0);
  assert.ok('estTokensSaved' in receipt);
});

test('unfold restores the original via the map file', () => {
  const dir = tmpdir();
  const src = path.join(dir, 'in.json');
  const folded = path.join(dir, 'folded.json');
  const map = path.join(dir, 'fold.map.json');
  const restored = path.join(dir, 'restored.json');
  const original = '{"repository_name":"demo","items":[{"stargazers_count":7}]}';
  fs.writeFileSync(src, original);
  assert.equal(run(['fold', src, '-o', folded, '--map', map], { cwd: dir }).status, 0);
  const r = run(['unfold', folded, '--map', map, '-o', restored], { cwd: dir });
  assert.equal(r.status, 0);
  assert.equal(
    fs.readFileSync(restored, 'utf8'),
    JSON.stringify(JSON.parse(original))
  );
});

test('unfold with a bad map file exits 1', () => {
  const dir = tmpdir();
  const bad = path.join(dir, 'bad.map.json');
  fs.writeFileSync(bad, '{"not":"a map"}');
  const r = run(['unfold', '--map', bad], { input: '{}', cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a valid jsonfold map/);
});

test('end-to-end smoke: fold → unfold is byte-identical to minified original', () => {
  const dir = tmpdir();
  const original = JSON.stringify({
    repository_name: 'smoke',
    description: 'unicode check: héllo wörld 日本語',
    nested: { stargazers_count: 12, flags: [true, null, 1.5] },
    items: [{ full_name: 'a/b' }, { full_name: 'c/d' }],
  });
  fs.writeFileSync(path.join(dir, 'orig.json'), original);
  assert.equal(
    run(['fold', 'orig.json', '-o', 'folded.json'], { cwd: dir }).status, 0
  );
  assert.equal(
    run(['unfold', 'folded.json', '--map', 'folded.json.map', '-o', 'restored.json'], { cwd: dir }).status,
    0
  );
  assert.equal(fs.readFileSync(path.join(dir, 'restored.json'), 'utf8'), original);
});

test('--pretty indents the folded output', () => {
  const r = run(['fold', '--pretty'], { input: '{"repository_name":"x"}' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('\n  "$0"'), 'expected indented output');
});

test('stats prints the documented sections', () => {
  const r = run(['stats'], { input: '{"repository_name":"x"}' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /object keys:/);
  assert.match(r.stdout, /top keys by byte contribution:/);
  assert.match(r.stdout, /est\. tokens:/);
  assert.match(r.stdout, /if folded:/);
});
