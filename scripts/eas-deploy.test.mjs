// Run with: node --test scripts/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  flag,
  parseBuildList,
  parsePlatforms,
  parseRuntimeVersion,
  updateMessage,
  usableBuild,
  withIosSubmitConfig,
} from './eas-deploy-lib.mjs';

test('usableBuild finds a finished or running build for the runtime', () => {
  const builds = [
    { id: 'a', status: 'ERRORED', runtimeVersion: 'r1' },
    { id: 'b', status: 'CANCELED', runtimeVersion: 'r1' },
    { id: 'c', status: 'IN_QUEUE', runtimeVersion: 'r1' },
    { id: 'd', status: 'FINISHED', runtimeVersion: 'r1' },
  ];
  assert.equal(usableBuild(builds, 'r1')?.id, 'c');
});

test('usableBuild ignores failed builds so the next deploy retries', () => {
  const builds = [
    { id: 'a', status: 'ERRORED', runtimeVersion: 'r1' },
    { id: 'b', status: 'canceled', runtimeVersion: 'r1' },
  ];
  assert.equal(usableBuild(builds, 'r1'), null);
});

test('usableBuild never matches a build from another runtime', () => {
  assert.equal(usableBuild([{ id: 'a', status: 'FINISHED', runtimeVersion: 'old' }], 'new'), null);
});

test('usableBuild handles empty and junk input', () => {
  assert.equal(usableBuild([], 'r1'), null);
  assert.equal(usableBuild(null, 'r1'), null);
  assert.equal(usableBuild([null, {}], 'r1'), null);
});

test('parseRuntimeVersion reads the expo-updates JSON, even after a log line', () => {
  assert.equal(parseRuntimeVersion('{"runtimeVersion":"abc123","fingerprintSources":[]}'), 'abc123');
  assert.equal(parseRuntimeVersion('warning: something\n{"runtimeVersion":"abc"}'), 'abc');
  assert.throws(() => parseRuntimeVersion(''), /No JSON/);
  assert.throws(() => parseRuntimeVersion('{"runtimeVersion":null}'), /no runtimeVersion/);
});

test('parseBuildList treats empty output as no builds', () => {
  assert.deepEqual(parseBuildList(''), []);
  assert.deepEqual(parseBuildList('[]'), []);
  assert.equal(parseBuildList('[{"id":"x"}]')[0].id, 'x');
  assert.throws(() => parseBuildList('nope'), /No JSON array/);
});

test('parsePlatforms', () => {
  assert.deepEqual(parsePlatforms(undefined), ['ios']);
  assert.deepEqual(parsePlatforms('all'), ['ios', 'android']);
  assert.deepEqual(parsePlatforms('iOS, android ios'), ['ios', 'android']);
  assert.throws(() => parsePlatforms('web'), /Unknown platform/);
});

test('flag', () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) assert.equal(flag(v), true);
  for (const v of [undefined, '', '0', 'false', 'no']) assert.equal(flag(v), false);
});

test('withIosSubmitConfig fills in App Store details without touching the original', () => {
  const original = { build: { production: {} }, submit: { production: {} } };
  const next = withIosSubmitConfig(original, 'production', {
    ascAppId: 1234567890,
    keyPath: '/tmp/key.p8',
    keyId: 'KEY',
    issuerId: 'ISSUER',
  });
  assert.deepEqual(next.submit.production.ios, {
    ascAppId: '1234567890',
    ascApiKeyPath: '/tmp/key.p8',
    ascApiKeyId: 'KEY',
    ascApiKeyIssuerId: 'ISSUER',
  });
  assert.deepEqual(original.submit.production, {});
});

test('withIosSubmitConfig keeps committed values when secrets are missing', () => {
  const next = withIosSubmitConfig({ submit: { production: { ios: { ascAppId: '42' } } } }, 'production', {});
  assert.deepEqual(next.submit.production.ios, { ascAppId: '42' });
  // A key path without its id is useless to EAS, so it is not written.
  const half = withIosSubmitConfig({}, 'production', { keyPath: '/tmp/k.p8' });
  assert.deepEqual(half.submit.production.ios, {});
});

test('updateMessage uses the first non-empty line', () => {
  assert.equal(updateMessage('\n  Fix the pantry  \n\nlong body'), 'Fix the pantry');
  assert.equal(updateMessage(''), 'Automatic update');
  assert.equal(updateMessage('x'.repeat(300)).length, 200);
});

test('updateMessage uses the PR title for GitHub merge commits', () => {
  assert.equal(
    updateMessage('Merge pull request #3 from amcgrean/some-branch\n\nAdd pantry expiry dates'),
    'Add pantry expiry dates',
  );
  assert.equal(updateMessage('Merge pull request #3 from amcgrean/some-branch'), 'Merge pull request #3 from amcgrean/some-branch');
});
