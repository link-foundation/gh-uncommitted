# Case Study: Issue #1 — Prototype `gh-uncommitted`

## Summary

Issue [#1](https://github.com/link-foundation/gh-uncommitted/issues/1) asks
for a tool that can copy, move, keep, archive, or stash all uncommitted changes,
using `gh-upload-log` as its architecture and CI/CD reference. It also requires
the issue evidence, requirements, external research, alternatives, and plans to
be collected here.

The repository initially contained only a one-line README and license. This
prototype implements a script-based GitHub CLI extension in dependency-free
JavaScript, tests it in temporary Git repositories, and supplies multi-platform
CI plus tag-driven GitHub releases.

## Evidence collected

- [issue-details.json](./issue-details.json) records the issue as inspected on
  2026-07-12.
- [issue-comments.json](./issue-comments.json) records that the issue had no
  comments or later scope changes.
- [recent-merged-prs.json](./recent-merged-prs.json) records that this new
  repository had no merged pull requests to use as local precedent.
- Pull request #2 had no conversation comments, inline review comments, or
  reviews at the start of implementation.
- The referenced `link-foundation/gh-upload-log` repository was inspected at
  version 0.8.2. It uses a JavaScript executable, package scripts, automated
  tests, multi-platform checks, documentation, and release automation.

## Complete requirements

| ID | Requirement | Resolution |
| --- | --- | --- |
| R1 | Copy all uncommitted changes | `copy` snapshots modified and untracked file content and records deletions. |
| R2 | Move all uncommitted changes | `move` completes a copy before cleaning the worktree. |
| R3 | Keep all uncommitted changes | `keep` creates a named stash checkpoint and reapplies it with its index. |
| R4 | Archive all uncommitted changes | `archive` writes a gzip-compressed tar plus manifest. |
| R5 | Stash all uncommitted changes | `stash` includes untracked files and cleans the worktree. |
| R6 | Follow `gh-upload-log` architecture | Script extension, package metadata, automated tests, docs, CI, and releases mirror its major layers without copying unrelated upload dependencies. |
| R7 | Collect issue data under this directory | Structured issue and comment evidence is committed beside this analysis. |
| R8 | Perform deep case-study analysis | This document covers semantics, root risks, alternatives, and verification. |
| R9 | Search online for facts and components | Official Git and GitHub CLI sources and comparable approaches are assessed below. |
| R10 | List solutions and plans for every requirement | The requirements table and solution matrix map every request to a result. |

## External facts and related components

1. [GitHub's extension documentation](https://docs.github.com/en/github-cli/github-cli/creating-github-cli-extensions)
   requires an extension repository to start with `gh-` and a script extension
   to expose a same-named executable at its root. This repository and the
   `gh-uncommitted` executable follow that contract.
2. [Git status documentation](https://git-scm.com/docs/git-status) defines
   porcelain formats for scripts and `-z` NUL termination for unusual file
   names. The implementation uses NUL-delimited `git ls-files` output rather
   than parsing human-readable status text.
3. [Git stash documentation](https://git-scm.com/docs/git-stash) states that
   `--include-untracked` includes untracked files and cleans them after saving.
   It also documents `apply --index`, used by `keep` to restore staged state.
4. [Git clean documentation](https://git-scm.com/docs/git-clean) explains that
   `-d` includes untracked directories and `-f` is required to delete. `move`
   invokes it only after snapshot creation succeeds.
5. [Git diff documentation](https://git-scm.com/docs/git-diff) supports binary
   patches, but a patch alone is a poor snapshot format for untracked files and
   user-friendly direct file recovery. This prototype stores complete current
   file content instead.
6. Git worktrees separate checked-out working trees, but
   [the worktree documentation](https://git-scm.com/docs/git-worktree) does not
   provide a command that relocates an arbitrary dirty state. It is therefore
   complementary rather than a substitute.

Searches for `gh-uncommitted` found no other extension with the requested
combined workflow. Related tools generally specialize in stashing, worktrees,
patches, or continuous backup; Git's own plumbing remains the smallest and most
portable dependency for this repository.

## Semantics and root risks

“All uncommitted changes” spans three distinct states: index changes, working
tree changes, and untracked files. Deleted paths have no current bytes to copy,
so a file-only backup silently loses intent. Ignored files are intentionally not
included because Git does not normally classify them as uncommitted changes and
they commonly contain build output or secrets.

The most severe risk is partial destructive execution. A naive move could clean
first and fail while copying. This implementation reverses that order and
refuses an existing destination. The manifest records HEAD, branch, time, and
deleted paths so a directory/archive snapshot is self-describing.

Copies and archives represent final working-tree content, not the boundary
between staged and unstaged edits. Git stashes natively represent that boundary,
so `keep` and `stash` are the appropriate modes when exact index restoration is
required.

## Options considered

| Approach | Strengths | Limitations | Decision |
| --- | --- | --- | --- |
| Generate a binary Git diff | Compact; Git-native application | Awkward for untracked files and browsing; recovery can conflict | Rejected as the only format |
| Temporarily commit to a branch | Durable and pushable | Mutates history/refs and needs identity; changes user workflow | Rejected for default behavior |
| Use only `git stash` | Preserves index and untracked files | Repository-local and easy to forget or garbage-collect | Used for `keep`/`stash`, not export |
| Copy complete changed files plus manifest | Easy browsing and recovery; includes binaries | Larger; staged boundary is flattened | Selected for `copy`/`move` |
| Tar the snapshot | Portable single file; compressible | Requires extraction; same flattened boundary | Selected for `archive` |
| Add a linked worktree | Excellent parallel branch workflow | Does not transfer an existing dirty tree by itself | Documented as complementary |

## Implementation plan and result

1. Inventory tracked modifications/deletions and non-ignored untracked files
   using NUL-delimited Git output. **Implemented.**
2. Build a reusable snapshot and manifest layer. **Implemented.**
3. Expose `list`, `copy`, `move`, `keep`, `archive`, and `stash` through the
   root extension executable. **Implemented.**
4. Refuse overwrites and clean only after durable output exists.
   **Implemented.**
5. Reproduce mixed staged, unstaged, untracked, and deleted state in isolated
   tests before completing the implementation. **Implemented.**
6. Test supported Node versions on Linux, macOS, and Windows and create GitHub
   releases from version tags. **Implemented in workflows.**

## Verification

The automated suite covers:

- copy fidelity and deletion metadata while the source remains dirty;
- move fidelity and post-operation cleanliness;
- keep checkpoint creation plus staged/unstaged restoration;
- readable gzip/tar archive contents;
- stash inclusion of untracked paths; and
- a clear failure outside a Git worktree.

Run `npm run check` for syntax checks and the complete test suite.

## Future extensions

Potential follow-ups include an explicit restore command for manifests, optional
inclusion of ignored files with a prominent secret warning, streaming archives
for very large files, and signed/encrypted remote backups. These are deliberately
outside the prototype because they introduce new recovery, confidentiality, and
compatibility contracts not requested by issue #1.
