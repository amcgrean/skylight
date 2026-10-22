// Offline tests for barcode handling. Run with: deno test supabase/functions/_shared/products_test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { candidates, cleanCode, expandUpcE } from "./products.ts";

Deno.test("cleanCode keeps digits only", () => {
  assertEquals(cleanCode(" 4099100-017885 "), "4099100017885");
});

Deno.test("expandUpcE handles each compression pattern", () => {
  assertEquals(expandUpcE("04252614"), "042100005264"); // ends in 0–2
  assertEquals(expandUpcE("01234505"), "012000003455"); // ends in 0–2
  assertEquals(expandUpcE("01234531"), "012300000451"); // ends in 3
  assertEquals(expandUpcE("01234543"), "012340000053"); // ends in 4
  assertEquals(expandUpcE("01234565"), "012345000065"); // ends in 5–9
});

Deno.test("expandUpcE rejects a bad check digit", () => {
  assertEquals(expandUpcE("01234533"), null);
  assertEquals(expandUpcE("12345678"), null);
});

Deno.test("expandUpcE ignores non-UPC-E codes", () => {
  assertEquals(expandUpcE("40991000"), null); // number system 4: an EAN-8, not UPC-E
  assertEquals(expandUpcE("4099100017885"), null);
});

Deno.test("candidates tries the raw code first, then the UPC-A expansion", () => {
  assertEquals(candidates("04252614"), ["04252614", "042100005264"]);
  assertEquals(candidates("4099100017885"), ["4099100017885"]);
});
