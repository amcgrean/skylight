import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

import { addDays, at, dayKey, fmt, isSameDay, startOfDay } from '../lib/day';
import {
  errorMessage,
  productKey,
  type Chore,
  type DaycareOverride,
  type FamilyEvent,
  type GroceryItem,
  type Household,
  type Member,
  type PantryItem,
  type ProductInfo,
  type Snapshot,
  type UUID,
} from '../lib/types';
import type { Repository } from '../services/repository';
import {
  completionKey,
  daycare,
  family,
  grandparents,
  member,
  pantryItem,
  patternFor,
  rememberedName,
  runners,
  store as storeByID,
  suggestion,
  type DaycareDay,
  type HubData,
} from './selectors';

export type EventDraft = {
  existing: FamilyEvent | null;
  title: string;
  note: string;
  day: Date;
  time: Date;
  allDay: boolean;
  tagIDs: UUID[];
};

export function newDraft(day: Date, me: Member | null): EventDraft {
  return { existing: null, title: '', note: '', day, time: at(18, 0, day), allDay: false, tagIDs: me ? [me.id] : [] };
}

export function draftFor(e: FamilyEvent): EventDraft {
  const start = new Date(e.starts_at);
  return { existing: e, title: e.title, note: e.note ?? '', day: start, time: start, allDay: e.all_day, tagIDs: [...e.tag_ids] };
}

type HubState = HubData & {
  repo: Repository | null;
  household: Household | null;
  hasLoaded: boolean;
  loadError: string | null;
  toast: string | null;
  calendarDay: Date;
  editorDraft: EventDraft | null;

  isDemo: () => boolean;
  start: (repo: Repository) => Promise<void>;
  reset: () => void;
  load: () => Promise<void>;
  flash: (message: string) => void;
  setCalendarDay: (day: Date) => void;
  openEditor: (draft: EventDraft) => void;

  saveEvent: (draft: EventDraft) => Promise<void>;
  deleteEvent: (event: FamilyEvent) => Promise<void>;

  cycleDrop: (day: Date) => Promise<void>;
  cyclePick: (day: Date) => Promise<void>;
  cycleSleepover: (day: Date) => Promise<void>;
  toggleClosed: (day: Date) => Promise<void>;

  toggleChore: (chore: Chore, day?: Date) => Promise<void>;

  addGrocery: (name: string, upc?: string | null, storeID?: UUID | null) => Promise<void>;
  setStore: (item: GroceryItem, storeID: UUID) => Promise<void>;
  toggleGrocery: (item: GroceryItem) => Promise<void>;
  clearChecked: () => Promise<void>;
  lookup: (upc: string) => Promise<ProductInfo | null>;
  rememberName: (upc: string, name: string) => Promise<void>;

  addToPantry: (name: string, upc?: string | null, count?: number) => Promise<PantryItem | null>;
  adjustPantryItem: (item: PantryItem, delta: number) => Promise<void>;
  removePantryItem: (item: PantryItem) => Promise<void>;

  setMeal: (day: Date, title: string, cook: UUID | null, label: string | null) => Promise<void>;
  updateEmail: (m: Member, email: string) => Promise<boolean>;
};

