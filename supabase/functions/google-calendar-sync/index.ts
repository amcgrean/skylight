// Pushes a Family Hub event to the shared family Google Calendar and invites the
// tagged adults (members with an email). Grandparents, Patrick and Pets are tagged
// in the description only — they never get invites.
//
// Body: { "event_id": "<uuid>", "action": "upsert" | "delete" }
// Runs as the calling user, so row-level security limits it to their household.
//
// Secrets (supabase secrets set ...):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID
// If any are missing the event is marked sync_status = 'skipped' and the app works anyway.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, env, json } from "../_shared/http.ts";

type Member = { id: string; name: string; email: string | null; kind: string };
type EventRow = {
  id: string;
  household_id: string;
  title: string;
  note: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  google_event_id: string | null;
  households: { timezone: string } | null;
  event_tags: { members: Member | null }[];
};

const GOOGLE_API = "https://www.googleapis.com/calendar/v3";

async function googleAccessToken(): Promise<string | null> {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  const refreshToken = env("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

function dateOnly(iso: string, timeZone: string): string {
  // YYYY-MM-DD in the household's time zone
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function googleBody(ev: EventRow) {
  const tz = ev.households?.timezone ?? "America/Chicago";
  const members = ev.event_tags.map((t) => t.members).filter((m): m is Member => !!m);
  const attendees = members
    .filter((m) => m.kind === "adult" && m.email)
    .map((m) => ({ email: m.email!, displayName: m.name }));
  const tagged = members.map((m) => m.name).join(", ");
  const description = [ev.note ?? "", tagged ? `Tagged: ${tagged}` : "", "Added from Family Hub"]
    .filter((s) => s.length > 0)
    .join("\n\n");

  let start: Record<string, string>;
  let end: Record<string, string>;
  if (ev.all_day) {
    const s = dateOnly(ev.starts_at, tz);
    const e = ev.ends_at ? dateOnly(ev.ends_at, tz) : s;
    start = { date: s };
    end = { date: addDays(e, 1) }; // Google's all-day end date is exclusive
  } else {
    const endIso = ev.ends_at ?? new Date(new Date(ev.starts_at).getTime() + 60 * 60 * 1000).toISOString();
    start = { dateTime: ev.starts_at, timeZone: tz };
    end = { dateTime: endIso, timeZone: tz };
  }

  return { summary: ev.title, description, start, end, attendees, guestsCanModify: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let payload: { event_id?: string; action?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Expected a JSON body" }, 400);
  }
  const eventId = payload.event_id;
  const action = payload.action ?? "upsert";
  if (!eventId || !["upsert", "delete"].includes(action)) {
    return json({ error: "event_id and action (upsert|delete) are required" }, 400);
  }

  const supabase = createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  const { data: ev, error } = await supabase
    .from("events")
    .select("id, household_id, title, note, starts_at, ends_at, all_day, google_event_id, households(timezone), event_tags(members(id, name, email, kind))")
    .eq("id", eventId)
    .maybeSingle<EventRow>();

  if (error) return json({ error: error.message }, 500);
  if (!ev) return json({ error: "Event not found" }, 404);

  const calendarId = env("GOOGLE_CALENDAR_ID");
  let token: string | null = null;
  try {
    token = calendarId ? await googleAccessToken() : null;
  } catch (e) {
    await supabase.from("events").update({ sync_status: "error", sync_error: String(e) }).eq("id", ev.id);
    return json({ status: "error", error: String(e) }, 502);
  }

  // ---- delete -------------------------------------------------------------
  if (action === "delete") {
    if (token && ev.google_event_id) {
      const res = await fetch(
        `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId!)}/events/${encodeURIComponent(ev.google_event_id)}?sendUpdates=all`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        return json({ status: "error", error: `Google delete failed (${res.status})` }, 502);
      }
    }
    const { error: delErr } = await supabase.from("events").delete().eq("id", ev.id);
    if (delErr) return json({ error: delErr.message }, 500);
    return json({ status: "deleted" });
  }

  // ---- upsert -------------------------------------------------------------
  if (!token) {
    await supabase.from("events").update({ sync_status: "skipped", sync_error: null }).eq("id", ev.id);
    return json({ status: "skipped", reason: "Google Calendar is not configured" });
  }

  const body = googleBody(ev);
  const base = `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId!)}/events`;
  const url = ev.google_event_id
    ? `${base}/${encodeURIComponent(ev.google_event_id)}?sendUpdates=all`
    : `${base}?sendUpdates=all`;

  const res = await fetch(url, {
    method: ev.google_event_id ? "PUT" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = `Google ${res.status}: ${(await res.text()).slice(0, 300)}`;
    await supabase.from("events").update({ sync_status: "error", sync_error: msg }).eq("id", ev.id);
    return json({ status: "error", error: msg }, 502);
  }

  const g = await res.json();
  await supabase
    .from("events")
    .update({ google_event_id: g.id, sync_status: "synced", sync_error: null })
    .eq("id", ev.id);

  return json({ status: "synced", google_event_id: g.id, invited: body.attendees.map((a) => a.email) });
});
