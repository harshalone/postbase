"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Check,
  Info,
  Upload,
  AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Column = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

type ImportStep = 1 | 2 | 3;

const BATCH_SIZE = 500;

// ─── CSV parser (handles quoted fields & escaped quotes) ──────────────────────

function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CsvImportPage({
  params,
}: {
  params: Promise<{ projectId: string; tableName: string }>;
}) {
  const { projectId, tableName } = use(params);
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<ImportStep>(1);

  // Step 1 – file
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [tableColumns, setTableColumns] = useState<Column[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  // Step 2 – mapping
  const [mapping, setMapping] = useState<Record<string, string>>({}); // csvHeader -> tableColumn

  // Step 3 – progress & result
  const [progress, setProgress] = useState(0); // 0-100
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);

  // ─── Fetch table columns ────────────────────────────────────────────────────

  async function fetchColumns() {
    setLoadingColumns(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/tables`);
      const data = await res.json();
      const table = (data.tables as { table_name: string; columns: Column[] }[])?.find(
        (t) => t.table_name === tableName
      );
      setTableColumns(table?.columns ?? []);
      return table?.columns ?? [];
    } finally {
      setLoadingColumns(false);
    }
  }

  // ─── File change handler ────────────────────────────────────────────────────

  async function handleFileChange(file: File | null) {
    setCsvFile(file);
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCsvText(text);
      setCsvHeaders(headers);
      setCsvRows(rows);

      // Fetch columns and auto-map matching headers
      const cols = tableColumns.length > 0 ? tableColumns : await fetchColumns();
      const colNames = cols.map((c) => c.column_name);
      const autoMap: Record<string, string> = {};
      headers.forEach((h) => {
        if (colNames.includes(h)) autoMap[h] = h;
      });
      setMapping(autoMap);
    };
    reader.readAsText(file);
  }

  // ─── Run import ─────────────────────────────────────────────────────────────

  async function runImport() {
    setImporting(true);
    setProgress(0);
    const allErrors: string[] = [];
    let totalImported = 0;

    // Build mapped rows, filtering out rows where all mapped values are empty
    const mappedRows: Record<string, unknown>[] = [];
    csvRows.forEach((row, i) => {
      const record: Record<string, unknown> = {};
      csvHeaders.forEach((h, idx) => {
        const col = mapping[h];
        if (col) {
          const val = row[idx] ?? "";
          // Send empty string as null so DB can apply defaults / nullability
          record[col] = val === "" ? null : val;
        }
      });
      if (Object.values(record).some((v) => v !== null && v !== "")) {
        mappedRows.push({ _csvRowIndex: i + 1, ...record });
      }
    });

    const totalRows = mappedRows.length;
    const batches: Record<string, unknown>[][] = [];
    for (let i = 0; i < mappedRows.length; i += BATCH_SIZE) {
      batches.push(mappedRows.slice(i, i + BATCH_SIZE));
    }

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b].map(({ _csvRowIndex: _, ...rest }) => rest);
      const batchStartRow = b * BATCH_SIZE;
      try {
        const res = await fetch(
          `/api/dashboard/${projectId}/tables/${tableName}/batch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: batch }),
          }
        );
        const data = await res.json() as { inserted: number; errors: string[]; error?: string };
        if (data.error) {
          allErrors.push(`Batch ${b + 1}: ${data.error}`);
        } else {
          totalImported += data.inserted;
          // Offset row error numbers to absolute CSV row positions
          data.errors.forEach((e) => {
            const match = e.match(/^Row (\d+): (.*)/);
            if (match) {
              const absRow = batchStartRow + parseInt(match[1], 10);
              allErrors.push(`Row ${absRow}: ${match[2]}`);
            } else {
              allErrors.push(e);
            }
          });
        }
      } catch (err) {
        allErrors.push(`Batch ${b + 1}: ${String(err)}`);
      }

      setProgress(Math.round(((b + 1) / batches.length) * 100));
    }

    setImportResult({ imported: totalImported, errors: allErrors });
    setImporting(false);
    setStep(3);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const mappedCount = Object.values(mapping).filter(Boolean).length;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800 shrink-0">
        <button
          onClick={() => router.push(`/dashboard/${projectId}/database`)}
          className="cursor-pointer flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 transition-colors text-sm"
        >
          <ArrowLeft size={14} />
          Back to database
        </button>
        <span className="text-zinc-700">/</span>
        <span className="text-zinc-400 text-sm">Import CSV</span>
        <span className="text-zinc-700">/</span>
        <code className="text-sm text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded font-mono">{tableName}</code>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-zinc-800 shrink-0">
        {([
          { label: "Upload file", step: 1 },
          { label: "Map columns", step: 2 },
          { label: "Import", step: 3 },
        ] as { label: string; step: ImportStep }[]).map(({ label, step: s }, idx) => {
          const active = step === s;
          const done = step > s;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${active ? "bg-zinc-800 text-white" : done ? "text-zinc-400" : "text-zinc-600"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${active ? "bg-brand-500 text-white" : done ? "bg-zinc-700 text-zinc-300" : "bg-zinc-800 text-zinc-600"}`}>
                  {done ? <Check size={10} /> : s}
                </div>
                {label}
              </div>
              {idx < 2 && <div className="w-8 h-px bg-zinc-800" />}
            </div>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Upload your CSV file</h1>
              <p className="text-sm text-zinc-500 mt-1">The first row must be the column headers. Supported encoding: UTF-8.</p>
            </div>

            <label className={`cursor-pointer w-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-16 transition-colors ${csvFile ? "border-brand-500 bg-brand-500/5" : "border-zinc-700 hover:border-zinc-500"}`}>
              {csvFile ? (
                <>
                  <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
                    <FileText size={22} className="text-brand-500" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-200">{csvFile.name}</p>
                  <p className="text-xs text-zinc-500">{csvRows.length.toLocaleString()} rows · {csvHeaders.length} columns detected</p>
                  <p className="text-xs text-zinc-600">Click to replace</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center">
                    <Upload size={22} className="text-zinc-500" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-300">Click to upload a CSV file</p>
                  <p className="text-xs text-zinc-500">The first row must contain column headers</p>
                </>
              )}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </label>

            {/* Preview table */}
            {csvFile && csvHeaders.length > 0 && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                  <p className="text-xs font-medium text-zinc-400">Preview — first 5 rows</p>
                  <p className="text-xs text-zinc-600">{csvRows.length.toLocaleString()} total rows</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {csvHeaders.map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-zinc-400 font-medium whitespace-nowrap border-r border-zinc-800 last:border-r-0">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-zinc-800/50 last:border-b-0">
                          {csvHeaders.map((_, j) => (
                            <td key={j} className="px-3 py-2 text-zinc-400 whitespace-nowrap border-r border-zinc-800 last:border-r-0 max-w-[180px] truncate">{row[j] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                disabled={!csvFile || csvHeaders.length === 0 || loadingColumns}
                onClick={async () => {
                  if (tableColumns.length === 0) await fetchColumns();
                  setStep(2);
                }}
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                {loadingColumns ? "Loading columns…" : "Next: Map columns"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Map columns ── */}
        {step === 2 && (
          <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Map CSV columns to table columns</h1>
              <p className="text-sm text-zinc-500 mt-1">
                {mappedCount} of {csvHeaders.length} CSV columns mapped.
                Unmapped columns will be skipped.
              </p>
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_32px_1fr] gap-4 px-4 py-2.5 border-b border-zinc-800 bg-zinc-800/50">
                <p className="text-xs font-medium text-zinc-500">CSV column</p>
                <div />
                <p className="text-xs font-medium text-zinc-500">Table column</p>
              </div>
              <div className="divide-y divide-zinc-800">
                {csvHeaders.map((header) => (
                  <div key={header} className="grid grid-cols-[1fr_32px_1fr] gap-4 items-center px-4 py-3">
                    <div>
                      <p className="text-sm text-zinc-200 font-mono truncate">{header}</p>
                    </div>
                    <div className="text-zinc-600 text-center text-sm">→</div>
                    <div>
                      <select
                        value={mapping[header] ?? ""}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [header]: e.target.value }))
                        }
                        className="cursor-pointer w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-brand-500"
                      >
                        <option value="">— skip —</option>
                        {tableColumns.map((col) => (
                          <option key={col.column_name} value={col.column_name}>
                            {col.column_name} ({col.data_type})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="cursor-pointer px-5 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
              >
                Back
              </button>
              <button
                disabled={mappedCount === 0}
                onClick={() => { setStep(3); runImport(); }}
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                Import {csvRows.length.toLocaleString()} rows
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Import progress & result ── */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">
                {importing ? "Importing…" : "Import complete"}
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                {importing
                  ? `Processing ${csvRows.length.toLocaleString()} rows in batches of ${BATCH_SIZE}`
                  : importResult
                    ? `${importResult.imported.toLocaleString()} rows imported successfully`
                    : ""}
              </p>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{importing ? "Uploading batches…" : "Done"}</span>
                <span className="font-mono font-semibold text-zinc-300">{progress}%</span>
              </div>
              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {importing && (
                <p className="text-xs text-zinc-600">
                  Batch {Math.ceil((progress / 100) * Math.ceil(csvRows.length / BATCH_SIZE))} of {Math.ceil(csvRows.length / BATCH_SIZE)}
                </p>
              )}
            </div>

            {/* Stats */}
            {!importing && importResult && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Check size={14} className="text-green-400" />
                    <p className="text-xs text-zinc-500 font-medium">Imported</p>
                  </div>
                  <p className="text-2xl font-bold text-zinc-100">{importResult.imported.toLocaleString()}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle size={14} className={importResult.errors.length > 0 ? "text-red-400" : "text-zinc-600"} />
                    <p className="text-xs text-zinc-500 font-medium">Failed</p>
                  </div>
                  <p className={`text-2xl font-bold ${importResult.errors.length > 0 ? "text-red-400" : "text-zinc-100"}`}>
                    {importResult.errors.length.toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {/* Error list */}
            {!importing && importResult && importResult.errors.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
                  <Info size={13} className="text-yellow-400" />
                  <p className="text-xs font-medium text-zinc-400">Row errors</p>
                  <span className="ml-auto text-xs text-zinc-600">{importResult.errors.length} errors</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800">
                  {importResult.errors.map((err, i) => (
                    <p key={i} className="px-4 py-2.5 text-xs text-red-400 font-mono">{err}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {!importing && (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setStep(1);
                    setCsvFile(null);
                    setCsvHeaders([]);
                    setCsvRows([]);
                    setMapping({});
                    setProgress(0);
                    setImportResult(null);
                  }}
                  className="cursor-pointer px-5 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
                >
                  Import another file
                </button>
                <button
                  onClick={() => router.push(`/dashboard/${projectId}/database`)}
                  className="cursor-pointer px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
                >
                  Back to database
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
