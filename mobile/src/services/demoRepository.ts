import { randomUUID } from 'expo-crypto';

import { addDays, at, dayKey, isoWeekday, weekContaining } from '../lib/day';
import {
  getsInvites,
  productKey,
  type Chore,
  type ChoreCompletion,
  type DaycareOverride,
  type DaycarePattern,
  type FamilyEvent,
  type GroceryItem,
  type GroceryStore,
  type HouseholdProduct,
  type Meal,
  type Member,
  type MemberKind,
  type PantryItem,
  type ProductInfo,
  type Snapshot,
  type StoreStat,
  type SyncOutcome,
  type UUID,
} from '../lib/types';
import type { Repository } from './repository';

/** In-memory household with sample data so the app is usable before Supabase is set up. */
export class DemoRepository implements Repository {
  readonly isDemo = true;
  private snap: Snapshot = sample();

  async loadSnapshot(): Promise<Snapshot> {
    return JSON.parse(JSON.stringify(this.snap)) as Snapshot;
  }

  async saveEvent(event: FamilyEvent): Promise<void> {
    this.snap.events = [...this.snap.events.filter((e) => e.id !== event.id), event];
  }

  async syncEvent(id: UUID): Promise<SyncOutcome> {
    const e = this.snap.events.find((x) => x.id === id);
    if (!e) return { kind: 'skipped' };
    const invited = this.snap.members
      .filter((m) => e.tag_ids.includes(m.id) && getsInvites(m))
      .map((m) => m.email!);
    return invited.length ? { kind: 'synced', invited } : { kind: 'skipped' };
  }

  async deleteEvent(event: FamilyEvent): Promise<void> {
    this.snap.events = this.snap.events.filter((e) => e.id !== event.id);
  }

  async upsertOverride(o: DaycareOverride): Promise<void> {
    this.snap.overrides = [...this.snap.overrides.filter((x) => x.day !== o.day), o];
  }

  async deleteOverride(_householdID: UUID, day: string): Promise<void> {
    this.snap.overrides = this.snap.overrides.filter((x) => x.day !== day);
  }

  async setChore(chore: Chore, day: string, done: boolean, by: UUID | null): Promise<void> {
    this.snap.completions = this.snap.completions.filter((c) => !(c.chore_id === chore.id && c.day === day));
    if (done) this.snap.completions.push({ chore_id: chore.id, day, completed_by: by });
  }

  async addGrocery(item: GroceryItem): Promise<void> {
    this.snap.groceries.push(item);
  }

  async updateGrocery(item: GroceryItem): Promise<void> {
    this.snap.groceries = this.snap.groceries.map((g) => (g.id === item.id ? item : g));
  }

  async deleteGroceries(ids: UUID[]): Promise<void> {
    this.snap.groceries = this.snap.groceries.filter((g) => !ids.includes(g.id));
  }

  async recordStoreTrip(householdID: UUID, key: string, storeID: UUID): Promise<void> {
    const s = this.snap.storeStats.find((x) => x.product_key === key && x.store_id === storeID);
    if (s) s.trips += 1;
    else this.snap.storeStats.push({ household_id: householdID, product_key: key, store_id: storeID, trips: 1 });
  }

  async lookupUPC(upc: string): Promise<ProductInfo> {
    await new Promise((r) => setTimeout(r, 400));
    const known: Record<string, [string, string]> = {
      '036000411287': ['Diapers, size 5', 'Huggies'],
      '051500725306': ['Creamy peanut butter, 40 oz', 'Jif'],
      '4099100017885': ['Vitality Cereal Vanilla Almond', 'Aldi'],
    };
    const k = known[upc];
    return k ? { upc, name: k[0], brand: k[1], found: true } : { upc, name: null, brand: null, found: false };
  }

  async rememberProduct(product: HouseholdProduct): Promise<void> {
    this.snap.householdProducts = [...this.snap.householdProducts.filter((p) => p.upc !== product.upc), product];
  }

