"use server";

import * as XLSX from "xlsx";
import { prisma, normalizeName, audit } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export interface ParsedRoster {
  headers: string[];
  rows: Record<string, string>[];
  suggested: Mapping;
  error?: string;
}

export interface Mapping {
  studentId: string;
  fullName: string;
  shiur: string;
  phone: string;
  aliases: string;
}

const EMPTY: Mapping = {
  studentId: "",
  fullName: "",
  shiur: "",
  phone: "",
  aliases: "",
};

/** Header auto-detection — pick the first header matching any keyword. */
function detect(headers: string[], keywords: string[]): string {
  const low = headers.map((h) => h.toLowerCase().trim());
  for (const kw of keywords) {
    const i = low.findIndex((h) => h.includes(kw));
    if (i >= 0) return headers[i]!;
  }
  return "";
}

export async function parseRoster(formData: FormData): Promise<ParsedRoster> {
  await requireUser();
  const t = getDictionary(await getLocale());

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { headers: [], rows: [], suggested: EMPTY, error: t.roster.parseError };
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
      return { headers: [], rows: [], suggested: EMPTY, error: t.roster.empty };
    }
    const headers = Object.keys(rows[0]!);
    const suggested: Mapping = {
      studentId: detect(headers, ["student id", "studentid", "id", "מספר", "מס"]),
      fullName: detect(headers, ["name", "full", "talmid", "שם"]),
      shiur: detect(headers, ["shiur", "class", "grade", "שיעור"]),
      phone: detect(headers, ["phone", "cell", "mobile", "טלפון", "נייד"]),
      aliases: detect(headers, ["alias", "aka", "nickname", "כינוי"]),
    };
    return { headers, rows, suggested };
  } catch {
    return { headers: [], rows: [], suggested: EMPTY, error: t.roster.parseError };
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
    shiur: String(formData.get("map_shiur") ?? ""),
    phone: String(formData.get("map_phone") ?? ""),
    aliases: String(formData.get("map_aliases") ?? ""),
  };
  if (!map.studentId || !map.fullName) {
    return { error: t.roster.needNameId };
  }

  let rows: Record<string, string>[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: t.roster.parseError };
  }

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const studentId = String(row[map.studentId] ?? "").trim();
    const fullName = String(row[map.fullName] ?? "").trim();
    if (!studentId || !fullName) continue;

    const aliases = map.aliases
      ? String(row[map.aliases] ?? "")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      : [];
    const data = {
      fullName,
      normalizedName: normalizeName(fullName),
      shiur: map.shiur ? String(row[map.shiur] ?? "").trim() || null : null,
      phone: map.phone ? String(row[map.phone] ?? "").trim() || null : null,
      aliases,
    };

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
    meta: { created, updated, total: rows.length },
  });

  return { ok: fmtImported(t.roster.imported, created, updated) };
}

function fmtImported(template: string, created: number, updated: number): string {
  return template
    .replace("{created}", String(created))
    .replace("{updated}", String(updated));
}
