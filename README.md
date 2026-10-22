# Family Hub (working name)

A family organizer for our house. The iPhone app runs everything, and a kitchen display with a physical dial comes in phase 2.
The look is 1950s mid-century: cream, pink and mint.

This repo is **phase 1: the phone app plus its backend.** The app is built with [Expo](https://expo.dev) (React Native + TypeScript), so it builds for iPhone without needing Xcode on your own machine. Demo mode also runs on Android; live mode needs Sign in with Apple, which is iPhone-only.

| Area | What works in phase 1 |
|---|---|
| Home | Patrick's daycare runs for today, what's up next, chore progress, and tonight's dinner (editable). |
| Calendar | Week strip, filter by person, and day agenda. Add, edit or delete events, tag people, and tagged adults get Google Calendar invites. |
| Daycare runs | A weekly default (Aaron drops off, Makala picks up). Tap a name to swap it to Makala, Jay & Peggy, or Ron & Autumn. The moon button sets up a sleepover, which hands that night's pickup and the next drop-off to the grandparents. Long-press a day to mark daycare closed. |
| Chores | Per-person daily chores with points. |
| Lists | Groceries grouped by store. Scan a barcode or type an item. The app learns which store each item usually comes from. |
| Pantry | What's on hand at home. Scan things in as you put them away (scanning again adds one more), tap − as you use them, and send anything that runs out to the grocery list. |
| Sync | Every phone updates live (Supabase Realtime). |

**Demo mode:** if the Supabase keys aren't set, the app runs on sample data stored only on that phone. Use it to try the app before any backend exists.

---

## 1. Try it on your phone (demo mode)

You need [Node.js](https://nodejs.org) 20 or newer and the **Expo Go** app from the App Store.

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with the iPhone camera, and the app opens in Expo Go with sample data.
Everything works in Expo Go, including the barcode scanner.

Handy checks while working on it: `npm run typecheck` and `npm run lint`.

## 2. Build the real app (EAS)

Live mode with Sign in with Apple needs the app's own bundle ID, `com.amcgrean.familyhub`, so it needs a real build instead of Expo Go.
[EAS Build](https://docs.expo.dev/build/introduction/) does this in the cloud with your Apple Developer account. No Mac is required.

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init                                  # links the project to your Expo account (adds its id to app.json)
npx eas-cli@latest build --profile development --platform ios
```

- **`development`** builds a dev client. Install it on your phone, then run `npx expo start` and it loads your latest code.
- **`preview`** builds a standalone app for the family's phones. Register them with `npx eas-cli@latest device:create`.
- **`production`** builds for TestFlight and the App Store. Upload it with `npx eas-cli@latest submit -p ios`.

EAS sets up certificates, the provisioning profile and the Sign in with Apple capability for you the first time.

## 2. Go live with Supabase

### Database

1. Create a new Supabase project, for example `family-hub`. Keep it separate from Keel and LiveEdge.
2. Apply the schema. Either option works:
   - **CLI:** `supabase link --project-ref <ref>` then `supabase db push`.
   - **SQL editor:** paste in `supabase/migrations/20261013000000_init.sql`.
3. Open `supabase/seed.sql` and put in Aaron's and Makala's emails. Run it in the SQL editor.
   It prints the **household code**. Settings in the app shows it too.

### Sign in with Apple

1. In the Apple Developer portal, the App ID `com.amcgrean.familyhub` needs **Sign in with Apple**.
   EAS Build turns this on automatically (`usesAppleSignIn` in `mobile/app.json`).
2. In Supabase, go to **Authentication → Providers → Apple**. Enable it and add `com.amcgrean.familyhub` under **Client IDs**.
   Native iOS sign-in doesn't need a Services ID or secret key.

### Point the app at it

Copy `mobile/.env.example` to `mobile/.env`, then fill in:

- **EXPO_PUBLIC_SUPABASE_URL:** your project URL.
- **EXPO_PUBLIC_SUPABASE_ANON_KEY:** the anon or publishable key.

Restart `npx expo start` to pick them up.
For EAS builds, add the same two values as [EAS environment variables](https://docs.expo.dev/eas/environment-variables/), since `.env` is git-ignored and isn't uploaded.
Both values are safe to ship in the app: row-level security protects the data.

### First sign-in

Each adult signs in with Apple, enters the household code, and taps their own name. That links the account. After that, the database only shows each phone this household's data, enforced by row-level security.

## 3. Google Calendar invites

The hub writes every event you add to **one shared family Google Calendar**. It adds the tagged adults as attendees, so Google emails them invites. Grandparents, Patrick and Pets are only named in the event description.
If this step is skipped, events still save. They're marked "skipped" and nobody gets an invite.

1. **Choose the account.** Pick the Google account that will own the family calendar. A dedicated household account is cleanest.
   In Google Calendar, create a calendar called **Family**.
   Copy its **Calendar ID** from Settings → Integrate calendar.
2. **Set up the API.** In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
3. **Set up the OAuth consent screen:**
   - User type: External. Add the owning account as a test user.
   - Then click **Publish app** to put it in production.
   - ⚠️ An app left in "Testing" gets refresh tokens that expire after 7 days. An unverified production app is fine for a personal app with a handful of users. You'll click through one warning screen once.
4. **Create an OAuth client** (type: Web application). Add `https://developers.google.com/oauthplayground` as a redirect URI.
5. **Get a refresh token** from the [OAuth Playground](https://developers.google.com/oauthplayground):
   - Gear icon → **Use your own OAuth credentials**, and paste the client ID and secret.
   - Authorize the scope `https://www.googleapis.com/auth/calendar.events` while signed in as the owning account.
   - Exchange the code for tokens and copy the **refresh token**.
6. **Store the secrets and deploy:**

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  GOOGLE_REFRESH_TOKEN=... \
  GOOGLE_CALENDAR_ID=...@group.calendar.google.com

supabase functions deploy google-calendar-sync
supabase functions deploy upc-lookup
```

Both functions require a signed-in user; that's the platform default.
To see the family calendar on her iPhone, Makala can subscribe to it, or the owning account can share it with her Google account.

## 4. Barcode lookups

When you scan a barcode, the app checks three places in order:

1. **Names your family typed.** Store brands like Aldi's are often in no database. The first time you scan one, type what it is. Every phone remembers that barcode from then on (the `household_products` table).
2. **The `upc-lookup` cache** (`products`), so each barcode is fetched from the internet only once.
3. **Free public databases:** Open Food Facts, Open Products Facts, Open Pet Food Facts and Open Beauty Facts, all asked at once, then UPCitemdb's free trial (about 100 lookups a day). None of them needs an API key.

A barcode nobody knows is cached as unknown for 3 days. If a source times out or is rate-limited, the miss isn't cached, so the next scan tries again.

After pulling these changes, apply the new migration and redeploy the function:

```bash
supabase db push
supabase functions deploy upc-lookup
```

The migration also clears the old cached misses, so barcodes that failed before get looked up again.
To test the lookup code: `deno test supabase/functions/_shared/products_test.ts`.

**How store learning works:**

- Picking a store for an item counts as one trip to that store.
- Clearing a checked-off item counts as a purchase there.
- New items go to whichever store has the most trips for that item.

## Project layout

```
mobile/                       Expo app (SDK 57, Expo Router, TypeScript)
  app.json                    app config: bundle ID, permissions, Sign in with Apple
  eas.json                    EAS Build profiles (development, preview, production)
  .env.example                Supabase URL + anon key (copy to .env)
  src/
    app/                      screens (Expo Router): auth gate, tabs, event editor, scanner, settings
    components/               shared UI (cards, pills, buttons), daycare runs card, date field
    lib/                      row types matching the tables, date helpers, Supabase client
    services/                 Repository interface, Demo + Supabase implementations
    state/                    household store (all app state + daycare/learning rules), auth, selectors
    theme/                    palette and fonts
  assets/fonts/               Josefin Sans + Pacifico (SIL Open Font License)
docs/
  kitchen-display-brief.md    original Skylight web-dashboard brief (phase 2 input)
supabase/
  migrations/                 schema, row-level security, RPCs, realtime
  seed.sql                    our household: members, daycare pattern, stores, chores
  functions/                  google-calendar-sync, upc-lookup
```

## Roadmap

**Phase 2 — kitchen display**

The original Skylight web-dashboard brief for this repo is in [`docs/kitchen-display-brief.md`](docs/kitchen-display-brief.md). It covers the iPad/kiosk layout, PWA setup and weather requirements, and it's the starting point for this phase.

- **Screen:** A Raspberry Pi 5 running the display as a full-screen web page, plus a USB or Bluetooth dial that sends arrow and Enter keys.
- **Data:** It reads this same database.
- **Remote control:** A new `display_remote` table holds who has the remote, renewed by a heartbeat and expiring after 2 minutes idle. Turning the dial clears it.
- **Phone side:** The phone app gets a **Display** tab with a live mirror, Take/Release remote, and the shared display settings (which views show, photo folder, how often photos change, weather, idle behavior, night dimming).
- **Photos:** Added from the phone's share sheet and stored in Supabase Storage.
- **Weather:** WeatherKit's web API, called from the backend.

**Phase 3 — automation**

- **Family inbox:** Cloudflare Email Routing to a Worker that pulls events out of each email. `.ics` attachments are parsed directly, and anything uncertain goes to a "Needs a look" queue.
- **Personal calendars:** Aaron's Google calendar and Makala's iCloud (through CalDAV) shown read-only.
- **Store learning by location:** Record which store you're in when you check items off.
- **Push notifications:** For daycare swaps and taking over the remote.
