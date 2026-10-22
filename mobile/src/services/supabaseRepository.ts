import type { SupabaseClient } from '@supabase/supabase-js';

import { addDays, dayKey, startOfDay, startOfWeek } from '../lib/day';
import {
  errorMessage,
  type Chore,
  type ChoreCompletion,
  type DaycareOverride,
  type DaycarePattern,
  type FamilyEvent,
  type GroceryItem,
  type GroceryStore,
  type Household,
  type HouseholdProduct,
  type Meal,
  type Member,
  type PantryItem,
  type ProductInfo,
  type Snapshot,
  type StoreStat,
  type SyncOutcome,
  type UUID,
} from '../lib/types';
import type { Repository } from './repository';

export class NotLinkedError extends Error {
  constructor() {
    super("This account isn't linked to a family member yet.");
  }
}

type EventRow = Omit<FamilyEvent, 'tag_ids'> & { event_tags?: { member_id: UUID }[] };
type SyncResponse = { status: string; invited?: string[]; error?: string };

/** Throws the PostgREST error if there is one, otherwise returns the data. */
function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error(errorMessage(res.error));
  return res.data as T;
}

/**
 * Live backend. Every query runs as the signed-in user, so row-level security
 * keeps it to their household.
 */
export class SupabaseRepository implements Repository {
  readonly isDemo = false;
  private householdID: UUID | null = null;

  constructor(private readonly client: SupabaseClient) {}

  // MARK: Load

  async loadSnapshot(): Promise<Snapshot> {
    const { data: auth, error: authError } = await this.client.auth.getSession();
    if (authError) throw authError;
    const userID = auth.session?.user.id;
    if (!userID) throw new Error('Signed out');

    const mine = must(await this.client.from('members').select().eq('user_id', userID).limit(1)) as Member[];
    const me = mine[0];
    if (!me) throw new NotLinkedError();
    const h = me.household_id;
    this.householdID = h;

    const today = startOfDay(new Date());
    const from = startOfWeek(addDays(-35, today));
    const to = addDays(180, today);
    const fromKey = dayKey(from);
    const toKey = dayKey(to);
    const c = this.client;

    const [household, members, events, pattern, overrides, chores, completions, stores, groceries, stats, meals, named, pantry] =
      await Promise.all([
        c.from('households').select().eq('id', h).single(),
        c.from('members').select().eq('household_id', h).order('sort'),
        c.from('events').select('*, event_tags(member_id)').eq('household_id', h)
          .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at'),
        c.from('daycare_pattern').select().eq('household_id', h),
        c.from('daycare_overrides').select().eq('household_id', h).gte('day', fromKey).lte('day', toKey),
        c.from('chores').select().eq('household_id', h).eq('active', true).order('sort'),
        c.from('chore_completions').select('chore_id, day, completed_by, chores!inner(household_id)')
          .eq('chores.household_id', h).gte('day', dayKey(addDays(-7, today))),
        c.from('stores').select().eq('household_id', h).order('sort'),
        c.from('grocery_items').select().eq('household_id', h).order('created_at'),
        c.from('store_stats').select().eq('household_id', h),
        c.from('meals').select().eq('household_id', h).gte('day', fromKey).lte('day', toKey),
        c.from('household_products').select('household_id, upc, name, updated_by').eq('household_id', h),
        c.from('pantry_items').select().eq('household_id', h).order('name'),
      ]);

    return {
      household: must(household) as Household,
      me,
      members: must(members) as Member[],
      events: (must(events) as EventRow[]).map(({ event_tags, ...e }) => ({
        ...e,
        tag_ids: (event_tags ?? []).map((t) => t.member_id),
      })),
      pattern: must(pattern) as DaycarePattern[],
      overrides: must(overrides) as DaycareOverride[],
      chores: must(chores) as Chore[],
      completions: (must(completions) as (ChoreCompletion & { chores?: unknown })[]).map(
        ({ chore_id, day, completed_by }) => ({ chore_id, day, completed_by }),
      ),
      stores: must(stores) as GroceryStore[],
      groceries: must(groceries) as GroceryItem[],
      storeStats: must(stats) as StoreStat[],
      meals: must(meals) as Meal[],
      householdProducts: must(named) as HouseholdProduct[],
      pantry: must(pantry) as PantryItem[],
    };
  }

  // MARK: Events

