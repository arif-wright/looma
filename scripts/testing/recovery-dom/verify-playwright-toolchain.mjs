import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This is a release-specific allowlist, not permission to refresh dependencies.
// Baseline 98e9049 keeps its product source and complete production graph. Only
// the three dev-only Playwright packages receive the reviewed 1.57.0 fix. Both
// comparison subjects then use byte-identical reviewed manifests and fixtures.
const ORIGINAL = {
  'package.json': 'c9fc67ecfe3280bb41b2a39efb43549a2e12692f3b6cb330ef826868cbe269f4',
  'package-lock.json': 'a39446910ec45c892d14fa0a73320a858c157621db480ed4b34e67588550823e',
  'pnpm-lock.yaml': 'e786688532e4b0d3cb7daac888136c72fe5c4c2c856f5729190f36f8f43b95a6'
};
const REVIEWED = {
  'package.json': '30d3a5d5e08627e86d673612b60b1a7dd95fa3468faa7f64e6b70e00ce3ded24',
  'package-lock.json': '7f0aa402c5032c5ab0a266959b1b7895208356567e5be9c1f6f68b675e37bf6b',
  'pnpm-lock.yaml': 'ccb1d8150ced25661e43b619dcb5365a542274705c4ffbb5339b1304d4ca7953'
};
const PACKAGES = {
  '@playwright/test': {
    tarball: '@playwright/test/-/test', dependency: 'playwright',
    oldIntegrity: 'sha512-Tzh95Twig7hUwwNe381/K3PggZBZblKUe2wv25oIpzWLr6Z0m4KgV1ZVIjnR6GM9ANEqjZD7XsZEa6JL/7YEgg==',
    newIntegrity: 'sha512-6TyEnHgd6SArQO8UO2OMTxshln3QMWBtPGrOCgs3wVEmQmwyuNtB10IZMfmYDE0riwNR1cu4q+pPcxMVtaG3TA=='
  },
  playwright: {
    tarball: 'playwright/-/playwright', dependency: 'playwright-core',
    oldIntegrity: 'sha512-X5Q1b8lOdWIE4KAoHpW3SE8HvUB+ZZsUoN64ZhjnN8dOb1UpujxBtENGiZFE+9F/yhzJwYa+ca3u43FeLbboHA==',
    newIntegrity: 'sha512-ilYQj1s8sr2ppEJ2YVadYBN0Mb3mdo9J0wQ+UuDhzYqURwSoW4n1Xs5vs7ORwgDGmyEh33tRMeS8KhdkMoLXQw=='
  },
  'playwright-core': {
    tarball: 'playwright-core/-/playwright-core',
    oldIntegrity: 'sha512-1SXl7pMfemAMSDn5rkPeZljxOCYAmQnYLBTExuh6E8USHXGSX3dx6lYZN/xPpTz1vimXmPA9CDnILvmJaB8aSQ==',
    newIntegrity: 'sha512-agTcKlMw/mjBWOnD6kFZttAAGHgi/Nw0CZ2o6JqWSbMlI219lAFLZZCyqByTsvVAJq5XA5H8cA6PrvBRpBWEuQ=='
  }
};
const sha = value => createHash('sha256').update(value).digest('hex');
const serialize = value => `${JSON.stringify(value, null, '\t')}\n`;
const [source, phase, subjectArg = '.', fixtureArg = '../fixture'] = process.argv.slice(2);
assert.ok(['baseline', 'candidate'].includes(source), 'Specify baseline or candidate');
assert.ok(['before', 'after'].includes(phase), 'Specify before or after the manifest overlay');
const subject = resolve(subjectArg);
const fixture = resolve(fixtureArg);
const reviewed = Object.fromEntries(Object.keys(REVIEWED).map(name => [name, readFileSync(resolve(fixture, name), 'utf8')]));
for (const [name, expected] of Object.entries(REVIEWED)) {
  assert.equal(sha(reviewed[name]), expected, `Unreviewed fixture ${name}`);
}

