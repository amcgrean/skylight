// Looks up a barcode: cache first, then the free Open*Facts databases and UPCitemdb
// (see _shared/products.ts). Hits are cached for months. A miss is cached for a few
// days, but only when every source actually answered: a timeout or rate limit is
// never remembered as "unknown product".
//
// Household-typed names (store brands no database knows) live in household_products
// and are checked by the app before it calls this function.
//
// Body: { "upc": "036000411287" }  →  { upc, name, brand, found, source, incomplete? }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, env, json } from "../_shared/http.ts";
import { cleanCode, lookupBarcode } from "../_shared/products.ts";

const CACHE_DAYS_FOUND = 180;
const CACHE_DAYS_MISS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let upc = "";
  try {
    upc = cleanCode(String((await req.json()).upc ?? ""));
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

  const { hit, complete } = await lookupBarcode(upc);

  if (hit || complete) {
    await admin.from("products").upsert({
      upc,
      name: hit?.name ?? null,
      brand: hit?.brand ?? null,
      source: hit?.source ?? null,
      found: !!hit,
      fetched_at: new Date().toISOString(),
    });
  }

  return json({
    upc,
    name: hit?.name ?? null,
    brand: hit?.brand ?? null,
    found: !!hit,
    source: hit?.source ?? null,
    ...(hit || complete ? {} : { incomplete: true }),
  });
});
