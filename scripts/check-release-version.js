import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const expected = `v${version}`;
if (process.env.GITHUB_REF_NAME !== expected) {
  console.error(`Release tag must be ${expected}; received ${process.env.GITHUB_REF_NAME || '(missing)'}`);
  process.exitCode = 1;
}