// Inverting only the authorized npm fields must recreate every byte of the old
// lock. This proves all other nodes, integrity values, and both fsevents entries
// survive exactly, including the optional @colyseus/sdk zod peer.
const manifest = JSON.parse(reviewed['package.json']);
assert.equal(manifest.devDependencies['@playwright/test'], '1.57.0');
manifest.devDependencies['@playwright/test'] = '^1.48.0';
assert.equal(sha(serialize(manifest)), ORIGINAL['package.json']);
const lock = JSON.parse(reviewed['package-lock.json']);
assert.equal(lock.packages[''].devDependencies['@playwright/test'], '1.57.0');
lock.packages[''].devDependencies['@playwright/test'] = '^1.48.0';
for (const [name, expected] of Object.entries(PACKAGES)) {
  const entry = lock.packages[`node_modules/${name}`];
  assert.equal(entry.dev, true, `${name} must remain dev-only`);
  assert.equal(entry.version, '1.57.0');
  assert.equal(entry.resolved, `https://registry.npmjs.org/${expected.tarball}-1.57.0.tgz`);
  assert.equal(entry.integrity, expected.newIntegrity);
  entry.version = '1.56.0';
  entry.resolved = `https://registry.npmjs.org/${expected.tarball}-1.56.0.tgz`;
  entry.integrity = expected.oldIntegrity;
  if (expected.dependency) {
    assert.equal(entry.dependencies[expected.dependency], '1.57.0');
    entry.dependencies[expected.dependency] = '1.56.0';
  }
}
assert.equal(sha(serialize(lock)), ORIGINAL['package-lock.json'], 'Unallowlisted npm graph change');

// The pnpm graph has a different original Playwright patch release. Verify
// the importer, three package records, and three dependency snapshots only.
let pnpm = reviewed['pnpm-lock.yaml'];
const replaceExactly = (before, after, count = 1) => {
  assert.equal(pnpm.split(before).length - 1, count, `Unexpected pnpm field: ${before}`);
  pnpm = pnpm.split(before).join(after);
};
replaceExactly("      '@playwright/test':\n        specifier: 1.57.0\n        version: 1.57.0", "      '@playwright/test':\n        specifier: ^1.48.0\n        version: 1.56.1");
const oldPnpmIntegrity = {
  '@playwright/test': 'sha512-vSMYtL/zOcFpvJCW71Q/OEGQb7KYBPAdKh35WNSkaZA75JlAO8ED8UN6GUNTm3drWomcbcqRPFqQbLae8yBTdg==',
  playwright: 'sha512-aFi5B0WovBHTEvpM3DzXTUaeN6eN0qWnTkKx4NQaH4Wvcmc153PdaY2UBdSYKaGYw+UyWXSVyxDUg5DoPEttjw==',
  'playwright-core': 'sha512-hutraynyn31F+Bifme+Ps9Vq59hKuUCz7H1kDOcBs+2oGguKkWTU50bBWrtz34OUWmIwpBTWDxaRPXrIXkgvmQ=='
};
for (const [name, expected] of Object.entries(PACKAGES)) {
  replaceExactly(expected.newIntegrity, oldPnpmIntegrity[name]);
  replaceExactly(`${name}@1.57.0`, `${name}@1.56.1`, 2);
}
replaceExactly('      playwright: 1.57.0', '      playwright: 1.56.1');
replaceExactly('      playwright-core: 1.57.0', '      playwright-core: 1.56.1');
assert.equal(sha(pnpm), ORIGINAL['pnpm-lock.yaml'], 'Unallowlisted pnpm graph change');

for (const name of Object.keys(REVIEWED)) {
  const committed = execFileSync('git', ['-C', subject, 'show', `HEAD:${name}`], { encoding: 'utf8' });
  const expectedCommit = source === 'baseline' ? ORIGINAL[name] : REVIEWED[name];
  assert.equal(sha(committed), expectedCommit, `Wrong ${source} committed ${name}`);
  const effective = readFileSync(resolve(subject, name), 'utf8');
  assert.equal(effective, phase === 'before' ? committed : reviewed[name], `Unexpected ${phase}-overlay ${name}`);
}
console.log(JSON.stringify({
  source, phase, playwright: '1.57.0',
  originalManifestSha256: ORIGINAL, effectiveReviewedManifestSha256: REVIEWED,
  allowedNpmNodes: Object.keys(PACKAGES).map(name => `node_modules/${name}`),
  unchangedProductionEntries: Object.entries(lock.packages).filter(([name, item]) => name && !item.dev).length,
  effectiveManifestsIdentical: phase === 'after'
}, null, 2));
