// Pure helpers for scripts/eas-deploy.mjs, kept separate so they can be unit tested
// without running any EAS command (scripts/eas-deploy.test.mjs).

/** Build states that mean "a binary for this runtime exists or is on its way". */
const USABLE_BUILD_STATUSES = new Set(['FINISHED', 'IN_PROGRESS', 'IN_QUEUE', 'NEW', 'PENDING_CANCEL']);

/**
 * Picks the build that already covers a runtime version, if any.
 * `builds` is the JSON array printed by `eas build:list --json`. A build that errored
 * or was cancelled doesn't count, so a failed build is retried on the next deploy.
 * PENDING_CANCEL counts as usable on purpose: someone is cancelling it by hand, and
 * starting a second build behind their back would be surprising.
 */
export function usableBuild(builds, runtimeVersion) {
  if (!Array.isArray(builds)) return null;
  return (
    builds.find(
      (b) =>
        b &&
        USABLE_BUILD_STATUSES.has(String(b.status ?? '').toUpperCase()) &&
        (runtimeVersion == null || b.runtimeVersion == null || b.runtimeVersion === runtimeVersion),
    ) ?? null
  );
}

/** Parses the JSON that `expo-updates runtimeversion:resolve` prints. */
export function parseRuntimeVersion(stdout) {
  const text = String(stdout ?? '').trim();
  // The command prints one JSON object; tolerate a stray log line before it.
  const start = text.indexOf('{');
  if (start < 0) throw new Error(`No JSON in runtimeversion output: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(start));
  const rv = parsed?.runtimeVersion;
  if (typeof rv !== 'string' || !rv) throw new Error('runtimeversion output has no runtimeVersion');
  return rv;
}

/** Parses `eas build:list --json`, which prints an array (or nothing when empty). */
export function parseBuildList(stdout) {
  const text = String(stdout ?? '').trim();
  if (!text) return [];
  const start = text.indexOf('[');
  if (start < 0) throw new Error(`No JSON array in build:list output: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(start));
  if (!Array.isArray(parsed)) throw new Error('build:list output is not an array');
  return parsed;
}

/** "ios,android" / "all" / "" -> ['ios', 'android'] etc. Unknown names throw. */
export function parsePlatforms(value) {
  const raw = String(value ?? '').trim().toLowerCase() || 'ios';
  const list = raw === 'all' ? ['ios', 'android'] : raw.split(/[\s,]+/).filter(Boolean);
  for (const p of list) {
    if (p !== 'ios' && p !== 'android') throw new Error(`Unknown platform "${p}" (use ios, android or all)`);
  }
  return [...new Set(list)];
}

/** Truthy env flag: "1", "true", "yes", "on". */
export function flag(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

/**
 * Returns a copy of eas.json with the App Store Connect details for one submit profile
 * filled in. Values that are missing stay as they are, so anything already committed
 * to eas.json (for example a hard-coded ascAppId) keeps working.
 */
export function withIosSubmitConfig(easJson, profile, { ascAppId, keyPath, keyId, issuerId } = {}) {
  const next = structuredClone(easJson ?? {});
  next.submit ??= {};
  next.submit[profile] ??= {};
  const ios = { ...(next.submit[profile].ios ?? {}) };
  if (ascAppId) ios.ascAppId = String(ascAppId);
  if (keyPath && keyId) {
    ios.ascApiKeyPath = keyPath;
    ios.ascApiKeyId = keyId;
    if (issuerId) ios.ascApiKeyIssuerId = issuerId;
  }
  next.submit[profile].ios = ios;
  return next;
}

/**
 * A short label for the update, from the commit message. GitHub's merge commits start
 * with "Merge pull request #N from branch", which says nothing, so for those the PR
 * title on the following line is used instead.
 */
export function updateMessage(raw, fallback = 'Automatic update') {
  const lines = String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const first = /^Merge (pull request|branch) /.test(lines[0] ?? '') && lines[1] ? lines[1] : lines[0];
  return (first || fallback).slice(0, 200);
}
