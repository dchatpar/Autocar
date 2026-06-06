/**
 * String similarity utilities.
 *
 * Wraps the `jaro-winkler` package with a stable TypeScript surface so
 * callers don't have to deal with the CommonJS `export =` quirk.
 *
 * We also expose:
 *   - `normalizeForCompare` — lower-cases, strips diacritics, collapses
 *     whitespace, removes punctuation. Used as a pre-step for name
 *     comparison.
 *   - `jaroWinklerSimilarity` — wrapper that always returns a 0..1
 *     number (0 = totally different, 1 = identical).
 *   - `isNameMatch` — convenience boolean check at the configured
 *     threshold (default 0.85, per the duplicate-detection spec).
 *
 * The `jaro-winkler` package's `.d.ts` exposes:
 *
 *   declare function distance(x: string, y: string,
 *     options?: { caseSensitive?: boolean }): number;
 *   export = distance;
 *
 * so we import via `import jaroWinkler = require("jaro-winkler")` to
 * keep CommonJS interop clean under `esModuleInterop`.
 */

import jaroWinklerRaw from "jaro-winkler";

// CommonJS interop: `jaro-winkler@0.2.x` uses `export = distance`,
// so the import may resolve to the function itself or a wrapper object
// depending on the tsconfig / bundler. Normalize to a function.
const jaroWinklerFn: (a: string, b: string, opts?: { caseSensitive?: boolean }) => number =
  typeof jaroWinklerRaw === "function"
    ? (jaroWinklerRaw as (
        a: string,
        b: string,
        opts?: { caseSensitive?: boolean },
      ) => number)
    : ((jaroWinklerRaw as unknown as { default?: unknown }).default as (
        a: string,
        b: string,
        opts?: { caseSensitive?: boolean },
      ) => number) ??
      ((jaroWinklerRaw as unknown as { distance?: unknown }).distance as (
        a: string,
        b: string,
        opts?: { caseSensitive?: boolean },
      ) => number);

/** Default similarity threshold for "is this the same person" name check. */
export const NAME_MATCH_THRESHOLD = 0.85;

/**
 * Normalize a string for fuzzy name comparison.
 *
 *   "O'Brien-Smith"  → "obriensmith"
 *   "José Ramírez"   → "jose ramirez"
 *   "  ANNA  "       → "anna"
 */
export function normalizeForCompare(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Jaro-Winkler similarity in [0, 1]. Always case-insensitive — the
 * duplicate-detection spec compares lowercased names, so we lowercase
 * internally and disable the lib's own caseSensitive option.
 */
export function jaroWinklerSimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  if (!a || !b) return 0;
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;
  return jaroWinklerFn(na, nb, { caseSensitive: false });
}

/**
 * Boolean wrapper — true if the two strings exceed NAME_MATCH_THRESHOLD
 * similarity after normalization.
 */
export function isNameMatch(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold: number = NAME_MATCH_THRESHOLD,
): boolean {
  return jaroWinklerSimilarity(a, b) >= threshold;
}
