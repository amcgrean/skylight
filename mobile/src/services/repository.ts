import type {
  Chore,
  DaycareOverride,
  FamilyEvent,
  GroceryItem,
  Meal,
  Member,
  ProductInfo,
  Snapshot,
  SyncOutcome,
  UUID,
} from '../lib/types';

/**
 * Data access for the household. Two implementations:
 * - `DemoRepository`: in-memory sample data, used when Supabase isn't configured.
 * - `SupabaseRepository`: the real backend.
 */
export interface Repository {
  readonly isDemo: boolean;

  loadSnapshot(): Promise<Snapshot>;

  saveEvent(event: FamilyEvent, isNew: boolean): Promise<void>;
  /** Pushes the event to the family Google Calendar and sends invites. */
  syncEvent(id: UUID): Promise<SyncOutcome>;
  deleteEvent(event: FamilyEvent): Promise<void>;

  upsertOverride(override: DaycareOverride): Promise<void>;
  deleteOverride(householdID: UUID, day: string): Promise<void>;

  setChore(chore: Chore, day: string, done: boolean, by: UUID | null): Promise<void>;

  addGrocery(item: GroceryItem): Promise<void>;
  updateGrocery(item: GroceryItem): Promise<void>;
  deleteGroceries(ids: UUID[]): Promise<void>;
  recordStoreTrip(householdID: UUID, productKey: string, storeID: UUID): Promise<void>;
  lookupUPC(upc: string): Promise<ProductInfo>;

  upsertMeal(meal: Meal): Promise<void>;
  updateMember(member: Member): Promise<void>;

  /** Calls `onChange` whenever another phone changes household data. Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
}
