// Pure read helpers over the household data. Components read the whole store with
// `useHub()` and pass it here, so nothing derived is cached and nothing goes stale.

import { at, atTime, dayKey, isSameDay, isoWeekday, startOfDay } from '../lib/day';
import {
  getsInvites,
  type Chore,
  type DaycareOverride,
  type DaycarePattern,
  type FamilyEvent,
  type GroceryItem,
  type GroceryStore,
  type HouseholdProduct,
  type Meal,
  type Member,
  type PantryItem,
  type StoreStat,
  type UUID,
} from '../lib/types';

export type HubData = {
  members: Member[];
  me: Member | null;
  events: FamilyEvent[];
  pattern: DaycarePattern[];
  overrides: Record<string, DaycareOverride>;
  chores: Chore[];
  completions: Set<string>; // "choreID|yyyy-MM-dd"
  stores: GroceryStore[];
  groceries: GroceryItem[];
  storeStats: StoreStat[];
  meals: Record<string, Meal>;
  householdProducts: Record<string, HouseholdProduct>; // by upc
  pantry: PantryItem[];
};

export type AgendaFilter = { kind: 'everyone' } | { kind: 'member'; id: UUID } | { kind: 'grandparents' };

export type AgendaItem = {
  id: string;
  start: Date | null; // null = all day
  title: string;
  note: string | null;
  tagIDs: UUID[];
  sourceLabel: string | null;
  event: FamilyEvent | null; // null for daycare runs
};

export type DaycareDay = {
  date: Date;
  key: string;
  drop: UUID | null;
  pick: UUID | null;
  sleepover: UUID | null;
  closed: boolean;
  note: string | null;
  dropTime: string;
  pickTime: string;
};

export type StoreSuggestion = { store: GroceryStore; trips: number; total: number };

// MARK: People

export const member = (s: HubData, id: UUID | null | undefined) => (id ? s.members.find((m) => m.id === id) : undefined);
export const family = (s: HubData) => s.members.filter((m) => m.kind !== 'grandparent');
export const adults = (s: HubData) => s.members.filter((m) => m.kind === 'adult');
export const grandparents = (s: HubData) => s.members.filter((m) => m.kind === 'grandparent');
export const child = (s: HubData) => s.members.find((m) => m.kind === 'child');
export const runners = (s: HubData) => [...adults(s), ...grandparents(s)];

export function names(s: HubData, ids: UUID[]): string {
  const people = ids.map((id) => member(s, id)).filter((m): m is Member => !!m);
  const kid = child(s);
  if (!kid || people.length <= 1 || !people.some((p) => p.id === kid.id)) {
    return people.map((p) => p.name).join(' + ');
  }
  const others = people.filter((p) => p.id !== kid.id).map((p) => p.name).join(' + ');
  return `${others} · ${kid.name}`;
}

export function leadColor(s: HubData, ids: UUID[]): string {
  const people = ids.map((id) => member(s, id)).filter((m): m is Member => !!m);
  const kid = child(s);
  if (kid && people.length > 1) {
    const other = people.find((p) => p.id !== kid.id);
    if (other) return other.color;
  }
  return people[0]?.color ?? '#F08A6C';
}

// MARK: Calendar

function sourceLabel(s: HubData, e: FamilyEvent): string | null {
  switch (e.source) {
    case 'inbox': return 'Auto · family inbox';
    case 'google': return 'Google Calendar';
    case 'icloud': return 'iCloud';
  }
  switch (e.sync_status) {
    case 'error': return 'Calendar sync failed';
    case 'synced': {
      const invited = e.tag_ids.map((id) => member(s, id)).filter((m): m is Member => !!m && getsInvites(m)).map((m) => m.name);
      return invited.length ? `Invited: ${invited.join(', ')}` : 'On family calendar';
    }
    default: return null;
  }
}

function matches(s: HubData, item: AgendaItem, filter: AgendaFilter): boolean {
  switch (filter.kind) {
    case 'everyone': return true;
    case 'member': return item.tagIDs.includes(filter.id);
    case 'grandparents': return item.tagIDs.some((id) => grandparents(s).some((g) => g.id === id));
  }
}

