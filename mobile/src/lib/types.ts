// Mirrors the Supabase tables in supabase/migrations. Rows keep the database's
// snake_case names so they go to and from supabase-js unchanged. Postgres `date`
// columns stay "yyyy-MM-dd" strings (see day.ts) to avoid time-zone drift, and
// timestamps stay ISO strings.

export type UUID = string;

export type Household = {
  id: UUID;
  name: string;
  invite_code: string;
  timezone: string;
};

export type MemberKind = 'adult' | 'child' | 'pets' | 'grandparent';

export type Member = {
  id: UUID;
  household_id: UUID;
  user_id: UUID | null;
  name: string;
  short_name: string;
  kind: MemberKind;
  color: string;
  email: string | null;
  sort: number;
};

export type EventSource = 'manual' | 'inbox' | 'google' | 'icloud';
export type SyncStatus = 'pending' | 'synced' | 'skipped' | 'error';

export type FamilyEvent = {
  id: UUID;
  household_id: UUID;
  title: string;
  note: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  source: EventSource;
  sync_status: SyncStatus;
  created_by: UUID | null;
  /** Filled from event_tags; not a column on `events`. */
  tag_ids: UUID[];
};

export type DaycarePattern = {
  household_id: UUID;
  weekday: number; // ISO 1 = Monday … 7 = Sunday
  drop_member: UUID | null;
  pick_member: UUID | null;
  drop_time: string; // "07:30:00"
  pick_time: string;
};

export type DaycareOverride = {
  household_id: UUID;
  day: string; // yyyy-MM-dd
  drop_member: UUID | null;
  pick_member: UUID | null;
  sleepover_member: UUID | null;
  closed: boolean;
  note: string | null;
  updated_by: UUID | null;
};

export type Cadence = 'daily' | 'weekdays' | 'weekly';

export type Chore = {
  id: UUID;
  household_id: UUID;
  title: string;
  member_id: UUID;
  points: number;
  cadence: Cadence;
  weekday: number | null;
  active: boolean;
  sort: number;
};

export type ChoreCompletion = {
  chore_id: UUID;
  day: string;
  completed_by: UUID | null;
};

export type GroceryStore = {
  id: UUID;
  household_id: UUID;
  name: string;
  color: string;
  sort: number;
};

export type GroceryItem = {
  id: UUID;
  household_id: UUID;
  name: string;
  product_key: string;
  upc: string | null;
  store_id: UUID | null;
  checked: boolean;
  checked_at: string | null;
  added_by: UUID | null;
};

export type StoreStat = {
  household_id: UUID;
  product_key: string;
  store_id: UUID;
  trips: number;
};

export type Meal = {
  household_id: UUID;
  day: string;
  title: string;
  cook_member: UUID | null;
  cook_label: string | null;
};

export type ProductInfo = {
  upc: string;
  name: string | null;
  brand: string | null;
  found: boolean;
  /** Where the name came from: a public database, or "household" for one the family typed. */
  source?: string | null;
  /** True when a barcode database couldn't be reached, so "not found" isn't certain. */
  incomplete?: boolean;
};

/** A name the family gave a barcode (store brands no database knows). */
export type HouseholdProduct = {
  household_id: UUID;
  upc: string;
  name: string;
  updated_by: UUID | null;
};

/** Something on hand at home. One row per product; quantity 0 means "out". */
export type PantryItem = {
  id: UUID;
  household_id: UUID;
  name: string;
  product_key: string;
  upc: string | null;
  quantity: number;
  added_by: UUID | null;
};

/** Everything the phone needs, loaded in one go. */
export type Snapshot = {
  household: Household;
  me: Member | null;
  members: Member[];
  events: FamilyEvent[];
  pattern: DaycarePattern[];
  overrides: DaycareOverride[];
  chores: Chore[];
  completions: ChoreCompletion[];
  stores: GroceryStore[];
  groceries: GroceryItem[];
  storeStats: StoreStat[];
  meals: Meal[];
  householdProducts: HouseholdProduct[];
  pantry: PantryItem[];
};

export type SyncOutcome =
  | { kind: 'synced'; invited: string[] }
  | { kind: 'skipped' }
  | { kind: 'failed'; message: string };

/** Only adults with an email get calendar invites; everyone else is tag-only. */
export function getsInvites(m: Member): boolean {
  return m.kind === 'adult' && (m.email ?? '').trim().length > 0;
}

/** Normalized product name used for store learning. */
export function productKey(name: string): string {
  return name.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