  async saveEvent(event: FamilyEvent, isNew: boolean): Promise<void> {
    const { tag_ids, ...row } = event;
    if (isNew) {
      must(await this.client.from('events').insert(row));
    } else {
      must(await this.client.from('events').update(row).eq('id', event.id));
      must(await this.client.from('event_tags').delete().eq('event_id', event.id));
    }
    if (tag_ids.length) {
      must(await this.client.from('event_tags').insert(tag_ids.map((member_id) => ({ event_id: event.id, member_id }))));
    }
  }

  async syncEvent(id: UUID): Promise<SyncOutcome> {
    try {
      const { data, error } = await this.client.functions.invoke<SyncResponse>('google-calendar-sync', {
        body: { event_id: id, action: 'upsert' },
      });
      if (error) throw error;
      switch (data?.status) {
        case 'synced':
          return { kind: 'synced', invited: data.invited ?? [] };
        case 'skipped':
          return { kind: 'skipped' };
        default:
          return { kind: 'failed', message: data?.error ?? 'Calendar sync failed' };
      }
    } catch (e) {
      return { kind: 'failed', message: errorMessage(e) };
    }
  }

  async deleteEvent(event: FamilyEvent): Promise<void> {
    // The function removes it from Google (and notifies invitees) and deletes the row.
    const { error } = await this.client.functions.invoke('google-calendar-sync', {
      body: { event_id: event.id, action: 'delete' },
    });
    if (error) {
      // Function not deployed or Google unreachable: still delete it here.
      must(await this.client.from('events').delete().eq('id', event.id));
    }
  }

  // MARK: Daycare

  async upsertOverride(override: DaycareOverride): Promise<void> {
    must(await this.client.from('daycare_overrides').upsert(override, { onConflict: 'household_id,day' }));
  }

  async deleteOverride(householdID: UUID, day: string): Promise<void> {
    must(await this.client.from('daycare_overrides').delete().eq('household_id', householdID).eq('day', day));
  }

  // MARK: Chores

  async setChore(chore: Chore, day: string, done: boolean, by: UUID | null): Promise<void> {
    if (done) {
      must(await this.client.from('chore_completions')
        .upsert({ chore_id: chore.id, day, completed_by: by }, { onConflict: 'chore_id,day' }));
    } else {
      must(await this.client.from('chore_completions').delete().eq('chore_id', chore.id).eq('day', day));
    }
  }

  // MARK: Groceries

  async addGrocery(item: GroceryItem): Promise<void> {
    must(await this.client.from('grocery_items').insert(item));
  }

  async updateGrocery(item: GroceryItem): Promise<void> {
    must(await this.client.from('grocery_items').update(item).eq('id', item.id));
  }

  async deleteGroceries(ids: UUID[]): Promise<void> {
    if (!ids.length) return;
    must(await this.client.from('grocery_items').delete().in('id', ids));
  }

  async recordStoreTrip(householdID: UUID, key: string, storeID: UUID): Promise<void> {
    must(await this.client.rpc('record_store_trip', { p_household: householdID, p_product_key: key, p_store: storeID }));
  }

  async lookupUPC(upc: string): Promise<ProductInfo> {
    const { data, error } = await this.client.functions.invoke<ProductInfo>('upc-lookup', { body: { upc } });
    if (error) throw error;
    if (!data) throw new Error('Empty barcode response');
    return data;
  }

  async rememberProduct(product: HouseholdProduct): Promise<void> {
    must(await this.client.from('household_products').upsert(product, { onConflict: 'household_id,upc' }));
  }

  // MARK: Pantry

  async adjustPantry(
    householdID: UUID, key: string, name: string, upc: string | null, delta: number, by: UUID | null,
  ): Promise<PantryItem> {
    return must(await this.client.rpc('adjust_pantry', {
      p_household: householdID, p_product_key: key, p_name: name, p_upc: upc, p_delta: delta, p_member: by,
    })) as PantryItem;
  }

  async deletePantryItem(id: UUID): Promise<void> {
    must(await this.client.from('pantry_items').delete().eq('id', id));
  }

  // MARK: Meals & members

  async upsertMeal(meal: Meal): Promise<void> {
    must(await this.client.from('meals').upsert(meal, { onConflict: 'household_id,day' }));
  }

  async updateMember(member: Member): Promise<void> {
    must(await this.client.from('members').update({ email: member.email }).eq('id', member.id));
  }

  // MARK: Realtime

  subscribe(onChange: () => void): () => void {
    const channel = this.client
      .channel(`household-${this.householdID ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, () => onChange())
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }
}
