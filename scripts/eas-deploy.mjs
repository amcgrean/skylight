#!/usr/bin/env node
// Ships the Expo app after a merge to main. Called by .github/workflows/deploy.yml.
//
// 1. Works out the app's runtime version (a fingerprint of everything native:
//    dependencies, app.json, plugins, eas.json).
// 2. If no build exists for that runtime yet, starts a new EAS Build. With
//    IOS_AUTO_SUBMIT on and App Store Connect details set, it waits for the iOS
//    build and sends it to TestFlight.
// 3. Always publishes an over-the-air update, so phones already on a matching build
//    get the new JavaScript the next time the app opens.
//
// A JavaScript-only change therefore costs one quick update. A native change (new
// package, new permission, app.json edit) also gets a fresh build automatically,
// and phones keep running the last good version until they install it.
//
// Settings (environment variables):
//   PLATFORMS        ios | android | all | "ios,android"           (default ios)
//   EAS_PROFILE      build/submit profile in eas.json              (default production)
//   EAS_BRANCH       update branch, same name as the channel       (default production)
//   EAS_ENVIRONMENT  EAS environment for env vars                  (default production)
//   UPDATE_MESSAGE   text shown on the update (first line used)
//   FORCE_BUILD      "true" builds even if one exists for this runtime
//   SKIP_UPDATE      "true" skips the over-the-air update
//   IOS_AUTO_SUBMIT  "true" waits for a new iOS build and submits it to TestFlight
//   ASC_APP_ID       App Store Connect app id (numbers), needed for submit
//   ASC_API_KEY_P8 / ASC_API_KEY_ID / ASC_API_KEY_ISSUER_ID
//                    App Store Connect API key; if unset, EAS uses the key it stores
//   EAS_BIN          eas command (default "eas", installed by expo-github-action)
//
// Usage: node scripts/eas-deploy.mjs   (from anywhere; it runs inside mobile/)

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  flag,
  parseBuildList,
  parsePlatforms,
  parseRuntimeVersion,
  updateMessage,
  usableBuild,
  withIosSubmitConfig,
} from './eas-deploy-lib.mjs';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mobile');
const EAS = process.env.EAS_BIN || 'eas';
const PROFILE = process.env.EAS_PROFILE || 'production';
const BRANCH = process.env.EAS_BRANCH || 'production';
const ENVIRONMENT = process.env.EAS_ENVIRONMENT || 'production';
const PLATFORMS = parsePlatforms(process.env.PLATFORMS);

function run(cmd, args, { capture = false } = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd: MOBILE,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${cmd} ${args[0]} exited with ${res.status}`);
  return capture ? res.stdout : '';
}

function runtimeVersionFor(platform) {
  const out = run('npx', ['expo-updates', 'runtimeversion:resolve', '--platform', platform], { capture: true });
  return parseRuntimeVersion(out);
}

function existingBuild(platform, runtimeVersion) {
  const out = run(
    EAS,
    [
      'build:list',
      '--platform', platform,
      '--build-profile', PROFILE,
      '--runtime-version', runtimeVersion,
      '--limit', '10',
      '--json',
      '--non-interactive',
    ],
    { capture: true },
  );
  return usableBuild(parseBuildList(out), runtimeVersion);
}

/** Starts a build. Returns the build id when it waited for the build to finish. */
function build(platform, { wait }) {
  const args = ['build', '--platform', platform, '--profile', PROFILE, '--non-interactive'];
  if (!wait) {
    run(EAS, [...args, '--no-wait']);
    return null;
  }
  const out = run(EAS, [...args, '--wait', '--json'], { capture: true });
  const builds = parseBuildList(out);
  return builds[0]?.id ?? null;
}

/**
 * Submits an iOS build to App Store Connect / TestFlight. eas.json is part of the
 * runtime fingerprint, so the App Store details are written into it only for the
 * length of this command and the original file is put back right after.
 */
function submitIos(buildId) {
  const easPath = path.join(MOBILE, 'eas.json');
  const original = readFileSync(easPath, 'utf8');
  const keyDir = mkdtempSync(path.join(tmpdir(), 'asc-'));
  try {
    let keyPath;
    if (process.env.ASC_API_KEY_P8 && process.env.ASC_API_KEY_ID) {
      keyPath = path.join(keyDir, `AuthKey_${process.env.ASC_API_KEY_ID}.p8`);
      writeFileSync(keyPath, process.env.ASC_API_KEY_P8.replace(/\\n/g, '\n'), { mode: 0o600 });
    }
    const patched = withIosSubmitConfig(JSON.parse(original), PROFILE, {
      ascAppId: process.env.ASC_APP_ID,
      keyPath,
      keyId: process.env.ASC_API_KEY_ID,
      issuerId: process.env.ASC_API_KEY_ISSUER_ID,
    });
    writeFileSync(easPath, `${JSON.stringify(patched, null, 2)}\n`);
    run(EAS, ['submit', '--platform', 'ios', '--profile', PROFILE, '--id', buildId, '--non-interactive', '--no-wait']);
  } finally {
    writeFileSync(easPath, original);
    rmSync(keyDir, { recursive: true, force: true });
  }
}

function main() {
  const forceBuild = flag(process.env.FORCE_BUILD);
  const autoSubmit = flag(process.env.IOS_AUTO_SUBMIT);
  const summary = [];

  for (const platform of PLATFORMS) {
    const runtimeVersion = runtimeVersionFor(platform);
    console.log(`\n${platform}: runtime version ${runtimeVersion}`);
    const found = forceBuild ? null : existingBuild(platform, runtimeVersion);
    if (found) {
      console.log(`${platform}: build ${found.id} (${found.status}) already covers this runtime, no new build needed.`);
      summary.push(`${platform}: update only (build ${found.id} matches)`);
      continue;
    }

    const submit = platform === 'ios' && autoSubmit;
    console.log(`${platform}: no build for this runtime yet, starting one${submit ? ' and submitting it to TestFlight' : ''}.`);
    const buildId = build(platform, { wait: submit });
    if (submit) {
      if (!buildId) throw new Error('The iOS build finished but its id could not be read, so it was not submitted.');
      submitIos(buildId);
      summary.push(`${platform}: new build ${buildId}, sent to TestFlight`);
    } else {
      summary.push(`${platform}: new build started`);
    }
  }

  if (flag(process.env.SKIP_UPDATE)) {
    summary.push('over-the-air update skipped');
  } else {
    const message = updateMessage(process.env.UPDATE_MESSAGE);
    const platformArg = PLATFORMS.length === 2 ? 'all' : PLATFORMS[0];
    run(EAS, [
      'update',
      '--branch', BRANCH,
      '--environment', ENVIRONMENT,
      '--platform', platformArg,
      '--message', message,
      '--non-interactive',
    ]);
    summary.push(`over-the-air update published to "${BRANCH}": ${message}`);
  }

  console.log(`\nDone:\n- ${summary.join('\n- ')}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### App deploy\n\n- ${summary.join('\n- ')}\n`, { flag: 'a' });
  }
}

try {
  main();
} catch (err) {
  console.error(`\neas-deploy failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
