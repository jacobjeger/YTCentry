/**
 * Name matching for incoming photos -> roster.
 *
 * Roster + incoming names are now entered in ENGLISH. (Only the legacy 832
 * records already on the door are Hebrew; those aren't part of matching, since
 * the roster is the source of truth and automation owns its own ID band.)
 *
 * English matching must handle:
 *   - titles: "Rabbi", "Reb", "Rav", "R.", "Mr", "HaBachur"
 *   - punctuation: "R." / "O'Brien" / "Ben-Zion"  -> normalized away or to spaces
 *   - order: "Schlesinger Yehuda" === "Yehuda Schlesinger"  (token set, not substring)
 *   - spelling variants ("Yitzchok"/"Yitzchak") -> handled downstream by trigram
 *     similarity + the per-talmid `aliases` field on the roster.
 *
 * Strategy: normalize both sides, then rank roster candidates with Postgres
 * pg_trgm similarity() in the DB (fast, indexed). This JS scorer is the
 * tie-breaker / re-ranker and the offline fallback. Nothing here auto-approves —
 * it only proposes candidates for a human to confirm in the dashboard.
 */

// Hebrew points/cantillation (legacy records only): nikud + te'amim. Harmless on English.
const NIKUD = /[\u0591-\u05C7]/g;
// Apostrophe-like marks (geresh/gershayim + ASCII quotes), e.g. R' / O'Brien.
const APOST = /[\u05F3\u05F4'"`]/g;
// Other punctuation -> space (hyphens, periods, commas, slashes).
const PUNCT = /[.,\/\\\-_]+/g;

// Titles/honorifics to strip as a leading token. English first, Hebrew for legacy.
const TITLES = [
  "rabbi",
  "reb",
  "rav",
  "harav",
  "mr",
  "mrs",
  "habachur",
  "ראש הישיבה",
  "הרב",
  "רב",
  "ר",
  "מרן",
  "הגאון",
  "הבחור",
];

export function normalizeName(raw: string): string {
  let s = (raw ?? "")
    .normalize("NFC")
    .replace(NIKUD, "")
    .replace(APOST, "")   // drop apostrophes (R' -> R, O'Brien -> OBrien)
    .replace(PUNCT, " "); // hyphens/periods -> space (Ben-Zion -> Ben Zion)
  s = s.toLowerCase().replace(/\s+/g, " ").trim();
  for (const t of TITLES) {
    const re = new RegExp(`^${t}\\s+`, "i");
    s = s.replace(re, "").trim();
  }
  return s;
}

/** Order-insensitive token set: "Schlesinger Yehuda" === "Yehuda Schlesinger". */
export function tokenSet(name: string): Set<string> {
  return new Set(normalizeName(name).split(" ").filter(Boolean));
}

/** Dice coefficient on character bigrams of the sorted token set (0..1). */
export function diceScore(a: string, b: string): number {
  const na = [...tokenSet(a)].sort().join(" ");
  const nb = [...tokenSet(b)].sort().join(" ");
  if (na === nb) return 1;
  const grams = (s: string) => {
    const g = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const k = s.slice(i, i + 2);
      g.set(k, (g.get(k) ?? 0) + 1);
    }
    return g;
  };
  const ga = grams(na), gb = grams(nb);
  let inter = 0, total = 0;
  for (const [k, v] of ga) { total += v; if (gb.has(k)) inter += Math.min(v, gb.get(k)!); }
  for (const v of gb.values()) total += v;
  return total === 0 ? 0 : (2 * inter) / total;
}

export interface Candidate { studentId: string; name: string; score: number; }

/**
 * Confidence buckets. Tuned to fail SAFE — anything not clearly one person
 * goes to the human "needs match" queue rather than auto-suggesting.
 */
export function bucket(sorted: Candidate[]): {
  decision: "auto_suggest" | "needs_match" | "no_match";
  top: Candidate[];
} {
  const top = sorted.slice(0, 3);
  const [a, b] = top;
  if (!a || a.score < 0.45) return { decision: "no_match", top };
  if (a.score >= 0.85 && (!b || a.score - b.score >= 0.2))
    return { decision: "auto_suggest", top }; // still requires a human click to push
  return { decision: "needs_match", top };
}

/**
 * Recommended DB-side matching (run in Postgres, not here):
 *
 *   CREATE EXTENSION IF NOT EXISTS pg_trgm;
 *   ALTER TABLE "Talmid" ADD COLUMN normalized_name text;
 *   CREATE INDEX talmid_name_trgm ON "Talmid" USING gin (normalized_name gin_trgm_ops);
 *
 *   -- keep normalized_name in sync via app code (normalizeName) on write.
 *
 *   SELECT student_id, hebrew_name,
 *          similarity(normalized_name, $1) AS score
 *   FROM "Talmid"
 *   WHERE status = 'awaiting_photo'
 *   ORDER BY score DESC
 *   LIMIT 5;
 *
 * Pass the result rows through bucket() (optionally re-scored with diceScore)
 * to decide auto_suggest vs needs_match.
 */