  async adjustPantry(
    householdID: UUID, key: string, name: string, upc: string | null, delta: number, by: UUID | null,
  ): Promise<PantryItem> {
    const existing = this.snap.pantry.find((p) => p.product_key === key);
    if (existing) {
      existing.quantity = Math.max(existing.quantity + delta, 0);
      return { ...existing };
    }
    const item: PantryItem = {
      id: randomUUID(), household_id: householdID, name: name.trim(), product_key: key, upc,
      quantity: Math.max(delta, 0), added_by: by,
    };
    this.snap.pantry.push(item);
    return { ...item };
  }

  async deletePantryItem(id: UUID): Promise<void> {
    this.snap.pantry = this.snap.pantry.filter((p) => p.id !== id);
  }

  async upsertMeal(meal: Meal): Promise<void> {
    this.snap.meals = [...this.snap.meals.filter((m) => m.day !== meal.day), meal];
  }

  async updateMember(member: Member): Promise<void> {
    this.snap.members = this.snap.members.map((m) => (m.id === member.id ? member : m));
  }

  subscribe(): () => void {
    return () => {};
  }
}

function sample(): Snapshot {
  const hid = randomUUID();
  const household = { id: hid, name: 'Home', invite_code: 'DEMO42', timezone: 'America/Chicago' };

  const m = (name: string, short: string, kind: MemberKind, color: string, email: string | null, sort: number): Member => ({
    id: randomUUID(), household_id: hid, user_id: null, name, short_name: short, kind, color, email, sort,
  });
  const aaron = m('Aaron', 'Aaron', 'adult', '#5DB894', 'aaron@example.com', 0);
  const makala = m('Makala', 'Makala', 'adult', '#EE8FA8', 'makala@example.com', 1);
  const patrick = m('Patrick', 'Patrick', 'child', '#F2C14E', null, 2);
  const pets = m('Pets', 'Pets', 'pets', '#6CC0CF', null, 3);
  const jay = m('Jay & Peggy', 'Jay/Peggy', 'grandparent', '#B4A3FF', null, 4);
  const ron = m('Ron & Autumn', 'Ron/Autumn', 'grandparent', '#A9C46C', null, 5);
  const members = [aaron, makala, patrick, pets, jay, ron];

  const now = new Date();
  const week = weekContaining(now);
  const ev = (
    day: number, h: number, min: number, title: string, tags: Member[],
    opts: { note?: string; source?: FamilyEvent['source']; allDay?: boolean } = {},
  ): FamilyEvent => ({
    id: randomUUID(), household_id: hid, title, note: opts.note ?? null,
    starts_at: (opts.allDay ? week[day] : at(h, min, week[day])).toISOString(), ends_at: null,
    all_day: opts.allDay ?? false, source: opts.source ?? 'manual', sync_status: 'synced',
    created_by: aaron.id, tag_ids: tags.map((t) => t.id),
  });
  const today = isoWeekday(now) - 1;
  const events = [
    ev(today, 10, 0, 'Sprint review', [aaron], { source: 'google' }),
    ev(today, 12, 30, 'Nap time', [patrick], { note: 'Sound machine on, blackout curtains' }),
    ev(today, 15, 0, 'Vet checkup for the dog', [pets, aaron], { note: 'Annual shots — bring the vaccine card', source: 'inbox' }),
    ev(today, 19, 0, 'Bath, books & bedtime', [patrick], { note: 'Pajamas, two stories & a cuddle' }),
    ev(1, 9, 30, 'Toddler swim', [patrick, makala], { note: 'Swim diaper + towel' }),
    ev(1, 19, 0, 'Date night', [aaron, makala], { note: 'Sitter: Jay & Peggy' }),
    ev(2, 8, 0, 'Flea meds for all three', [pets]),
    ev(3, 10, 0, 'Library story time', [patrick, makala]),
    ev(5, 9, 0, 'Farmers market', [aaron, makala, patrick], { note: 'Bring the wagon' }),
    ev(6, 10, 0, 'Brunch with Jay & Peggy', [aaron, makala, patrick, jay]),
  ];

  const pattern: DaycarePattern[] = [1, 2, 3, 4, 5].map((weekday) => ({
    household_id: hid, weekday, drop_member: aaron.id, pick_member: makala.id, drop_time: '07:30:00', pick_time: '17:15:00',
  }));
  const blank = { household_id: hid, drop_member: null, pick_member: null, sleepover_member: null, closed: false, note: null, updated_by: null };
  const overrides: DaycareOverride[] = [
    { ...blank, day: dayKey(week[2]), drop_member: aaron.id, pick_member: jay.id },
    { ...blank, day: dayKey(week[4]), closed: true, note: 'Teacher in-service day' },
  ];

  const chore = (title: string, who: Member, points: number, sort: number): Chore => ({
    id: randomUUID(), household_id: hid, title, member_id: who.id, points, cadence: 'daily', weekday: null, active: true, sort,
  });
  const chores = [
    chore('Take out trash', aaron, 2, 0), chore('Mow front yard', aaron, 5, 1),
    chore('Start laundry', makala, 2, 2), chore('Pay water bill', makala, 1, 3),
    chore('Toys in the bin', patrick, 1, 4), chore('Brush teeth', patrick, 1, 5),
    chore('Walk the dog', pets, 2, 6), chore('Feed the dog', pets, 1, 7),
    chore('Feed both cats', pets, 1, 8), chore('Scoop litter box', pets, 2, 9),
  ];
  const todayKey = dayKey(now);
  const completions: ChoreCompletion[] = [chores[0], chores[2], chores[4], chores[6]].map((c) => ({
    chore_id: c.id, day: todayKey, completed_by: aaron.id,
  }));

  const store = (name: string, color: string, sort: number): GroceryStore => ({ id: randomUUID(), household_id: hid, name, color, sort });
  const hyvee = store('Hy-Vee', '#E07A5F', 0);
  const costco = store('Costco', '#3F6FA8', 1);
  const target = store('Target', '#B83E61', 2);
  const aldi = store('Aldi', '#F2C14E', 3);

  const g = (name: string, s: GroceryStore | null, checked = false): GroceryItem => ({
    id: randomUUID(), household_id: hid, name, product_key: productKey(name), upc: null,
    store_id: s?.id ?? null, checked, checked_at: null, added_by: aaron.id,
  });
  const groceries = [
    g('Diapers, size 5', costco), g('Dog food', costco), g('Cat litter', target),
    g('Applesauce pouches', aldi), g('Whole milk', hyvee), g('Tortillas', hyvee),
    g('Avocados', aldi), g('Coffee beans', costco, true), g('Bananas', aldi),
  ];
  const stat = (key: string, s: GroceryStore, trips: number): StoreStat => ({ household_id: hid, product_key: key, store_id: s.id, trips });
  const storeStats = [
    stat('diapers, size 5', costco, 3), stat('dog food', costco, 2), stat('dog food', target, 1),
    stat('cat litter', target, 2), stat('applesauce pouches', aldi, 2), stat('applesauce pouches', hyvee, 1),
    stat('whole milk', hyvee, 3), stat('avocados', aldi, 2), stat('coffee beans', costco, 2),
    stat('bananas', aldi, 3), stat('peanut butter', costco, 1),
  ];

  const meals: Meal[] = [
    { household_id: hid, day: todayKey, title: 'Taco night', cook_member: makala.id, cook_label: null },
    { household_id: hid, day: dayKey(addDays(1, now)), title: 'Sheet-pan chicken', cook_member: aaron.id, cook_label: null },
  ];

  const p = (name: string, quantity: number, upc: string | null = null): PantryItem => ({
    id: randomUUID(), household_id: hid, name, product_key: upc ? `upc:${upc}` : productKey(name), upc,
    quantity, added_by: makala.id,
  });
  const pantry = [
    p('Creamy peanut butter, 40 oz', 2, '051500725306'), p('Pasta', 3), p('Canned black beans', 4),
    p('Applesauce pouches', 0), p('Vitality Cereal Vanilla Almond', 1, '4099100017885'), p('Dog food', 1),
  ];

  return {
    household, me: aaron, members, events, pattern, overrides, chores, completions,
    stores: [hyvee, costco, target, aldi], groceries, storeStats, meals, householdProducts: [], pantry,
  };
}
