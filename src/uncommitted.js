import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: options.encoding ?? 'utf8', stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'] });
}

export function repositoryRoot() {
  try {
    return realpathSync(git(['rev-parse', '--show-toplevel']).trim());
  } catch {
    throw new Error('Current directory is not inside a Git worktree.');
  }
}

function nulList(args) {
  const output = git(args, { encoding: 'buffer' });
  return output.toString('utf8').split('\0').filter(Boolean);
}

export function collectChanges(root = repositoryRoot()) {
  const modified = nulList(['-C', root, 'ls-files', '-m', '-z']);
  const deleted = new Set(nulList(['-C', root, 'ls-files', '-d', '-z']));
  const untracked = nulList(['-C', root, 'ls-files', '-o', '--exclude-standard', '-z']);
  const paths = [...new Set([...modified, ...deleted, ...untracked])].sort();
  return paths.map(file => ({ path: file, deleted: deleted.has(file), untracked: untracked.includes(file) }));
}

function manifest(root, changes) {
  return {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    repository: path.basename(root),
    head: git(['-C', root, 'rev-parse', 'HEAD']).trim(),
    branch: git(['-C', root, 'branch', '--show-current']).trim() || null,
    changes,
  };
}

export function copyChanges(destination, root = repositoryRoot()) {
  const changes = collectChanges(root);
  if (changes.length === 0) throw new Error('No uncommitted changes found.');
  const target = path.resolve(destination);
  if (existsSync(target)) throw new Error(`Destination already exists: ${target}`);
  mkdirSync(target, { recursive: true });
  for (const change of changes) {
    if (change.deleted) continue;
    const output = path.join(target, change.path);
    mkdirSync(path.dirname(output), { recursive: true });
    cpSync(path.join(root, change.path), output, { recursive: true, verbatimSymlinks: true });
  }
  writeFileSync(path.join(target, '.gh-uncommitted.json'), `${JSON.stringify(manifest(root, changes), null, 2)}\n`);
  return { target, changes };
}

export function isPathInside(parent, candidate, pathApi = path) {
  const normalizedParent = pathApi.resolve(parent);
  const normalizedCandidate = pathApi.resolve(candidate);
  const relative = pathApi.relative(normalizedParent, normalizedCandidate);
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative));
}

export function moveChanges(destination, root = repositoryRoot()) {
  const target = path.resolve(destination);
  if (isPathInside(root, target)) {
    throw new Error('Move destination must be outside the source worktree.');
  }
  const result = copyChanges(target, root);
  cleanChanges(root);
  return result;
}

export function cleanChanges(root = repositoryRoot()) {
  git(['-C', root, 'reset', '--hard', 'HEAD']);
  git(['-C', root, 'clean', '-fd']);
}

export function stashChanges(message, root = repositoryRoot()) {
  if (collectChanges(root).length === 0) throw new Error('No uncommitted changes found.');
  git(['-C', root, 'stash', 'push', '--include-untracked', '--message', message]);
}

export function keepChanges(message, root = repositoryRoot()) {
  stashChanges(message, root);
  try {
    git(['-C', root, 'stash', 'apply', '--index', 'stash@{0}']);
  } catch (error) {
    throw new Error(`Checkpoint was created, but restoring the worktree failed: ${error.stderr || error.message}`);
  }
}

function octal(value, size) {
  return `${value.toString(8).padStart(size - 1, '0')}\0`;
}

function tarEntry(name, content, mode = 0o644, type = '0', link = '') {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const portableName = name.replaceAll('\\', '/');
  if (Buffer.byteLength(portableName) > 100) throw new Error(`Archive path is too long: ${name}`);
  const header = Buffer.alloc(512);
  header.write(portableName, 0, 100);
  header.write(octal(mode, 8), 100, 8);
  header.write(octal(0, 8), 108, 8);
  header.write(octal(0, 8), 116, 8);
  header.write(octal(data.length, 12), 124, 12);
  header.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1);
  header.write(link, 157, 100);
  header.write('ustar\0', 257, 6);
  header.write('00', 263, 2);
  const sum = [...header].reduce((total, byte) => total + byte, 0);
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([header, data, padding]);
}

export function archiveChanges(output, root = repositoryRoot()) {
  const changes = collectChanges(root);
  if (changes.length === 0) throw new Error('No uncommitted changes found.');
  const entries = [];
  for (const change of changes) {
    if (change.deleted) continue;
    const source = path.join(root, change.path);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) {
      entries.push(tarEntry(change.path, '', stat.mode & 0o777, '2', readlinkSync(source)));
    } else if (stat.isFile()) {
      entries.push(tarEntry(change.path, readFileSync(source), stat.mode & 0o777));
    } else {
      throw new Error(`Archive cannot include special file: ${change.path}`);
    }
  }
  entries.push(tarEntry('.gh-uncommitted.json', `${JSON.stringify(manifest(root, changes), null, 2)}\n`));
  entries.push(Buffer.alloc(1024));
  const target = path.resolve(output);
  if (existsSync(target)) throw new Error(`Archive already exists: ${target}`);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, gzipSync(Buffer.concat(entries)));
  return { target, changes };
}
