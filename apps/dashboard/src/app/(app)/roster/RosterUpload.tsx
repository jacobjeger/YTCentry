"use client";

import { useActionState, useState, useTransition } from "react";
import {
  parseRoster,
  importRoster,
  type ParsedRoster,
  type Mapping,
  type ImportState,
} from "./actions";
import { useT } from "@/components/LocaleProvider";

const sel =
  "rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze";

export default function RosterUpload() {
  const t = useT();
  const [parsed, setParsed] = useState<ParsedRoster | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [parsing, startParsing] = useTransition();
  const [parseErr, setParseErr] = useState<string | null>(null);

  const [importState, importAction, importing] = useActionState<
    ImportState,
    FormData
  >(importRoster, {});

  function onFile(file: File | null) {
    if (!file) return;
    setParseErr(null);
    const fd = new FormData();
    fd.append("file", file);
    startParsing(async () => {
      const res = await parseRoster(fd);
      if (res.error) {
        setParseErr(res.error);
        return;
      }
      setParsed(res);
      setMapping(res.suggested);
    });
  }

  function resetFile() {
    setParsed(null);
    setMapping(null);
    setParseErr(null);
  }

  if (importState.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6">
        <p className="text-green-800 font-medium">{importState.ok}</p>
        <button
          onClick={() => {
            resetFile();
            window.location.reload();
          }}
          className="mt-3 rounded-lg bg-bronze px-4 py-2 text-white text-sm font-medium hover:bg-bronze-dark"
        >
          {t.roster.back}
        </button>
      </div>
    );
  }

  if (!parsed || !mapping) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 flex flex-col items-center gap-3">
        <label className="text-sm text-stone-600">{t.roster.chooseFile}</label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={parsing}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        {parsing ? <p className="text-sm text-stone-400">{t.roster.parsing}</p> : null}
        {parseErr ? <p className="text-sm text-red-600">{parseErr}</p> : null}
      </div>
    );
  }

  const preview = parsed.rows.slice(0, 5);
  const fields: { key: keyof Mapping; label: string; required?: boolean; hint?: string }[] =
    [
      { key: "studentId", label: t.roster.colStudentId, required: true },
      { key: "fullName", label: t.roster.colName, required: true },
      { key: "shiur", label: t.roster.colShiur },
      { key: "phone", label: t.roster.colPhone },
      { key: "aliases", label: t.roster.colAliases, hint: t.roster.aliasesHint },
    ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-600">
          {t.roster.rowsFound.replace("{count}", String(parsed.rows.length))}
        </p>
        <button
          onClick={resetFile}
          className="text-sm text-bronze-dark hover:underline"
        >
          {t.roster.back}
        </button>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-semibold mb-3">{t.roster.mapping}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-sm font-medium text-stone-700">
                {f.label} {f.required ? "*" : ""}
              </span>
              <select
                value={mapping[f.key]}
                onChange={(e) =>
                  setMapping({ ...mapping, [f.key]: e.target.value })
                }
                className={sel}
              >
                <option value="">{t.roster.none}</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              {f.hint ? (
                <span className="text-xs text-stone-400">{f.hint}</span>
              ) : null}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-4 py-2 bg-stone-50 text-sm font-medium text-stone-600">
          {t.roster.preview}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                {parsed.headers.map((h) => (
                  <th key={h} className="px-3 py-2 text-start font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {preview.map((row, i) => (
                <tr key={i}>
                  {parsed.headers.map((h) => (
                    <td key={h} className="px-3 py-2 whitespace-nowrap text-stone-600">
                      {row[h]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form action={importAction} className="flex items-center gap-3">
        <input type="hidden" name="rows" value={JSON.stringify(parsed.rows)} />
        {(Object.keys(mapping) as (keyof Mapping)[]).map((k) => (
          <input key={k} type="hidden" name={`map_${k}`} value={mapping[k]} />
        ))}
        <button
          type="submit"
          disabled={importing}
          className="rounded-lg bg-bronze px-6 py-3 text-white font-semibold hover:bg-bronze-dark disabled:opacity-50"
        >
          {importing ? t.roster.importing : t.roster.import}
        </button>
        {importState.error ? (
          <span className="text-sm text-red-600">{importState.error}</span>
        ) : null}
      </form>
    </div>
  );
}
