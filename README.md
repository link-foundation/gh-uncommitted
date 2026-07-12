# gh-uncommitted

A GitHub CLI extension to copy, move, keep, archive, or stash all uncommitted
changes in a Git worktree.

## Install

Node.js 20 or newer and Git are required.

```sh
gh extension install link-foundation/gh-uncommitted
```

For local development:

```sh
gh extension install .
```

## Commands

```text
gh uncommitted list
gh uncommitted copy <directory>
gh uncommitted move <directory>
gh uncommitted keep [message]
gh uncommitted archive <file.tar.gz>
gh uncommitted stash [message]
```

- `list` reports modified, deleted, and untracked paths.
- `copy` writes the current contents of changed files to a new directory.
- `move` creates the same snapshot, then restores tracked files and removes
  untracked files from the source worktree.
- `keep` creates a named stash checkpoint and immediately restores the index
  and working tree, leaving the checkpoint in `git stash list`.
- `archive` creates a gzip-compressed tar snapshot.
- `stash` delegates to `git stash push --include-untracked` and leaves a clean
  worktree.

Directory and archive snapshots contain `.gh-uncommitted.json`. The manifest
records the source HEAD, branch, timestamp, and every changed path, including
deleted paths that have no file content to copy.

Ignored files are excluded, matching normal Git status behavior. Destinations
are never overwritten. Run `gh uncommitted --help` for concise command help.

## Safety model

`copy`, `keep`, and `archive` preserve the source worktree. `move` and `stash`
clean it. A move cleans the source only after the snapshot has completed.
Archives and copies preserve the current working-tree file content; the
manifest records deletions, while `keep` and `stash` preserve Git's staged and
unstaged structure.

## Development

```sh
npm test
npm run check
```

The test suite creates isolated temporary repositories and does not modify the
repository where it runs.
