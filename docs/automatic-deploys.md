# Automatic deploys

Merging a pull request into `main` ships it. Nobody runs `supabase` or `eas` commands by hand.

| What changed in the PR | What happens after the merge |
|---|---|
| `supabase/migrations/**` | New migrations are pushed to the database. |
| `supabase/functions/**` | Every edge function is redeployed. |
| `mobile/**` (screens, logic, styles) | An over-the-air update is published. Phones get it the next time the app opens. |
| `mobile/**` that changes native code (a new package, a permission, `app.json`, `eas.json`) | A new EAS Build starts, and if TestFlight submission is set up it goes there too. The update is also published, but only phones on the new build receive it. |

The workflow is `.github/workflows/deploy.yml`. The database goes first, so an app version never reaches phones before the tables it needs.
Pull requests are checked by `.github/workflows/ci.yml`: app typecheck and lint, edge function type check and tests, and the deploy script's tests.

### How the app decides between an update and a build

The app's runtime version is a **fingerprint** of everything native: installed packages, `app.json`, config plugins and `eas.json`.
An over-the-air update only reaches phones whose installed build has the same fingerprint.
On every deploy, `scripts/eas-deploy.mjs` computes the fingerprint and asks EAS whether a build for it already exists:

- **It exists:** only the update is published. This takes about a minute.
- **It doesn't:** a new build starts (about 15–25 minutes on EAS). It is sent to TestFlight if `IOS_AUTO_SUBMIT` is on. Phones keep running the last good version until someone installs the new build.

A build that failed or was cancelled doesn't count, so the next deploy tries again.

### How phones pick up updates

When the app opens, the splash screen waits up to a few seconds while any new update downloads, then reloads into it (`mobile/src/lib/updates.ts`).
After the app has been in the background for an hour or more, it checks again when it comes back.
With no connection, the app opens on the version it already has.
**Settings** shows the version at the bottom, for example `0.1.0 · update 1a2b3c4d, 10/23/2026`. If it says `as installed, no update yet`, that phone hasn't applied an update.

---

## One-time setup

Add everything below under **GitHub → Settings → Secrets and variables → Actions**.
Until a secret exists, the matching deploy job prints a yellow warning and skips. Nothing fails.

### 1. Supabase (database + edge functions)

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → **Access Tokens** → Generate new token. |
| `SUPABASE_PROJECT_REF` | The Family Hub project's ID: the part before `.supabase.co` in its URL (Project Settings → General). |
| `SUPABASE_DB_PASSWORD` | The database password chosen when the project was created. You can reset it under Project Settings → Database. |

**The first run must record the migrations already applied by hand.** Both current migrations were pasted into the SQL editor, so Supabase's migration history doesn't know about them.
Without this step, the first push tries to create the tables again and stops.
Nothing is changed when it stops.

1. Go to **Actions → Deploy → Run workflow**.
2. Set **target** to `backend` and **mark_applied** to `20261013000000 20261022000000`.
3. Click **Run workflow**.

After that, the database and functions deploy on every merge that touches `supabase/`.
Edge function secrets such as the `GOOGLE_*` values aren't part of this and stay in Supabase (`supabase secrets set`).

### 2. Expo (app updates)

| Secret | Where to get it |
|---|---|
| `EXPO_TOKEN` | expo.dev → Account settings → **Access tokens** → Create. Create an Expo account first if needed (free). |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same page: the `anon` / publishable key. |

Then go to **Actions → App setup → Run workflow** on `main`. It:

1. creates the Expo project and writes its ID into `mobile/app.json`;
2. points the app at its update server;
3. commits that change to `main`;
4. starts the first deploy, which starts the first build.

The two Supabase values are copied into EAS on every deploy. Builds and updates use them, so the app runs in live mode, not demo mode.

### 3. iPhone builds without anyone at the keyboard (recommended)

The first iOS build needs a signing certificate and a provisioning profile. EAS creates them, but only automatically if it has an App Store Connect API key.
Without the key, the first build fails with "credentials are not set up". In that case, run one build from your computer (`cd mobile && npx eas-cli@latest build -p ios --profile production`) and answer its questions; automatic builds work from then on.

To let CI do it instead:

1. App Store Connect → **Users and Access → Integrations → App Store Connect API → Team Keys** → **+**. Name it "Family Hub CI" and give it the **Admin** role.
2. Download the `.p8` file. Apple only allows this once.

| Secret | Value |
|---|---|
| `ASC_API_KEY_P8` | The whole contents of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` lines. |
| `ASC_API_KEY_ID` | The key's **Key ID**. |
| `ASC_API_KEY_ISSUER_ID` | The **Issuer ID** shown above the keys list. |
| `APPLE_TEAM_ID` | developer.apple.com → Account → Membership details → **Team ID**. |

### 4. Send new builds to TestFlight (optional)

1. In App Store Connect, go to **Apps → + → New App**. Choose iOS, name it Family Hub, and pick the bundle ID `com.amcgrean.familyhub`. (This step needs a person; Apple has no API for it.)
2. Open the app → **App Information**, and copy its **Apple ID** (a number). Save it as the secret `ASC_APP_ID`.
3. Under **Variables** (next to Secrets), add `IOS_AUTO_SUBMIT` = `true`.
4. In TestFlight, add the family as **internal testers**. After that, each new build shows up in their TestFlight app.

With this on, a deploy that needs a new build waits for it, about 20 minutes, then submits it.
An update-only deploy still takes about a minute.

### Android (later)

Deploys cover iOS only. Once there's an Android build, add the variable `APP_PLATFORMS` = `all`.

---

## Running a deploy by hand

**Actions → Deploy → Run workflow** offers:

- **target:** `everything`, `backend` or `app`.
- **force_build:** start a fresh app build even if one matches. Use it after changing build settings that aren't part of the fingerprint, for example an EAS environment variable used at build time.
- **mark_applied:** only for migrations applied by hand in the SQL editor (see step 1).

Every deploy run shows a short summary on its page: build or update, and the update message.

## When something goes wrong

- **A bad update went out.** Revert the PR on GitHub and merge the revert. That publishes the previous code as a new update. To roll back faster, run `cd mobile && npx eas-cli@latest update:rollback` and pick the update to go back to.
- **The app job says the app isn't linked.** Run **App setup** (step 2).
- **The migration push failed with "already exists".** See step 1 (`mark_applied`).
- **A phone isn't getting updates.** Check the version line in Settings. An update only reaches a build with the same fingerprint, so after a native change that phone needs the new build from TestFlight.
