/**
 * Match an incoming (emailed) photo to a roster entry.
 *
 * Strategy (CLAUDE.md "Matching"): exact-match on student ID when present;
 * otherwise rank roster candidates with Postgres pg_trgm similarity() (fast,
 * indexed), re-score with diceScore, and bucket() into a decision. Nothing here
 * auto-approves — it only proposes candidates for a human in the Review Queue.
 */
import { prisma } from "./db";
import { normalizeName, diceScore, bucket, type Candidate } from "./match";

export interface MatchResult {
  candidates: Candidate[];
  decision: "auto_suggest" | "needs_match" | "no_match";
  /** set only on an exact student-ID hit */
  exactRosterId?: string;
  exactStudentId?: string;
}

export async function matchRoster(opts: {
  parsedName?: string | null;
  studentId?: string | null;
}): Promise<MatchResult> {
  // 1. Exact student-ID hit wins outright.
  if (opts.studentId) {
    const hit = await prisma.rosterEntry.findUnique({
      where: { studentId: opts.studentId.trim() },
    });
    if (hit) {
      return {
        candidates: [{ studentId: hit.studentId, name: hit.fullName, score: 1 }],
        decision: "auto_suggest",
        exactRosterId: hit.id,
        exactStudentId: hit.studentId,
      };
    }
  }

  // 2. Fuzzy name match via pg_trgm, re-scored with diceScore.
  const name = (opts.parsedName ?? "").trim();
  if (!name) return { candidates: [], decision: "no_match" };
  const q = normalizeName(name);

  const rows = await prisma.$queryRawUnsafe<
    { studentId: string; fullName: string; score: number }[]
  >(
    `SELECT "studentId", "fullName", similarity("normalizedName", $1) AS score
     FROM "RosterEntry"
     WHERE "status" <> 'ENROLLED'
     ORDER BY score DESC
     LIMIT 8`,
    q,
  );

  const candidates: Candidate[] = rows
    .map((r) => ({
      studentId: r.studentId,
      name: r.fullName,
      // blend trigram (DB) with diceScore (token-set) for a steadier ranking
      score: Math.max(Number(r.score), diceScore(name, r.fullName)),
    }))
    .sort((a, b) => b.score - a.score);

  const { decision, top } = bucket(candidates);
  return { candidates: top, decision };
}
