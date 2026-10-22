// Barcode → product name, from free sources that need no API key:
//   1. The Open*Facts family (food, everyday products, pet food, beauty), all queried at once.
//   2. UPCitemdb's free trial endpoint (household items; heavily rate-limited).
// A source that errors (timeout, 5xx, rate limit, HTML error page) is not the same as a
// source saying "I don't know this code": the caller must not cache the first as a miss.

export type Hit = { name: string; brand: string | null; source: string };
export type Lookup = { hit: Hit | null; complete: boolean };

const USER_AGENT = "FamilyHub/0.1 (personal family app)";
const TIMEOUT_MS = 6000;

type Answer = Hit | "miss" | "error";

const OPEN_FACTS = [
  { host: "world.openfoodfacts.org", source: "openfoodfacts" },
  { host: "world.openproductsfacts.org", source: "openproductsfacts" },
  { host: "world.openpetfoodfacts.org", source: "openpetfoodfacts" },
  { host: "world.openbeautyfacts.org", source: "openbeautyfacts" },
];

const OPEN_FACTS_FIELDS = [
  "product_name", "product_name_en", "generic_name", "generic_name_en", "abbreviated_product_name", "brands", "quantity",
].join(",");

/** Digits only. UPC-A read as EAN-13 has a leading 0; both forms are valid lookups. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "");
}

function checkDigitOk(code: string): boolean {
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  // GTIN rule: from the right, weights alternate 3, 1, 3, 1…
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Expands an 8-digit UPC-E (number system 0 or 1) to its 12-digit UPC-A, or null. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0];
  const d = code.slice(1, 7);
  const check = code[7];
  const last = d[5];
  let body: string;
  if ("012".includes(last)) body = d.slice(0, 2) + last + "0000" + d.slice(2, 5);
  else if (last === "3") body = d.slice(0, 3) + "00000" + d.slice(3, 5);
  else if (last === "4") body = d.slice(0, 4) + "00000" + d[4];
  else body = d.slice(0, 5) + "0000" + last;
  const upcA = ns + body + check;
  return checkDigitOk(upcA) ? upcA : null;
}

/** The codes worth trying for one scan, most likely first. */
export function candidates(code: string): string[] {
  const out = [code];
  const upcA = expandUpcE(code);
  if (upcA) out.push(upcA);
  return out;
}

async function getJson(url: string): Promise<{ status: number; body: unknown } | "error"> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return "error"; // HTML "temporarily unavailable" pages and the like
    }
  } catch {
    return "error";
  }
}

function pickName(p: Record<string, unknown>): string | null {
  for (const key of ["product_name", "product_name_en", "generic_name", "generic_name_en", "abbreviated_product_name"]) {
    const v = typeof p[key] === "string" ? (p[key] as string).trim() : "";
    if (v) return v;
  }
  return null;
}

async function openFacts(host: string, source: string, code: string): Promise<Answer> {
  const r = await getJson(`https://${host}/api/v2/product/${code}.json?fields=${OPEN_FACTS_FIELDS}`);
  if (r === "error") return "error";
  const body = r.body as { status?: number; product?: Record<string, unknown> };
  if (r.status === 404 || body?.status === 0) return "miss";
  if (r.status !== 200 || body?.status !== 1 || !body.product) return "error";
  const name = pickName(body.product);
  if (!name) return "miss";
  const brand = String(body.product.brands ?? "").split(",")[0]?.trim() || null;
  const qty = String(body.product.quantity ?? "").trim();
  const full = qty && !name.toLowerCase().includes(qty.toLowerCase()) ? `${name}, ${qty}` : name;
  return { name: full, brand, source };
}

async function upcItemDb(code: string): Promise<Answer> {
  const r = await getJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
  if (r === "error") return "error";
  const body = r.body as { code?: string; items?: { title?: string; brand?: string }[] };
  if (r.status === 429 || body?.code === "EXCEED_LIMIT" || r.status >= 500) return "error";
  const item = body?.items?.[0];
  if (r.status === 200 && item?.title) {
    return { name: String(item.title).trim(), brand: item.brand ? String(item.brand).trim() : null, source: "upcitemdb" };
  }
  return r.status === 200 || r.status === 400 || r.status === 404 ? "miss" : "error";
}

/** Looks a barcode up everywhere. `complete` is false if any source couldn't answer. */
export async function lookupBarcode(raw: string): Promise<Lookup> {
  let complete = true;
  for (const code of candidates(cleanCode(raw))) {
    const answers = await Promise.all(OPEN_FACTS.map((s) => openFacts(s.host, s.source, code)));
    for (const a of answers) {
      if (a === "error") complete = false;
      else if (a !== "miss") return { hit: a, complete: true };
    }
  }
  const a = await upcItemDb(cleanCode(raw));
  if (a === "error") complete = false;
  else if (a !== "miss") return { hit: a, complete: true };
  return { hit: null, complete };
}
