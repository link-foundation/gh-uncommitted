# npm publishing

The `Release` workflow runs on `v*` tags. Its `release` job checks that the tag
matches `package.json`, installs with `npm ci`, runs the tests, checks the package
contents, and creates the GitHub release with generated notes. The dependent
`publish` job uses a GitHub-hosted runner, Node 24, npm 11.20.0, and
`id-token: write` to publish through npm OIDC. Only the release job has
`contents: write`. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is configured in
the workflow. npm generates provenance automatically for trusted publishing
from this public repository.

Runtime support remains Node >=20. The newer Node version is only needed by
the publishing toolchain. The package includes the executable, `src/`, and npm's
standard metadata, README, and license files. Tests and internal documentation
are excluded by the package `files` allowlist.

## One-time bootstrap

An npm package owner must perform the initial publication and publisher setup.
An authenticated npm account with permission to create `gh-uncommitted` is
required. GitHub credentials alone cannot authorize these operations.

1. Publish the original `gh-uncommitted@0.1.0` from the existing main-branch
   implementation at commit `fa77c83`. In a separate clean checkout of that
   commit, run `npm ci`, `npm run check`, and `npm pack --dry-run`; review the
   package contents, then run `npm publish --access public` with interactive
   npm authentication or a short-lived bootstrap token. Do not add that token
   to the release workflow, commit it, or put it in a command-line argument.
2. Open the package's **Settings → Trusted publishing** on npmjs.com and add
   a GitHub Actions publisher with these exact values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `link-foundation` |
   | Repository | `gh-uncommitted` |
   | Workflow filename | `release.yml` |
   | Environment | Leave blank (the workflow does not use one) |
   | Allowed actions | Enable direct `npm publish` |

   Save and verify that npm lists this repository and workflow. Configuration
   alone does not prove that a publish works.
3. Revoke any bootstrap token on npm, remove its local npm configuration, and
   delete any temporary GitHub secret if one was created. No bootstrap token
   is needed for subsequent releases. Confirm no `NPM_TOKEN` or
   `NODE_AUTH_TOKEN` publishing secret remains. Consider npm's publishing access
   setting **Require two-factor authentication and disallow tokens**.
4. After merging this PR, tag the version prepared here (`v0.1.1`) on the merged
   commit and push the tag. This uses a new version because npm versions cannot
   be overwritten. Complete the first trusted publish within npm's two-day
   publisher validation window, or recreate an expired publisher first.
5. Verify all acceptance criteria using the evidence below. If publication
   fails, inspect the failed job before retrying it. The GitHub release is
   created before npm publication, so a failed npm publish still leaves it
   available; retry only the failed publish job after fixing the npm settings.

## Verification

Before setup, `npm view gh-uncommitted version` returns E404. To verify locally:

```sh
npm run check
npm pack --dry-run
npm publish --dry-run --access public
```

The automated release test accepts the exact version tag and rejects a different
version, a missing `v` prefix, a non-version tag, and an empty tag. It runs in the
existing Node 20/22 Linux/macOS/Windows CI matrix. A publish dry run validates
packaging, but does not exercise OIDC authentication or create a package.

After the real tag run, record its URL and verify:

```sh
npm view gh-uncommitted version
npm view gh-uncommitted@0.1.1 dist.attestations --json
gh run list --repo link-foundation/gh-uncommitted --workflow release.yml
gh release view v0.1.1 --repo link-foundation/gh-uncommitted
```

Also inspect the npm package settings for the exact trusted publisher entry.
A successful publish job without npm token secrets plus the provenance is the
evidence for the token-free CI publication criterion.

## Issue #3 requirement tracking

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Add npm OIDC publish job | `publish` in `.github/workflows/release.yml` | Workflow validation and tag-run evidence required |
| Preserve GitHub releases | Existing release command retained before publishing | Tag-run evidence required |
| Bootstrap `0.1.0`, attach publisher, remove token | One-time procedure above | Blocked: no authenticated npm account in solver environment |
| `npm view gh-uncommitted version` succeeds | Requires actual bootstrap | Currently E404; incomplete |
| Tag publishes without `NPM_TOKEN` | OIDC workflow, prepared version `0.1.1` | Actual publication still required; incomplete |
| npm lists repository and `release.yml` | Exact publisher fields above | npm account access required; incomplete |
| GitHub release is created | Tag workflow release job | Actual tag run still required; incomplete |

These external acceptance criteria remain unfinished until the real package,
publisher settings, tag run, and release are verified. Passing PR tests does not
satisfy them.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
(requirements, configuration, provenance, and publisher expiry).
