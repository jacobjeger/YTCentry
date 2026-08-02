"use server";

import * as XLSX from "xlsx";
import { prisma, normalizeName, audit } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { EMPTY_MAPPING, planImport, suggestMapping, type Mapping } from "./mapping";

// Do NOT re-export Mapping from here. Turbopack's "use server" transform emits
// a runtime reference for a re-exported type instead of erasing it, and the
// module dies on evaluation with "ReferenceError: Mapping is not defined".
// Both tsc and next build pass — it only fails when the page renders.
// Consumers import Mapping from "./mapping" directly.

export interface ParsedRoster {
  headers: string[];
  rows: Record<string, string>[];
  suggested: Mapping;
  error?: string;
}

export async function parseRoster(formData: FormData): Promise<ParsedRoster> {
  await requireUser();
  const t = getDictionary(await getLocale());

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { headers: [], rows: [], suggested: EMPTY_MAPPING, error: t.roster.parseError };
  }
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) throw new Error("no sheet");
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
      defval: "",
      raw: false,
    });
    if (rows.length === 0) {
      return { headers: [], rows: [], suggested: EMPTY_MAPPING, error: t.roster.empty };
    }
    const headers = Object.keys(rows[0]!);
    const suggested = suggestMapping(headers);
    return { headers, rows, suggested };
  } catch {
    return { headers: [], rows: [], suggested: EMPTY_MAPPING, error: t.roster.parseError };
  }
}

export interface ImportState {
  error?: string;
  ok?: string;
}

export async function importRoster(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());

  const map: Mapping = {
    studentId: String(formData.get("map_studentId") ?? ""),
    fullName: String(formData.get("map_fullName") ?? ""),
    lastName: String(formData.get("map_lastName") ?? ""),
    shiur: String(formData.get("map_shiur") ?? ""),
    phone: String(formData.get("map_phone") ?? ""),
    aliases: String(formData.get("map_aliases") ?? ""),
  };
  if (!map.fullName) {
    return { error: t.roster.needNameId };
  }

  let rows: Record<string, string>[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: t.roster.parseError };
  }

  // Resolve the whole file before touching the DB. studentId is the upsert
  // key, so two rows sharing one makes the second silently overwrite the first
  // — a wrong mapping (e.g. a year column of 1s and 2s) collapses the entire
  // roster onto a couple of records while still reporting success.
  const plan = planImport(rows, map);
  const { skipped } = plan;

  if (plan.collisions.length > 0) {
    const dupRows = rows.length - skipped - plan.rows.length;
    return {
      error: t.roster.dupIds
        .replace("{n}", String(dupRows))
        .replace("{col}", map.studentId)
        .replace("{examples}", plan.collisions.join("; ")),
    };
  }
  if (plan.rows.length === 0) return { error: t.roster.empty };

  let created = 0;
  let updated = 0;
  for (const { studentId, ...fields } of plan.rows) {
    const data = { ...fields, normalizedName: normalizeName(fields.fullName) };
    const existing = await prisma.rosterEntry.findUnique({ where: { studentId } });
    if (existing) {
      await prisma.rosterEntry.update({ where: { studentId }, data });
      updated++;
    } else {
      await prisma.rosterEntry.create({ data: { studentId, ...data } });
      created++;
    }
  }

  await audit({
    actorId: user.id,
    action: "roster.upload",
    targetType: "RosterEntry",
    targetId: "bulk",
    meta: { created, updated, skipped, total: rows.length },
  });

  let ok = t.roster.imported
    .replace("{created}", String(created))
    .replace("{updated}", String(updated));
  if (skipped > 0) ok += " " + t.roster.skippedNote.replace("{n}", String(skipped));
  return { ok };
}

// ── Roster view + manual add + photo selection ──────────────────────────────

export interface RosterRow {
  id: string;
  studentId: string;
  fullName: string;
  shiur: string | null;
  phone: string | null;
  status: string; // AWAITING_PHOTO | MATCHED | ENROLLED
  hasPhoto: boolean;
  enrolleeId: string | null;
}

/** The whole roster, newest first, with whether each person has a photo on file. */
export async function listRoster(): Promise<RosterRow[]> {
  await requireUser();
  const entries = await prisma.rosterEntry.findMany({
    orderBy: { createdAt: "desc" },
    include: { enrollee: { select: { id: true, photoPath: true } } },
  });
  return entries.map((e) => ({
    id: e.id,
    studentId: e.studentId,
    fullName: e.fullName,
    shiur: e.shiur,
    phone: e.phone,
    status: e.status,
    hasPhoto: !!e.enrollee?.photoPath,
    enrolleeId: e.enrollee?.id ?? null,
  }));
}

export type AddRosterState = { error?: string; ok?: string };

/** Manually add one person to the roster (on top of CSV import). */
export async function addRosterEntry(
  _prev: AddRosterState,
  formData: FormData,
): Promise<AddRosterState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());
  const fullName = String(formData.get("fullName") ?? "").trim();
  let studentId = String(formData.get("studentId") ?? "").trim();
  const shiur = String(formData.get("shiur") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!fullName) return { error: t.roster.needName ?? "Name is required." };

  // studentId is optional for a manual add — synthesize a stable one if blank.
  if (!studentId) studentId = `M-${normalizeName(fullName).replace(/\s+/g, "-")}`;

  const data = { fullName, normalizedName: normalizeName(fullName), shiur, phone };
  try {
    await prisma.rosterEntry.upsert({
      where: { studentId },
      create: { studentId, aliases: [], ...data },
      update: data,
    });
  } catch {
    return { error: t.common.error };
  }
  await audit({
    actorId: user.id,
    action: "roster.add",
    targetType: "RosterEntry",
    targetId: studentId,
    meta: { fullName },
  });
  return { ok: fullName };
}

export async function deleteRosterEntry(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.rosterEntry.deleteMany({ where: { id } });
  await audit({ actorId: user.id, action: "roster.remove", targetType: "RosterEntry", targetId: id });
}
