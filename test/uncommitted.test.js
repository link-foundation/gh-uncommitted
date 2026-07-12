import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPathInside } from '../src/uncommitted.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(root, 'gh-uncommitted');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gh-uncommitted-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.com');
  writeFileSync(path.join(dir, 'modified.txt'), 'original\n');
  writeFileSync(path.join(dir, 'deleted.txt'), 'delete me\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'initial');
  writeFileSync(path.join(dir, 'modified.txt'), 'staged\n');
  git(dir, 'add', 'modified.txt');
  writeFileSync(path.join(dir, 'modified.txt'), 'staged and unstaged\n');
  writeFileSync(path.join(dir, 'untracked.txt'), 'new\n');
  execFileSync('node', ['-e', "require('fs').rmSync('deleted.txt')"], { cwd: dir });
  return dir;
}

function run(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

test('copy snapshots tracked, untracked, and deleted changes without cleaning source', () => {
  const repo = fixture();
  const destination = path.join(repo, '..', `${path.basename(repo)}-copy`);
  const result = run(repo, 'copy', destination);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(destination, 'modified.txt'), 'utf8'), 'staged and unstaged\n');
  assert.equal(readFileSync(path.join(destination, 'untracked.txt'), 'utf8'), 'new\n');
  const manifest = JSON.parse(readFileSync(path.join(destination, '.gh-uncommitted.json')));
  assert.ok(manifest.changes.some(change => change.path === 'deleted.txt' && change.deleted));
  assert.notEqual(git(repo, 'status', '--porcelain'), '');
});

test('move snapshots changes and leaves a clean worktree', () => {
  const repo = fixture();
  const destination = path.join(repo, '..', `${path.basename(repo)}-move`);
  const result = run(repo, 'move', destination);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.ok(existsSync(path.join(destination, 'untracked.txt')));
});

test('move refuses a destination inside the worktree before changing anything', () => {
  const repo = fixture();
  const before = git(repo, 'status', '--porcelain=v1');
  const result = run(repo, 'move', 'backup');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside the source worktree/);
  assert.equal(git(repo, 'status', '--porcelain=v1'), before);
});

test('path containment recognizes Windows paths with mixed separators', () => {
  assert.equal(isPathInside('D:/work/repo', 'D:\\work\\repo\\backup', path.win32), true);
  assert.equal(isPathInside('D:/work/repo', 'D:\\work\\repo-copy', path.win32), false);
});

test('keep creates a stash and preserves staged and unstaged work', () => {
  const repo = fixture();
  const before = git(repo, 'status', '--porcelain=v1');
  const result = run(repo, 'keep', 'checkpoint');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(repo, 'status', '--porcelain=v1'), before);
  assert.match(git(repo, 'stash', 'list'), /checkpoint/);
  assert.equal(git(repo, 'diff', '--cached', '--', 'modified.txt').includes('+staged'), true);
});

test('archive creates a compressed tar containing files and manifest', () => {
  const repo = fixture();
  const archive = path.join(repo, '..', `${path.basename(repo)}.tar.gz`);
  const result = run(repo, 'archive', archive);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(archive));
  const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  assert.match(listing, /modified\.txt/);
  assert.match(listing, /\.gh-uncommitted\.json/);
});

test('stash includes untracked files and cleans the worktree', () => {
  const repo = fixture();
  const result = run(repo, 'stash', 'away');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.match(git(repo, 'stash', 'show', '--include-untracked', '--name-only'), /untracked\.txt/);
});

test('refuses to operate outside a Git worktree', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gh-uncommitted-not-git-'));
  const result = run(dir, 'list');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Git worktree/);
});