export function agenda(s: HubData, day: Date, filter: AgendaFilter = { kind: 'everyone' }): AgendaItem[] {
  const items: AgendaItem[] = s.events
    .filter((e) => isSameDay(new Date(e.starts_at), day))
    .map((e) => ({
      id: e.id, start: e.all_day ? null : new Date(e.starts_at), title: e.title, note: e.note,
      tagIDs: e.tag_ids, sourceLabel: sourceLabel(s, e), event: e,
    }));

  const d = daycare(s, day);
  if (d) {
    const kid = child(s) ? [child(s)!.id] : [];
    if (d.closed) {
      items.push({ id: `dc-closed-${d.key}`, start: null, title: 'Daycare closed', note: d.note, tagIDs: kid, sourceLabel: 'Daycare', event: null });
    } else {
      if (d.drop) {
        items.push({ id: `dc-drop-${d.key}`, start: atTime(d.dropTime, day), title: 'Daycare drop-off', note: null,
          tagIDs: [d.drop, ...kid], sourceLabel: 'Daycare run', event: null });
      }
      if (d.pick) {
        const host = member(s, d.sleepover);
        items.push({ id: `dc-pick-${d.key}`, start: atTime(d.pickTime, day), title: 'Daycare pickup',
          note: host ? `Straight to ${host.name}’s` : null, tagIDs: [d.pick, ...kid], sourceLabel: 'Daycare run', event: null });
      }
      const who = member(s, d.sleepover);
      if (d.sleepover && who) {
        items.push({ id: `dc-sleep-${d.key}`, start: at(18, 30, day), title: `Sleepover at ${who.name}’s`,
          note: 'Overnight bag + favorite blanket', tagIDs: [d.sleepover, ...kid], sourceLabel: 'Daycare run', event: null });
      }
    }
  }

  return items
    .filter((i) => matches(s, i, filter))
    .sort((a, b) => {
      if (!a.start && !b.start) return a.title.localeCompare(b.title);
      if (!a.start) return -1;
      if (!b.start) return 1;
      const diff = a.start.getTime() - b.start.getTime();
      return diff === 0 ? a.title.localeCompare(b.title) : diff;
    });
}

export function upNext(s: HubData, now = new Date()): AgendaItem | undefined {
  return agenda(s, now).find((i) => (i.start ?? new Date(0)) >= now);
}

// MARK: Daycare

export function patternFor(s: HubData, day: Date): DaycarePattern | undefined {
  return s.pattern.find((p) => p.weekday === isoWeekday(day));
}

export function daycare(s: HubData, day: Date): DaycareDay | null {
  const key = dayKey(day);
  const p = patternFor(s, day);
  const o = s.overrides[key];
  if (!p && !o) return null;
  return {
    date: startOfDay(day),
    key,
    drop: o ? o.drop_member : p?.drop_member ?? null,
    pick: o ? o.pick_member : p?.pick_member ?? null,
    sleepover: o?.sleepover_member ?? null,
    closed: o?.closed ?? false,
    note: o?.note ?? null,
    dropTime: p?.drop_time ?? '07:30:00',
    pickTime: p?.pick_time ?? '17:15:00',
  };
}

// MARK: Chores

export function choresDue(s: HubData, day: Date): Chore[] {
  const wd = isoWeekday(day);
  return s.chores.filter((c) => {
    switch (c.cadence) {
      case 'weekdays': return wd <= 5;
      case 'weekly': return c.weekday === wd;
      default: return true;
    }
  });
}

export const completionKey = (choreID: UUID, day: Date) => `${choreID}|${dayKey(day)}`;
export const isDone = (s: HubData, chore: Chore, day = new Date()) => s.completions.has(completionKey(chore.id, day));

// MARK: Groceries

export const store = (s: HubData, id: UUID | null | undefined) => (id ? s.stores.find((x) => x.id === id) : undefined);

export function suggestion(s: HubData, key: string): StoreSuggestion | null {
  const rows = s.storeStats.filter((r) => r.product_key === key);
  if (!rows.length) return null;
  const best = rows.reduce((a, b) => (b.trips > a.trips ? b : a));
  const st = store(s, best.store_id);
  if (!st) return null;
  return { store: st, trips: best.trips, total: rows.reduce((n, r) => n + r.trips, 0) };
}

export const groceriesLeft = (s: HubData) => s.groceries.filter((g) => !g.checked).length;

// MARK: Meals

export const meal = (s: HubData, day: Date) => s.meals[dayKey(day)];

export function cookLabel(s: HubData, m: Meal | undefined): string {
  if (!m) return 'Nothing planned yet';
  const cook = member(s, m.cook_member);
  return cook ? `${cook.name} cooks` : m.cook_label ?? '';
}

// MARK: Barcodes & pantry

/** The name the family gave this barcode, if any. */
export const rememberedName = (s: HubData, upc: string) => s.householdProducts[upc]?.name ?? null;

export const pantryItem = (s: HubData, key: string) => s.pantry.find((p) => p.product_key === key);

/** On-hand items first (A–Z), then the ones that ran out. */
export function pantrySorted(s: HubData): { onHand: PantryItem[]; out: PantryItem[] } {
  const byName = (a: PantryItem, b: PantryItem) => a.name.localeCompare(b.name);
  return {
    onHand: s.pantry.filter((p) => p.quantity > 0).sort(byName),
    out: s.pantry.filter((p) => p.quantity === 0).sort(byName),
  };
}
