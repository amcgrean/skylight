import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Over-the-air updates (EAS Update). Every merge to main publishes one
// (.github/workflows/deploy.yml). By default expo-updates downloads it in the
// background and only applies it on the *next* launch, and iOS keeps apps suspended
// for days, so a fix could take a week to show up. Instead:
//
//   - On a cold start, the splash screen waits briefly while a new update is fetched,
//     then the app reloads into it before anyone sees the old version.
//   - When the app comes back after a long time in the background, it checks again
//     and reloads if something new was downloaded. Nothing is mid-edit after an hour
//     away, and the data reloads from the database anyway.
//
// app.json sets "checkAutomatically": "NEVER" so the native layer doesn't download the
// same update in parallel; this file owns all the checking.
//
// Every step has a time limit, so a slow or missing connection only means the app
// opens on the version it already has.

const CHECK_TIMEOUT_MS = 4_000;
const FETCH_TIMEOUT_MS = 20_000;
/** How long the app must have been in the background before a resume reloads it. */
export const RESUME_RELOAD_AFTER_MS = 60 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** False in Expo Go and dev builds, where updates come from the dev server instead. */
export function updatesEnabled(): boolean {
  return !__DEV__ && Updates.isEnabled;
}

/**
 * Downloads a newer update if there is one. Returns true when one was downloaded and
 * the app should reload into it. Never throws.
 */
export async function fetchNewUpdate(): Promise<boolean> {
  if (!updatesEnabled()) return false;
  try {
    const check = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
    if (check === 'timeout' || !check.isAvailable) return false;
    const fetched = await withTimeout(Updates.fetchUpdateAsync(), FETCH_TIMEOUT_MS);
    return fetched !== 'timeout' && fetched.isNew;
  } catch {
    return false;
  }
}

/** Fetches and applies a new update. Returns only if there was nothing to apply. */
export async function applyNewUpdate(): Promise<void> {
  if (await fetchNewUpdate()) {
    try {
      await Updates.reloadAsync();
    } catch {
      // A failed reload leaves the downloaded update in place for the next launch.
    }
  }
}

/** For Settings: which build and which update this phone is running. */
export function versionLabel(): string {
  const app = Constants.expoConfig?.version ?? '?';
  if (!updatesEnabled()) return `${app} (development)`;
  const id = Updates.updateId;
  const update = Updates.isEmbeddedLaunch || !id ? 'as installed, no update yet' : `update ${id.slice(0, 8)}`;
  const date = Updates.createdAt ? `, ${Updates.createdAt.toLocaleDateString()}` : '';
  return `${app} · ${update}${date}`;
}
