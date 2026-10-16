// Looks up a barcode: cache first, then Open Food Facts (groceries), then
// UPCitemdb's free trial endpoint (household / pet items). Results — including
// misses — are cached in public.products so each code is fetched once.
//
// Body: { "upc": "036000411287" }  →  { upc, name, brand, found, source }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, env, json } from "../_shared/http.ts";

const CACHE_DAYS_FOUND = 180;
const CACHE_DAYS_MISS = 14;
const USER_AGENT = "FamilyHub/0.1 (personal family app)";

type Hit = { name: string; brand: string | null; source: string };

async function openFoodFacts(upc: string): Promise<Hit | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${upc}.json?fields=product_name,brands`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const name = data?.product?.product_name?.trim();
  if (data?.status !== 1 || !name) return null;
  const brand = (data.product.brands ?? "").split(",")[0]?.trim() || null;
  return { name, brand, source: "openfoodfacts" };
}

async function upcItemDb(upc: string): Promise<Hit | null> {
  const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return null; // 429 = free daily limit reached
  const data = await res.json();
  const item = data?.items?.[0];
  if (!item?.title) return null;
  return { name: String(item.title).trim(), brand: item.brand ? String(item.brand).trim() : null, source: "upcitemdb" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let upc = "";
  try {
    upc = String((await req.json()).upc ?? "").replace(/\D/g, "");
  } catch {
    return json({ error: "Expected a JSON body" }, 400);
  }
  if (upc.length < 8 || upc.length > 14) return json({ error: "Not a valid UPC/EAN" }, 400);

  // The platform already verified the caller's JWT; the cache is written with the service role.
  const admin = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cached } = await admin.from("products").select("*").eq("upc", upc).maybeSingle();
  if (cached) {
    const ageDays = (Date.now() - new Date(cached.fetched_at).getTime()) / 86_400_000;
    if (ageDays < (cached.found ? CACHE_DAYS_FOUND : CACHE_DAYS_MISS)) {
      return json({ upc, name: cached.name, brand: cached.brand, found: cached.found, source: cached.source });
    }
  }

  let hit: Hit | null = null;
  try {
    hit = (await openFoodFacts(upc)) ?? (await upcItemDb(upc));
  } catch (_) {
    hit = null;
  }

  await admin.from("products").upsert({
    upc,
    name: hit?.name ?? null,
    brand: hit?.brand ?? null,
    source: hit?.source ?? null,
    found: !!hit,
    fetched_at: new Date().toISOString(),
  });

  return json({ upc, name: hit?.name ?? null, brand: hit?.brand ?? null, found: !!hit, source: hit?.source ?? null });
});
