/**
 * Pure column-mapping helpers for the roster import. Kept out of actions.ts
 * because a "use server" module may only export async functions — and because
 * this is the part worth testing directly.
 */
import { normalizeName } from "@ytc/core";

export interface Mapping {
  studentId: string;
  fullName: string;
  /** Set only when the sheet splits the name — joined onto fullName on import. */
  lastName: string;
  shiur: string;
  phone: string;
  aliases: string;
}

export const EMPTY_MAPPING: Mapping = {
  studentId: "",
  fullName: "",
  lastName: "",
  shiur: "",
  phone: "",
  aliases: "",
};

const normHeader = (s: string) =>
  s.toLowerCase().replace(/[#_.\-/\\]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Header auto-detection, most-specific first. Keywords are tried exact, then
 * whole-word, then (only if distinctive) as a loose substring. A plain
 * `includes` is too eager: the keyword "id" alone matches "Grade", "Building"
 * and "Resident", which is how a year column once got mapped as Student ID and
 * collapsed a whole roster onto two records.
 */
export function detect(headers: string[], keywords: string[]): string {
  const low = headers.map(normHeader);

  for (const kw of keywords) {
    const i = low.indexOf(kw);
    if (i >= 0) return headers[i]!;
  }
  for (const kw of keywords) {
    const re = new RegExp(`(^| )${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`);
    const i = low.findIndex((h) => re.test(h));
    if (i >= 0) return headers[i]!;
  }
  for (const kw of keywords) {
    if (kw.length < 4) continue; // "id", "שם" — too short to match loosely
    const i = low.findIndex((h) => h.includes(kw));
    if (i >= 0) return headers[i]!;
  }
  return "";
}

/**
 * Rosters come both ways: one "Full Name" column, or split First/Last. Mapping
 * a split sheet to the single name field imports surnames only, which quietly
 * wrecks the fuzzy photo matching — so detect the split and map both halves.
 */
function suggestName(headers: string[]): Pick<Mapping, "fullName" | "lastName"> {
  const last = detect(headers, ["last name", "surname", "family name", "שם משפחה"]);
  const first = detect(headers, ["first name", "given name", "שם פרטי"]);
  if (last && first) return { fullName: first, lastName: last };

  const full = detect(headers, [
    "full name",
    "student name",
    "talmid name",
    "name",
    "talmid",
    "שם מלא",
    "שם התלמיד",
    "שם",
  ]);
  if (full && full !== last) return { fullName: full, lastName: "" };
  return { fullName: first || full, lastName: "" };
}

/** Best-guess column mapping for a freshly parsed sheet. */
export function suggestMapping(headers: string[]): Mapping {
  return {
    studentId: detect(headers, [
      "student id",
      "studentid",
      "student number",
      "student no",
      "id number",
      "מספר תלמיד",
      "תעודת זהות",
      "id",
    ]),
    ...suggestName(headers),
    shiur: detect(headers, ["shiur", "class", "grade", "year", "שיעור", "שנה"]),
    phone: detect(headers, ["phone", "cell", "mobile", "טלפון", "נייד"]),
    aliases: detect(headers, ["alias", "aka", "nickname", "כינוי"]),
  };
}

/**
 * Key for a sheet with no ID column (common — plenty of lists are just
 * year/last/first). Same `M-` convention as a manual add, so the same talmid
 * from either path lands on one record, and re-importing updates rather than
 * duplicates. Identical names get -2, -3 by order of appearance.
 */
export function synthId(fullName: string, taken: Map<string, string>): string {
  const base = `M-${normalizeName(fullName).replace(/\s+/g, "-")}`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export interface PlannedRow {
  studentId: string;
  fullName: string;
  shiur: string | null;
  phone: string | null;
  aliases: string[];
}

export interface ImportPlan {
  rows: PlannedRow[];
  /** "<id>: <first name> / <colliding name>" — non-empty means a bad ID mapping. */
  collisions: string[];
  /** Rows dropped for a blank name (or blank ID when an ID column is mapped). */
  skipped: number;
}

/**
 * Turn parsed sheet rows + a mapping into exactly what should be written.
 * Resolving the whole file before any DB write is the point: studentId is the
 * upsert key, so a duplicate means later rows silently overwrite earlier ones.
 */
export function planImport(rows: Record<string, string>[], map: Mapping): ImportPlan {
  const seen = new Map<string, string>(); // studentId -> name of the row that claimed it
  const collisions: string[] = [];
  const planned: PlannedRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    const namePart = String(row[map.fullName] ?? "").trim();
    const lastPart = map.lastName ? String(row[map.lastName] ?? "").trim() : "";
    const fullName = [namePart, lastPart].filter(Boolean).join(" ");
    const mappedId = map.studentId ? String(row[map.studentId] ?? "").trim() : "";
    if (!fullName || (map.studentId && !mappedId)) {
      skipped++;
      continue;
    }

    const studentId = map.studentId ? mappedId : synthId(fullName, seen);
    const claimedBy = seen.get(studentId);
    if (claimedBy !== undefined) {
      // Only reachable with a mapped column — synthId() never returns a taken key.
      if (collisions.length < 3) collisions.push(`${studentId}: ${claimedBy} / ${fullName}`);
      continue;
    }
    seen.set(studentId, fullName);

    planned.push({
      studentId,
      fullName,
      shiur: map.shiur ? String(row[map.shiur] ?? "").trim() || null : null,
      phone: map.phone ? String(row[map.phone] ?? "").trim() || null : null,
      aliases: map.aliases
        ? String(row[map.aliases] ?? "")
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
        : [],
    });
  }

  return { rows: planned, collisions, skipped };
}
