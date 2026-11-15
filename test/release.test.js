import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-release-version.js', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

test('release accepts only the tag matching the package version', { timeout: 10000 }, () => {
  for (const tag of [`v${version}`, 'v0.0.0', version, 'vnext', '']) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, GITHUB_REF_NAME: tag },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, tag === `v${version}` ? 0 : 1, result.stderr);
    if (tag !== `v${version}`) assert.match(result.stderr, /Release tag must be/);
  }
});
