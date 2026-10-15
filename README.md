# Family Hub (working name)

A family organizer for our house. The iPhone app runs everything, and a kitchen display with a physical dial comes in phase 2.
The look is 1950s mid-century: cream, pink and mint.

This repo is **phase 1: the iPhone app plus its backend.**

| Area | What works in phase 1 |
|---|---|
| Home | Patrick's daycare runs for today, what's up next, chore progress, and tonight's dinner (editable). |
| Calendar | Week strip, filter by person, and day agenda. Add, edit or delete events, tag people, and tagged adults get Google Calendar invites. |
| Daycare runs | A weekly default (Aaron drops off, Makala picks up). Tap a name to swap it to Makala, Jay & Peggy, or Ron & Autumn. The moon button sets up a sleepover, which hands that night's pickup and the next drop-off to the grandparents. Long-press a day to mark daycare closed. |
| Chores | Per-person daily chores with points. |
| Lists | Groceries grouped by store. Scan a barcode or type an item. The app learns which store each item usually comes from. |
| Sync | Every phone updates live (Supabase Realtime). |

**Demo mode:** if there's no `Secrets.plist`, the app runs on sample data stored only on that phone. Use it to try the app before any backend exists.

---

## 1. Run it on your iPhone (demo mode)

You need a Mac with **Xcode 16.3 or newer** (the Supabase Swift package requires it), and your Apple Developer account.

```bash
brew install xcodegen
cd ios
xcodegen generate          # creates FamilyHub.xcodeproj from project.yml
open FamilyHub.xcodeproj
```

In Xcode:

1. Select the **FamilyHub** target, open **Signing & Capabilities**, and pick your Team.
2. Plug in your iPhone and choose it as the run destination, then press **Run**.

The Supabase Swift package downloads on the first build.
Re-run `xcodegen generate` whenever you add, remove or rename files.

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
   Xcode turns this on automatically through the entitlement.
2. In Supabase, go to **Authentication → Providers → Apple**. Enable it and add `com.amcgrean.familyhub` under **Client IDs**.
   Native iOS sign-in doesn't need a Services ID or secret key.

### Point the app at it

Copy `ios/FamilyHub/Resources/Secrets.example.plist` to `Secrets.plist` in the same folder, then fill in:

- **SupabaseURL:** your project URL.
- **SupabaseAnonKey:** the anon or publishable key.

Run `xcodegen generate` again, then build.

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

`upc-lookup` checks the cache first. On a miss it tries **Open Food Facts** (free, strong on groceries), then UPCitemdb's free trial endpoint (household and pet items, about 100 lookups a day). Every result, including misses, is cached in `products`, so each barcode is fetched only once.
If neither source knows the item, the scan screen asks you to type a name. The barcode then remembers that name and its store.

**How store learning works:**

- Picking a store for an item counts as one trip to that store.
- Clearing a checked-off item counts as a purchase there.
- New items go to whichever store has the most trips for that item.

## Project layout

```
ios/
  project.yml                 XcodeGen spec (iOS 17+, Supabase Swift package)
  FamilyHub/
    App/                      app entry, auth gate, tabs
    Theme/                    palette, fonts, shared components
    Models/                   Codable models matching the tables, date helpers
    Services/                 Repository protocol, Demo + Supabase implementations, auth
    State/HouseholdStore.swift   all app state and the daycare/learning rules
    Features/                 Home, Calendar (+ event editor, daycare runs), Chores, Lists (+ scanner), Settings, Onboarding
    Resources/Fonts/          Josefin Sans + Pacifico (SIL Open Font License)
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