const empty: HubData & Pick<HubState, 'household' | 'hasLoaded' | 'loadError' | 'toast' | 'editorDraft'> = {
  household: null,
  me: null,
  members: [],
  events: [],
  pattern: [],
  overrides: {},
  chores: [],
  completions: new Set(),
  stores: [],
  groceries: [],
  storeStats: [],
  meals: {},
  householdProducts: {},
  pantry: [],
  hasLoaded: false,
  loadError: null,
  toast: null,
  editorDraft: null,
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | undefined;

function fromSnapshot(s: Snapshot): Partial<HubState> {
  return {
    household: s.household,
    me: s.me,
    members: [...s.members].sort((a, b) => a.sort - b.sort),
    events: s.events,
    pattern: s.pattern,
    overrides: Object.fromEntries(s.overrides.map((o) => [o.day, o])),
    chores: [...s.chores].sort((a, b) => a.sort - b.sort),
    completions: new Set(s.completions.map((c) => `${c.chore_id}|${c.day}`)),
    stores: [...s.stores].sort((a, b) => a.sort - b.sort),
    groceries: s.groceries,
    storeStats: s.storeStats,
    meals: Object.fromEntries(s.meals.map((m) => [m.day, m])),
    householdProducts: Object.fromEntries(s.householdProducts.map((p) => [p.upc, p])),
    pantry: s.pantry,
  };
}

/** The whole household's state for the phone, with optimistic updates. */
export const useHub = create<HubState>()((set, get) => {
  const repo = () => {
    const r = get().repo;
    if (!r) throw new Error('Not ready');
    return r;
  };

  /** Runs a write; on failure tells the user and reloads to undo the optimistic change. */
  const attempt = async (what: string, op: () => Promise<void>): Promise<boolean> => {
    try {
      await op();
      return true;
    } catch (e) {
      get().flash(`Couldn't ${what} — ${errorMessage(e)}`);
      await get().load();
      return false;
    }
  };

  const saveDaycare = async (d: DaycareDay): Promise<boolean> => {
    const hid = get().household?.id;
    if (!hid) return false;
    const p = patternFor(get(), d.date);
    const matchesPattern = !!p && !d.closed && !d.sleepover && !d.note && d.drop === p.drop_member && d.pick === p.pick_member;
    if (matchesPattern) {
      const { [d.key]: _, ...rest } = get().overrides;
      set({ overrides: rest });
      return attempt('update daycare', () => repo().deleteOverride(hid, d.key));
    }
    const o: DaycareOverride = {
      household_id: hid, day: d.key, drop_member: d.drop, pick_member: d.pick, sleepover_member: d.sleepover,
      closed: d.closed, note: d.note, updated_by: get().me?.id ?? null,
    };
    set({ overrides: { ...get().overrides, [d.key]: o } });
    return attempt('update daycare', () => repo().upsertOverride(o));
  };

  const nextRunner = (id: UUID | null): UUID | null => {
    const r = runners(get());
    if (!r.length) return null;
    const i = r.findIndex((m) => m.id === id);
    if (!id || i < 0) return r[0].id;
    return r[(i + 1) % r.length].id;
  };

  const taggedOnly = (id: UUID | null) => (member(get(), id)?.kind === 'grandparent' ? ' (tagged, no invite)' : '');

  const learn = async (key: string, storeID: UUID) => {
    const hid = get().household?.id;
    if (!hid) return;
    const stats = get().storeStats;
    const existing = stats.find((s) => s.product_key === key && s.store_id === storeID);
    set({
      storeStats: existing
        ? stats.map((s) => (s === existing ? { ...s, trips: s.trips + 1 } : s))
        : [...stats, { household_id: hid, product_key: key, store_id: storeID, trips: 1 }],
    });
    try {
      await repo().recordStoreTrip(hid, key, storeID);
    } catch {
      // Learning is best-effort; the next reload corrects the count.
    }
  };

  const replaceGrocery = (item: GroceryItem) => set({ groceries: get().groceries.map((g) => (g.id === item.id ? item : g)) });

  return {
    ...empty,
    repo: null,
    calendarDay: startOfDay(new Date()),

    isDemo: () => get().repo?.isDemo ?? false,

    // MARK: Loading

    start: async (r) => {
      get().reset();
      set({ repo: r });
      await get().load();
      unsubscribe = r.subscribe(() => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => void get().load(), 600);
      });
    },

    reset: () => {
      unsubscribe?.();
      unsubscribe = undefined;
      clearTimeout(reloadTimer);
      set({ ...empty, completions: new Set(), repo: null, calendarDay: startOfDay(new Date()) });
    },

    load: async () => {
      const r = get().repo;
      if (!r) return;
      try {
        const s = await r.loadSnapshot();
        if (get().repo !== r) return; // signed out meanwhile
        set({ ...fromSnapshot(s), hasLoaded: true, loadError: null });
      } catch (e) {
        set({ loadError: errorMessage(e) });
      }
    },

    flash: (message) => {
      clearTimeout(toastTimer);
      set({ toast: message });
      toastTimer = setTimeout(() => set({ toast: null }), 2600);
    },

    setCalendarDay: (day) => set({ calendarDay: startOfDay(day) }),
    openEditor: (draft) => set({ editorDraft: draft }),

    // MARK: Calendar

    saveEvent: async (draft) => {
      const s = get();
      const hid = s.household?.id;
      if (!hid) return;
      const title = draft.title.trim();
      if (!title) {
        s.flash('Give the event a name first');
        return;
      }
      const start = draft.allDay ? startOfDay(draft.day) : at(draft.time.getHours(), draft.time.getMinutes(), draft.day);
      const tags = draft.tagIDs.length ? draft.tagIDs : family(s).map((m) => m.id);
      const note = draft.note.trim();
      const isNew = !draft.existing;
      const sortOf = (id: UUID) => member(s, id)?.sort ?? 0;

      const saved: FamilyEvent = {
        ...(draft.existing ?? {
          id: randomUUID(), household_id: hid, ends_at: null, source: 'manual', created_by: s.me?.id ?? null,
        }),
        title,
        note: note || null,
        starts_at: start.toISOString(),
        all_day: draft.allDay,
        tag_ids: [...tags].sort((a, b) => sortOf(a) - sortOf(b)),
        sync_status: 'pending',
      } as FamilyEvent;

      set({ events: [...get().events.filter((e) => e.id !== saved.id), saved] });

      try {
        await repo().saveEvent(saved, isNew);
      } catch (e) {
        get().flash(`Couldn't save — ${errorMessage(e)}`);
        await get().load();
        return;
      }

      const outcome = await repo().syncEvent(saved.id);
      const status = outcome.kind === 'synced' ? 'synced' : outcome.kind === 'skipped' ? 'skipped' : 'error';
      set({ events: get().events.map((e) => (e.id === saved.id ? { ...e, sync_status: status } : e)) });

      const dayName = isSameDay(start, new Date()) ? 'today' : fmt.weekdayLong(start);
      if (outcome.kind === 'synced') {
        const invited = get().members.filter((m) => m.email && outcome.invited.includes(m.email)).map((m) => m.name);
        get().flash(invited.length ? `Added — invites sent to ${invited.join(' & ')}` : `Added to ${dayName}`);
      } else if (outcome.kind === 'skipped') {
        get().flash(get().isDemo() ? `Added to ${dayName}` : "Added — Google Calendar isn't connected yet");
      } else {
        get().flash("Saved, but the calendar invite didn't go out");
      }
    },

    deleteEvent: async (event) => {
      set({ events: get().events.filter((e) => e.id !== event.id) });
      if (await attempt('delete the event', () => repo().deleteEvent(event))) get().flash('Event removed');
    },

    // MARK: Daycare

    cycleDrop: async (day) => {
      const d = daycare(get(), day);
      if (!d) return;
      d.drop = nextRunner(d.drop);
      if (!(await saveDaycare(d))) return;
      get().flash(`${fmt.weekdayShort(day)} drop-off: ${member(get(), d.drop)?.name ?? 'nobody'}${taggedOnly(d.drop)}`);
    },

    cyclePick: async (day) => {
      const d = daycare(get(), day);
      if (!d) return;
      d.pick = nextRunner(d.pick);
      if (!(await saveDaycare(d))) return;
      get().flash(`${fmt.weekdayShort(day)} pickup: ${member(get(), d.pick)?.name ?? 'nobody'}${taggedOnly(d.pick)}`);
    },

    /**
     * Off → first grandparents → second grandparents → off. The sleepover hosts
     * take that night's pickup and the next morning's drop-off.
     */
    cycleSleepover: async (day) => {
      const d = daycare(get(), day);
      if (!d) return;
      const grands = grandparents(get()).map((g) => g.id);
      const i = d.sleepover ? grands.indexOf(d.sleepover) : -1;
      const next: UUID | null = i >= 0 ? grands[i + 1] ?? null : grands[0] ?? null;
      const p = patternFor(get(), day);
      const prev = d.sleepover;
      d.sleepover = next;
      // Only move the pickup when the host changes; never wipe a manual swap.
      if (next) d.pick = next;
      else if (d.pick === prev) d.pick = p?.pick_member ?? null;
      if (!(await saveDaycare(d))) return;

      const tomorrow = addDays(1, day);
      const n = daycare(get(), tomorrow);
      if (n && !n.closed) {
        const np = patternFor(get(), tomorrow);
        if (next) {
          n.drop = next;
          await saveDaycare(n);
        } else if (prev && n.drop === prev) {
          n.drop = np?.drop_member ?? null;
          await saveDaycare(n);
        }
      }

      const who = member(get(), next);
      get().flash(who ? `Sleepover ${fmt.weekdayShort(day)} night at ${who.name}’s` : 'Sleepover removed');
    },

    toggleClosed: async (day) => {
      const d = daycare(get(), day);
      if (!d) return;
      d.closed = !d.closed;
      if (!d.closed) d.note = null;
      if (!(await saveDaycare(d))) return;
      get().flash(d.closed ? 'Daycare marked closed' : 'Daycare open again');
    },

    // MARK: Chores

    toggleChore: async (chore, day = new Date()) => {
      const key = completionKey(chore.id, day);
      const next = new Set(get().completions);
      const done = !next.has(key);
      if (done) next.add(key);
      else next.delete(key);
      set({ completions: next });
      await attempt('update the chore', () => repo().setChore(chore, dayKey(day), done, get().me?.id ?? null));
    },

    // MARK: Groceries

    /** Adds an item. With no store the learned one is used; an explicit store teaches the app. */
    addGrocery: async (name, upc = null, storeID = null) => {
      const hid = get().household?.id;
      if (!hid) return;
      const clean = name.trim();
      if (!clean) return;
      const key = upc ? `upc:${upc}` : productKey(clean);

      const existing = get().groceries.find((g) => g.product_key === key && !g.checked);
      if (existing) {
        if (storeID && existing.store_id !== storeID) await get().setStore(existing, storeID);
        get().flash(`${existing.name} is already on the list`);
        return;
      }

      const learned = suggestion(get(), key);
      const item: GroceryItem = {
        id: randomUUID(), household_id: hid, name: clean, product_key: key, upc: upc ?? null,
        store_id: storeID ?? learned?.store.id ?? null, checked: false, checked_at: null, added_by: get().me?.id ?? null,
      };
      set({ groceries: [...get().groceries, item] });
      if (!(await attempt('add the item', () => repo().addGrocery(item)))) return;
      if (upc) await get().rememberName(upc, clean);
      if (storeID) {
        // Only an explicit choice that differs from what was learned teaches the app;
        // the purchase itself is counted when the checked item is cleared.
        if (storeID !== learned?.store.id) await learn(key, storeID);
        get().flash(`${clean} added to ${storeByID(get(), storeID)?.name ?? 'the list'}`);
      } else if (learned) {
        get().flash(`${clean} → ${learned.store.name} (learned)`);
      } else {
        get().flash(`${clean} added — tap its store to teach me`);
      }
    },

    setStore: async (item, storeID) => {
      const current = get().groceries.find((g) => g.id === item.id);
      if (!current || current.store_id === storeID) return;
      const updated = { ...current, store_id: storeID };
      replaceGrocery(updated);
      if (!(await attempt('move the item', () => repo().updateGrocery(updated)))) return;
      await learn(item.product_key, storeID);
      get().flash(`Got it — ${item.name} usually from ${storeByID(get(), storeID)?.name ?? 'there'}`);
    },

    toggleGrocery: async (item) => {
      const current = get().groceries.find((g) => g.id === item.id);
      if (!current) return;
      const checked = !current.checked;
      const updated = { ...current, checked, checked_at: checked ? new Date().toISOString() : null };
      replaceGrocery(updated);
      await attempt('update the item', () => repo().updateGrocery(updated));
    },

    /** Removes checked items; each one with a store counts as a trip there. */
    clearChecked: async () => {
      const done = get().groceries.filter((g) => g.checked);
      if (!done.length) return;
      set({ groceries: get().groceries.filter((g) => !g.checked) });
      if (!(await attempt('clear the list', () => repo().deleteGroceries(done.map((g) => g.id))))) return;
      for (const item of done) if (item.store_id) await learn(item.product_key, item.store_id);
      get().flash(`Cleared ${done.length} item${done.length === 1 ? '' : 's'}`);
    },

    /** The family's own name wins; otherwise ask the barcode databases. */
    lookup: async (upc) => {
      const named = rememberedName(get(), upc);
      if (named) return { upc, name: named, brand: null, found: true, source: 'household' };
      try {
        return await repo().lookupUPC(upc);
      } catch {
        return { upc, name: null, brand: null, found: false, incomplete: true };
      }
    },

    rememberName: async (upc, name) => {
      const hid = get().household?.id;
      const clean = name.trim();
      if (!hid || !clean || rememberedName(get(), upc) === clean) return;
      const product = { household_id: hid, upc, name: clean, updated_by: get().me?.id ?? null };
      set({ householdProducts: { ...get().householdProducts, [upc]: product } });
      try {
        await repo().rememberProduct(product);
      } catch {
        // Best-effort: the item itself was saved; the name is asked for again next time.
      }
    },

    // MARK: Pantry

    /** Adds `count` of a product to the pantry (scanning it again adds more). */
    addToPantry: async (name, upc = null, count = 1) => {
      const hid = get().household?.id;
      const clean = name.trim();
      if (!hid || !clean || count < 1) return null;
      const key = upc ? `upc:${upc}` : productKey(clean);
      const existing = pantryItem(get(), key);
      const optimistic: PantryItem = existing
        ? { ...existing, quantity: existing.quantity + count }
        : { id: randomUUID(), household_id: hid, name: clean, product_key: key, upc, quantity: count, added_by: get().me?.id ?? null };
      set({ pantry: [...get().pantry.filter((p) => p.product_key !== key), optimistic] });
      let saved: PantryItem | null = null;
      const ok = await attempt('add to the pantry', async () => {
        saved = await repo().adjustPantry(hid, key, clean, upc, count, get().me?.id ?? null);
      });
      if (!ok || !saved) return null;
      const row: PantryItem = saved;
      set({ pantry: [...get().pantry.filter((p) => p.product_key !== key), row] });
      if (upc) await get().rememberName(upc, clean);
      return row;
    },

    adjustPantryItem: async (item, delta) => {
      const current = get().pantry.find((p) => p.id === item.id);
      if (!current) return;
      const quantity = Math.max(current.quantity + delta, 0);
      if (quantity === current.quantity) return;
      set({ pantry: get().pantry.map((p) => (p.id === item.id ? { ...p, quantity } : p)) });
      const hid = current.household_id;
      await attempt('update the pantry', async () => {
        const row = await repo().adjustPantry(hid, current.product_key, current.name, current.upc, delta, get().me?.id ?? null);
        set({ pantry: get().pantry.map((p) => (p.id === row.id ? row : p)) });
      });
      if (quantity === 0) get().flash(`Out of ${current.name} — tap + list to restock`);
    },

    removePantryItem: async (item) => {
      set({ pantry: get().pantry.filter((p) => p.id !== item.id) });
      if (await attempt('remove the item', () => repo().deletePantryItem(item.id))) get().flash(`${item.name} removed`);
    },

    // MARK: Meals & members

    setMeal: async (day, title, cook, label) => {
      const hid = get().household?.id;
      const clean = title.trim();
      if (!hid || !clean) return;
      const m = { household_id: hid, day: dayKey(day), title: clean, cook_member: cook, cook_label: label };
      set({ meals: { ...get().meals, [m.day]: m } });
      if (await attempt('save dinner', () => repo().upsertMeal(m))) get().flash(`Dinner: ${clean}`);
    },

    updateEmail: async (m, email) => {
      const clean = email.trim();
      const updated = { ...m, email: clean || null };
      set({ members: get().members.map((x) => (x.id === m.id ? updated : x)) });
      return attempt('save the email', () => repo().updateMember(updated));
    },
  };
});

