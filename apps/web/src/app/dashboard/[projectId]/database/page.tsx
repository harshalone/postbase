"use client";

import { useState, useEffect, useCallback, use } from "react";
import {
  Table2,
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Info,
  GripVertical,
  Search,
  ArrowUpDown,
  ChevronDown,
  Rows2,
  Columns2,
  FileText,
  ExternalLink,
  Pencil,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Column = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

type TableMeta = {
  table_name: string;
  row_estimate: string;
  size_bytes: string;
  columns: Column[];
};

type Policy = {
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string[];
  cmd: string;
  qual: string | null;
  with_check: string | null;
};

type RlsTable = { tablename: string; rls_enabled: boolean };

type Tab = "tables" | "rls";

// ─── RLS Templates ────────────────────────────────────────────────────────────

const RLS_TEMPLATES = [
  {
    label: "Enable read access for all users",
    description: "This policy gives read access to your table for all users via the SELECT operation.",
    policyName: "Enable read access for all users",
    cmd: "SELECT",
    behavior: "PERMISSIVE",
    using: "true",
    withCheck: "",
  },
  {
    label: "Enable insert for authenticated users only",
    description: "This policy gives insert access to your table for all authenticated users only.",
    policyName: "Enable insert for authenticated users only",
    cmd: "INSERT",
    behavior: "PERMISSIVE",
    using: "",
    withCheck: "auth.role() = 'authenticated'",
  },
  {
    label: "Enable delete for users based on user_id",
    description: "This policy assumes that your table has a column \"user_id\", and allows users to delete rows which the \"user_id\" column matches their ID.",
    policyName: "Enable delete for users based on user_id",
    cmd: "DELETE",
    behavior: "PERMISSIVE",
    using: "auth.uid() = user_id",
    withCheck: "",
  },
  {
    label: "Enable insert for users based on user_id",
    description: "This policy assumes that your table has a column \"user_id\", and allows users to insert rows which the \"user_id\" column matches their ID.",
    policyName: "Enable insert for users based on user_id",
    cmd: "INSERT",
    behavior: "PERMISSIVE",
    using: "",
    withCheck: "auth.uid() = user_id",
  },
  {
    label: "Policy with table joins",
    description: "Query across tables to build more advanced RLS rules. Assuming 2 tables called teams and members, you can query both tables in the policy to control access to the members table.",
    policyName: "Policy with table joins",
    cmd: "UPDATE",
    behavior: "PERMISSIVE",
    using: "auth.uid() IN (SELECT user_id FROM members WHERE team_id = members.team_id)",
    withCheck: "",
  },
  {
    label: "Policy with security definer functions",
    description: "Useful in a many-to-many relationship where you want to restrict access to the linking table.",
    policyName: "Policy with security definer functions",
    cmd: "ALL",
    behavior: "PERMISSIVE",
    using: "is_member_of(auth.uid(), team_id)",
    withCheck: "",
  },
];

// ─── Column types for new table ───────────────────────────────────────────────

const COL_TYPES = [
  "uuid", "text", "varchar(255)", "int4", "int8", "float8",
  "boolean", "jsonb", "timestamptz", "date", "numeric",
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DatabasePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [tab, setTab] = useState<Tab>("tables");

  // Tables state
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState<Record<string, unknown>[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tableOffset, setTableOffset] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const TABLE_LIMIT = 50;

  // New table dialog
  const [showNewTable, setShowNewTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableDescription, setNewTableDescription] = useState("");
  const [enableRls, setEnableRls] = useState(true);
  const [newTableCols, setNewTableCols] = useState([
    { name: "id", type: "uuid", nullable: false, primaryKey: true, default: "gen_random_uuid()" },
    { name: "created_at", type: "timestamptz", nullable: false, primaryKey: false, default: "now()" },
  ]);
  const [creatingTable, setCreatingTable] = useState(false);
  const [dragColIndex, setDragColIndex] = useState<number | null>(null);
  const [tableView, setTableView] = useState<"data" | "definition">("data");
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showInsertRow, setShowInsertRow] = useState(false);
  const [insertRowValues, setInsertRowValues] = useState<Record<string, string>>({});
  const [insertRowLoading, setInsertRowLoading] = useState(false);
  const [createMoreRow, setCreateMoreRow] = useState(false);
  const [showInsertCol, setShowInsertCol] = useState(false);
  const [insertColForm, setInsertColForm] = useState({ name: "", description: "", type: "", isArray: false, defaultValue: "", isPrimaryKey: false });
  const [insertColLoading, setInsertColLoading] = useState(false);
  const [createMoreCol, setCreateMoreCol] = useState(false);

  // SQL editor state

  // RLS state
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [rlsTables, setRlsTables] = useState<RlsTable[]>([]);
  const [rlsLoading, setRlsLoading] = useState(false);
  const [selectedRlsTable, setSelectedRlsTable] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    table: "",
    policyName: "",
    cmd: "SELECT",
    behavior: "PERMISSIVE",
    targetRoles: "",
    using: "",
    withCheck: "",
  });
  const [showEditPolicy, setShowEditPolicy] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [editPolicyForm, setEditPolicyForm] = useState({
    policyName: "",
    cmd: "SELECT",
    behavior: "PERMISSIVE",
    targetRoles: "",
    using: "",
    withCheck: "",
  });
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // ─── Data fetchers ──────────────────────────────────────────────────────────

  const fetchTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/tables`);
      const data = await res.json();
      setTables(data.tables ?? []);
    } finally {
      setTablesLoading(false);
    }
  }, [projectId]);

  const fetchTableRows = useCallback(
    async (tableName: string, offset = 0) => {
      setTableLoading(true);
      try {
        const res = await fetch(
          `/api/dashboard/${projectId}/tables/${tableName}?limit=${TABLE_LIMIT}&offset=${offset}`
        );
        const data = await res.json();
        setTableRows(data.rows ?? []);
        setTableTotal(data.total ?? 0);
        setTableOffset(offset);
      } finally {
        setTableLoading(false);
      }
    },
    [projectId]
  );

  const fetchRls = useCallback(async () => {
    setRlsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/rls`);
      const data = await res.json();
      setPolicies(data.policies ?? []);
      setRlsTables(data.rlsTables ?? []);
    } finally {
      setRlsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    if (tab === "rls") fetchRls();
  }, [tab, fetchRls]);

  function handleSelectTable(name: string) {
    setSelectedTable(name);
    fetchTableRows(name, 0);
  }

  // ─── Insert row ─────────────────────────────────────────────────────────────

  async function insertRow() {
    if (!selectedTable) return;
    setInsertRowLoading(true);
    try {
      const filtered = Object.fromEntries(
        Object.entries(insertRowValues).filter(([, v]) => v !== "")
      );
      const res = await fetch(`/api/dashboard/${projectId}/tables/${selectedTable}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filtered),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      if (!createMoreRow) setShowInsertRow(false);
      setInsertRowValues({});
      fetchTableRows(selectedTable, tableOffset);
    } finally {
      setInsertRowLoading(false);
    }
  }

  // ─── Insert column ───────────────────────────────────────────────────────────

  async function insertColumn() {
    if (!selectedTable || !insertColForm.name.trim() || !insertColForm.type) return;
    setInsertColLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/tables/${selectedTable}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(insertColForm),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      if (!createMoreCol) setShowInsertCol(false);
      setInsertColForm({ name: "", description: "", type: "", isArray: false, defaultValue: "", isPrimaryKey: false });
      fetchTables();
    } finally {
      setInsertColLoading(false);
    }
  }

  // ─── SQL runner ─────────────────────────────────────────────────────────────

  // ─── Create table ────────────────────────────────────────────────────────────

  async function createTable() {
    if (!newTableName.trim() || newTableCols.length === 0) return;
    setCreatingTable(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTableName, columns: newTableCols }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      setShowNewTable(false);
      setNewTableName("");
      setNewTableDescription("");
      setEnableRls(true);
      setNewTableCols([
        { name: "id", type: "uuid", nullable: false, primaryKey: true, default: "gen_random_uuid()" },
        { name: "created_at", type: "timestamptz", nullable: false, primaryKey: false, default: "now()" },
      ]);
      await fetchTables();
    } finally {
      setCreatingTable(false);
    }
  }

  // ─── RLS actions ─────────────────────────────────────────────────────────────

  async function toggleRls(tableName: string, currentlyEnabled: boolean) {
    await fetch(`/api/dashboard/${projectId}/rls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: currentlyEnabled ? "disable_rls" : "enable_rls",
        table: tableName,
      }),
    });
    fetchRls();
  }

  async function dropPolicy(tableName: string, policyName: string) {
    setConfirmModal({
      message: `Drop policy "${policyName}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch(`/api/dashboard/${projectId}/rls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "drop_policy", table: tableName, policyName }),
        });
        fetchRls();
      },
    });
  }

  async function createPolicy() {
    if (!policyForm.table || !policyForm.policyName) return;
    const res = await fetch(`/api/dashboard/${projectId}/rls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_policy",
        table: policyForm.table,
        policyName: policyForm.policyName,
        cmd: policyForm.cmd,
        using: policyForm.using || undefined,
        withCheck: policyForm.withCheck || undefined,
        permissive: policyForm.behavior === "PERMISSIVE",
      }),
    });
    const data = await res.json();
    if (data.error) { setErrorModal(data.error); return; }
    setShowNewPolicy(false);
    fetchRls();
  }

  function openEditPolicy(p: Policy) {
    const roles = Array.isArray(p.roles)
      ? p.roles.filter((r) => r !== "public").join(", ")
      : String(p.roles).replace(/[{}]/g, "").split(",").map((r) => r.trim()).filter((r) => r !== "public").join(", ");
    setEditingPolicy(p);
    setEditPolicyForm({
      policyName: p.policyname,
      cmd: p.cmd,
      behavior: p.permissive === "PERMISSIVE" ? "PERMISSIVE" : "RESTRICTIVE",
      targetRoles: roles,
      using: p.qual ?? "",
      withCheck: p.with_check ?? "",
    });
    setShowEditPolicy(true);
  }

  async function updatePolicy() {
    if (!editingPolicy || !editPolicyForm.policyName) return;
    // Drop old then recreate with new settings
    await fetch(`/api/dashboard/${projectId}/rls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "drop_policy", table: editingPolicy.tablename, policyName: editingPolicy.policyname }),
    });
    const res = await fetch(`/api/dashboard/${projectId}/rls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_policy",
        table: editingPolicy.tablename,
        policyName: editPolicyForm.policyName,
        cmd: editPolicyForm.cmd,
        using: editPolicyForm.using || undefined,
        withCheck: editPolicyForm.withCheck || undefined,
        permissive: editPolicyForm.behavior === "PERMISSIVE",
      }),
    });
    const data = await res.json();
    if (data.error) { setErrorModal(data.error); return; }
    setShowEditPolicy(false);
    setEditingPolicy(null);
    fetchRls();
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const selectedTableMeta = tables.find((t) => t.table_name === selectedTable);
  const colHeaders = selectedTableMeta?.columns.map((c) => c.column_name) ?? [];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 h-14 border-b border-zinc-800 shrink-0">
        {(
          [
            { id: "tables", label: "Tables", icon: Table2 },
            { id: "rls", label: "RLS Policies", icon: Shield },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {/* ── Tables Tab ── */}
        {tab === "tables" && (
          <div className="flex h-full">
            {/* Table list sidebar */}
            <div className="w-56 shrink-0 border-r border-zinc-800 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Tables
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={fetchTables}
                    title="Refresh"
                    className="cursor-pointer p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <RefreshCw size={12} />
                  </button>
                  <button
                    onClick={() => setShowNewTable(true)}
                    title="New table"
                    className="cursor-pointer p-1 rounded bg-brand-500 hover:bg-brand-600 text-white transition-colors"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
              <ul className="flex-1 overflow-y-auto py-2">
                {tablesLoading ? (
                  <li className="px-4 py-3 text-xs text-zinc-600">Loading…</li>
                ) : tables.length === 0 ? (
                  <li className="px-4 py-8 text-center text-xs text-zinc-600">
                    No tables yet.
                    <br />
                    <button
                      onClick={() => setShowNewTable(true)}
                      className="cursor-pointer mt-2 text-brand-400 hover:text-brand-300"
                    >
                      Create one
                    </button>
                  </li>
                ) : (
                  tables.map((t) => (
                    <li key={t.table_name}>
                      <button
                        onClick={() => handleSelectTable(t.table_name)}
                        className={`cursor-pointer w-full text-left px-4 py-2 text-sm transition-colors ${
                          selectedTable === t.table_name
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                        }`}
                      >
                        <span className="block truncate">{t.table_name}</span>
                        <span className="block text-xs text-zinc-600">
                          ~{Number(t.row_estimate).toLocaleString()} rows
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Table content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {!selectedTable ? (
                <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
                  Select a table to view its data
                </div>
              ) : (
                <>
                  {/* Toolbar */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-48 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-500 cursor-text">
                      <Search size={12} className="shrink-0 text-zinc-600" />
                      <span className="truncate">
                        Filter by {selectedTableMeta?.columns.slice(0, 3).map((c) => c.column_name).join(", ")}
                        {(selectedTableMeta?.columns.length ?? 0) > 3 ? "…" : ""} or ask AI
                      </span>
                    </div>
                    <button className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 transition-colors bg-zinc-900">
                      <ArrowUpDown size={11} />
                      Sort
                    </button>
                    <button className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 transition-colors bg-zinc-900">
                      <Shield size={11} />
                      RLS policies
                    </button>
                    <div className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs border border-zinc-800 bg-zinc-900">
                      <span className="text-zinc-600">Role</span>
                      <span className="text-zinc-300 font-medium">postgres</span>
                    </div>
                    <button
                      onClick={() => fetchTableRows(selectedTable, tableOffset)}
                      className="cursor-pointer p-1.5 rounded text-zinc-500 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700 bg-zinc-900 transition-colors"
                    >
                      <RefreshCw size={13} />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setShowInsertMenu((v) => !v)}
                        className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-brand-500 hover:bg-brand-600 text-white transition-colors"
                      >
                        <ChevronDown size={12} />
                        Insert
                      </button>
                      {showInsertMenu && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowInsertMenu(false)} />
                          <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden py-1">
                            {[
                              {
                                icon: Rows2,
                                label: "Insert row",
                                sub: `Insert a new row into ${selectedTable}`,
                                onClick: () => { setShowInsertMenu(false); setShowInsertRow(true); },
                              },
                              {
                                icon: Columns2,
                                label: "Insert column",
                                sub: `Insert a new column into ${selectedTable}`,
                                onClick: () => { setShowInsertMenu(false); setShowInsertCol(true); },
                              },
                              {
                                icon: FileText,
                                label: "Import data from CSV",
                                sub: "Insert new rows from a CSV",
                                onClick: () => setShowInsertMenu(false),
                              },
                            ].map(({ icon: Icon, label, sub, onClick }) => (
                              <button
                                key={label}
                                onClick={onClick}
                                className="cursor-pointer w-full flex items-start gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left"
                              >
                                <Icon size={18} className="text-zinc-400 mt-0.5 shrink-0" />
                                <div>
                                  <div className="text-sm text-zinc-100 font-medium">{label}</div>
                                  <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Data / Definition view */}
                  {tableView === "definition" ? (
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 bg-zinc-950 z-10">
                          <tr className="border-b border-zinc-800">
                            {["Name", "Type", "Nullable", "Default"].map((h) => (
                              <th key={h} className="text-left px-4 py-2.5 text-zinc-500 font-medium whitespace-nowrap border-r border-zinc-800 last:border-r-0">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTableMeta?.columns.map((col, i) => (
                            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                              <td className="px-4 py-2.5 text-zinc-200 font-mono border-r border-zinc-800">{col.column_name}</td>
                              <td className="px-4 py-2.5 border-r border-zinc-800">
                                <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">{col.data_type}</span>
                              </td>
                              <td className="px-4 py-2.5 text-zinc-400 border-r border-zinc-800">{col.is_nullable === "YES" ? "YES" : "NO"}</td>
                              <td className="px-4 py-2.5 text-zinc-500 font-mono">{col.column_default ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 bg-zinc-950 z-10">
                          <tr className="border-b border-zinc-800">
                            <th className="w-10 px-3 py-2.5 border-r border-zinc-800 bg-zinc-950 text-zinc-700 font-normal select-none" />
                            {selectedTableMeta?.columns.map((col) => (
                              <th
                                key={col.column_name}
                                className="text-left px-3 py-2.5 font-medium border-r border-zinc-800 last:border-r-0 whitespace-nowrap min-w-30"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-zinc-200">{col.column_name}</span>
                                  <span className="text-[10px] text-zinc-600 font-normal font-mono">{col.data_type}</span>
                                </div>
                              </th>
                            ))}
                            <th className="w-8 border-r-0" />
                          </tr>
                        </thead>
                        <tbody>
                          {tableLoading ? (
                            <tr>
                              <td colSpan={99} className="px-4 py-12 text-center text-zinc-600">Loading…</td>
                            </tr>
                          ) : tableRows.length === 0 ? (
                            <tr>
                              <td colSpan={99} className="px-4 py-12 text-center text-zinc-600">No rows in this table</td>
                            </tr>
                          ) : tableRows.map((row, i) => (
                            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 group">
                              <td className="px-3 py-2 text-zinc-700 border-r border-zinc-800 text-center font-mono select-none">
                                {tableOffset + i + 1}
                              </td>
                              {selectedTableMeta?.columns.map((col) => (
                                <td
                                  key={col.column_name}
                                  className="px-3 py-2 text-zinc-300 border-r border-zinc-800 last:border-r-0 max-w-xs truncate"
                                  title={String(row[col.column_name] ?? "")}
                                >
                                  {row[col.column_name] === null || row[col.column_name] === undefined ? (
                                    <span className="text-zinc-700 italic">NULL</span>
                                  ) : typeof row[col.column_name] === "object" ? (
                                    <span className="font-mono text-zinc-400">{JSON.stringify(row[col.column_name])}</span>
                                  ) : (
                                    String(row[col.column_name])
                                  )}
                                </td>
                              ))}
                              <td className="px-2 py-2">
                                <button
                                  onClick={async () => {
                                    const pkCol = colHeaders.find((c) => c === "id") ?? colHeaders[0];
                                    if (!pkCol) return;
                                    if (!confirm("Delete this row?")) return;
                                    await fetch(`/api/dashboard/${projectId}/tables/${selectedTable}`, {
                                      method: "DELETE",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ where: { [pkCol]: row[pkCol] } }),
                                    });
                                    fetchTableRows(selectedTable, tableOffset);
                                  }}
                                  className="cursor-pointer opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-all"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 shrink-0 bg-zinc-950">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <button
                        disabled={tableOffset === 0}
                        onClick={() => fetchTableRows(selectedTable, tableOffset - TABLE_LIMIT)}
                        className="cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed p-1 rounded hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <span>
                        Page {Math.floor(tableOffset / TABLE_LIMIT) + 1} of{" "}
                        {Math.max(1, Math.ceil(tableTotal / TABLE_LIMIT))}
                      </span>
                      <button
                        disabled={tableOffset + TABLE_LIMIT >= tableTotal}
                        onClick={() => fetchTableRows(selectedTable, tableOffset + TABLE_LIMIT)}
                        className="cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed p-1 rounded hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      >
                        <ChevronRight size={13} />
                      </button>
                      <div className="h-3 w-px bg-zinc-800 mx-1" />
                      <span className="text-zinc-600">{TABLE_LIMIT} rows</span>
                      <div className="h-3 w-px bg-zinc-800 mx-1" />
                      <span>{tableTotal.toLocaleString()} records</span>
                    </div>
                    <div className="flex items-center rounded border border-zinc-800 overflow-hidden text-xs">
                      <button
                        onClick={() => setTableView("data")}
                        className={`cursor-pointer px-3 py-1.5 transition-colors ${tableView === "data" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        Data
                      </button>
                      <button
                        onClick={() => setTableView("definition")}
                        className={`cursor-pointer px-3 py-1.5 transition-colors ${tableView === "definition" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        Definition
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── SQL Editor Tab ── */}
        {/* ── RLS Policies Tab ── */}
        {tab === "rls" && (
          <div className="flex h-full overflow-hidden">
            {/* Left: table list */}
            <div className="w-56 shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-950">
              <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tables</span>
                <button onClick={fetchRls} className="cursor-pointer p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                  <RefreshCw size={12} />
                </button>
              </div>
              {rlsLoading ? (
                <p className="px-4 py-3 text-xs text-zinc-600">Loading…</p>
              ) : rlsTables.length === 0 ? (
                <p className="px-4 py-3 text-xs text-zinc-600">No tables found.</p>
              ) : (
                <ul className="flex-1 overflow-y-auto py-1">
                  {rlsTables.map((t) => (
                    <li key={t.tablename}>
                      <button
                        onClick={() => setSelectedRlsTable(t.tablename)}
                        className={`cursor-pointer w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                          selectedRlsTable === t.tablename
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                      >
                        <span className="text-xs truncate">{t.tablename}</span>
                        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${t.rls_enabled ? "bg-green-400" : "bg-zinc-600"}`} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Right: policies for selected table */}
            <div className="flex-1 overflow-y-auto">
              {!selectedRlsTable ? (
                <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                  Select a table to view its policies
                </div>
              ) : (() => {
                const t = rlsTables.find((x) => x.tablename === selectedRlsTable)!;
                const tablePolicies = policies.filter((p) => p.tablename === selectedRlsTable);
                return (
                  <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800">
                      <div className="flex items-center gap-2">
                        <Table2 size={14} className="text-zinc-500" />
                        <span className="text-sm font-medium text-white">{t.tablename}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleRls(t.tablename, t.rls_enabled)}
                          className="cursor-pointer px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                        >
                          {t.rls_enabled ? "Disable RLS" : "Enable RLS"}
                        </button>
                        {t.rls_enabled && (
                          <button
                            onClick={() => { setPolicyForm((f) => ({ ...f, table: t.tablename })); setShowNewPolicy(true); }}
                            className="cursor-pointer px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
                          >
                            Create policy
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Policies */}
                    {!t.rls_enabled ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center px-6 py-8">
                          <Shield size={28} className="mx-auto text-zinc-700 mb-3" />
                          <p className="text-sm text-zinc-400 font-medium mb-1">RLS is disabled for this table</p>
                          <p className="text-xs text-zinc-600 mb-4">Enable Row Level Security to control access with policies.</p>
                          <button onClick={() => toggleRls(t.tablename, false)}
                            className="cursor-pointer px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
                            Enable RLS
                          </button>
                        </div>
                      </div>
                    ) : tablePolicies.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center px-6 py-8">
                          <Shield size={28} className="mx-auto text-zinc-700 mb-3" />
                          <p className="text-sm text-zinc-400 font-medium mb-1">No policies yet</p>
                          <p className="text-xs text-zinc-600 mb-4">Queries will return an empty result set until a policy is added.</p>
                          <button onClick={() => { setPolicyForm((f) => ({ ...f, table: t.tablename })); setShowNewPolicy(true); }}
                            className="cursor-pointer px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
                            Add a policy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto">
                        {/* Column headers */}
                        <div className="grid grid-cols-[1fr_120px_120px_72px] px-4 py-2 border-b border-zinc-800 bg-zinc-950">
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</span>
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Command</span>
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Applied to</span>
                          <span />
                        </div>
                        <ul className="divide-y divide-zinc-800/60">
                          {tablePolicies.map((p) => (
                            <li key={p.policyname} className="grid grid-cols-[1fr_120px_120px_72px] items-center px-4 py-3 hover:bg-zinc-800/30 transition-colors group">
                              <span className="text-sm text-white">{p.policyname}</span>
                              <span className="text-xs font-mono text-zinc-400">{p.cmd}</span>
                              <span className="text-xs font-mono text-zinc-400">{Array.isArray(p.roles) ? p.roles.join(", ") || "public" : String(p.roles).replace(/[{}]/g, "") || "public"}</span>
                              <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEditPolicy(p)}
                                  className="cursor-pointer p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                                  title="Edit policy"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => dropPolicy(t.tablename, p.policyname)}
                                  className="cursor-pointer p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                                  title="Delete policy"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* ── New Table Slideover ── */}
      {showNewTable && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setShowNewTable(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-170 bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
              <p className="text-sm text-zinc-400">
                Create a new table under{" "}
                <code className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-xs font-mono">public</code>
              </p>
              <button
                onClick={() => setShowNewTable(false)}
                className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1">

              {/* Name */}
              <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
                <label className="w-28 text-sm text-zinc-300 shrink-0">Name</label>
                <input
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  placeholder="table_name"
                  autoFocus
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Description */}
              <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
                <label className="w-28 text-sm text-zinc-300 shrink-0">Description</label>
                <input
                  value={newTableDescription}
                  onChange={(e) => setNewTableDescription(e.target.value)}
                  placeholder="Optional"
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* RLS */}
              <div className="px-6 py-5 border-b border-zinc-800 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableRls}
                    onChange={(e) => setEnableRls(e.target.checked)}
                    className="cursor-pointer w-4 h-4 accent-[#C4623A]"
                  />
                  <span className="text-sm text-zinc-200">Enable Row Level Security (RLS)</span>
                  <span className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded-full uppercase tracking-widest font-medium">
                    Recommended
                  </span>
                </label>
                <p className="text-xs text-zinc-500 ml-7">
                  Restrict access to your table by enabling RLS and writing Postgres policies.
                </p>
                {enableRls && (
                  <div className="ml-7 bg-zinc-900 border border-zinc-700/60 rounded-lg p-4 flex gap-3">
                    <Info size={15} className="text-zinc-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-300 mb-1">Policies are required to query data</p>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        You need to create an access policy before you can query data from this table.
                        Without a policy, querying this table will return an empty array of results.
                        You can create policies after saving this table.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Columns */}
              <div className="px-6 pt-5 pb-6">
                <h3 className="text-sm font-medium text-zinc-300 mb-4">Columns</h3>

                {/* Column header row */}
                <div
                  className="grid gap-2 px-3 mb-1.5 text-xs text-zinc-500 uppercase tracking-wider font-medium"
                  style={{ gridTemplateColumns: "20px 1fr 130px 130px 52px 28px" }}
                >
                  <span />
                  <span>Name</span>
                  <span>Type</span>
                  <span>Default</span>
                  <span className="text-center">Primary</span>
                  <span />
                </div>

                {/* Column rows */}
                <div className="space-y-1.5">
                  {newTableCols.map((col, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => setDragColIndex(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragColIndex === null || dragColIndex === i) return;
                        setNewTableCols((cols) => {
                          const next = [...cols];
                          const [moved] = next.splice(dragColIndex, 1);
                          next.splice(i, 0, moved);
                          return next;
                        });
                        setDragColIndex(null);
                      }}
                      onDragEnd={() => setDragColIndex(null)}
                      className={`grid items-center gap-2 border rounded-lg px-3 py-2.5 transition-colors ${
                        dragColIndex === i
                          ? "bg-zinc-800 border-brand-500/50 opacity-50"
                          : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                      }`}
                      style={{ gridTemplateColumns: "20px 1fr 130px 130px 52px 28px" }}
                    >
                      <div className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 flex items-center">
                        <GripVertical size={14} />
                      </div>
                      <input
                        value={col.name}
                        onChange={(e) =>
                          setNewTableCols((cols) =>
                            cols.map((c, j) => (j === i ? { ...c, name: e.target.value } : c))
                          )
                        }
                        placeholder="column_name"
                        className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 w-full"
                      />
                      <select
                        value={col.type}
                        onChange={(e) =>
                          setNewTableCols((cols) =>
                            cols.map((c, j) => (j === i ? { ...c, type: e.target.value } : c))
                          )
                        }
                        className="cursor-pointer bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500 w-full"
                      >
                        {COL_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        value={col.default ?? ""}
                        onChange={(e) =>
                          setNewTableCols((cols) =>
                            cols.map((c, j) => (j === i ? { ...c, default: e.target.value } : c))
                          )
                        }
                        placeholder="NULL"
                        className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-brand-500 w-full font-mono"
                      />
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={col.primaryKey}
                          onChange={(e) =>
                            setNewTableCols((cols) =>
                              cols.map((c, j) => (j === i ? { ...c, primaryKey: e.target.checked } : c))
                            )
                          }
                          className="cursor-pointer w-4 h-4 accent-[#C4623A]"
                        />
                      </div>
                      <button
                        onClick={() => setNewTableCols((cols) => cols.filter((_, j) => j !== i))}
                        disabled={newTableCols.length === 1}
                        className="cursor-pointer disabled:opacity-30 p-1 rounded text-zinc-600 hover:text-red-400 transition-colors flex justify-center"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add column */}
                <button
                  onClick={() =>
                    setNewTableCols((cols) => [
                      ...cols,
                      { name: "", type: "text", nullable: true, primaryKey: false, default: "" },
                    ])
                  }
                  className="cursor-pointer mt-3 w-full bg-brand-500 hover:bg-brand-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Add column
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
              <button
                onClick={() => setShowNewTable(false)}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createTable}
                disabled={!newTableName.trim() || creatingTable}
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                {creatingTable ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── New Policy Slideover ── */}
      {showNewPolicy && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setShowNewPolicy(false)} />
          <div className="fixed inset-y-0 right-0 z-50 flex shadow-2xl" style={{ width: "860px" }}>
            {/* Left: form */}
            <div className="flex-1 bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                <h2 className="text-base font-semibold text-white">Create a new Row Level Security policy</h2>
                <button onClick={() => setShowNewPolicy(false)} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Policy Name + Table */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Policy Name</label>
                    <input value={policyForm.policyName}
                      onChange={(e) => setPolicyForm((f) => ({ ...f, policyName: e.target.value }))}
                      placeholder="Enable read access for all users"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Table <span className="text-zinc-600">on</span> clause</label>
                    <select value={policyForm.table}
                      onChange={(e) => setPolicyForm((f) => ({ ...f, table: e.target.value }))}
                      className="cursor-pointer w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                      <option value="">— select table —</option>
                      {rlsTables.map((t) => <option key={t.tablename} value={t.tablename}>public.{t.tablename}</option>)}
                    </select>
                  </div>
                </div>

                {/* Policy Behavior */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Policy Behavior <span className="text-zinc-600">as</span> clause</label>
                  <select value={policyForm.behavior}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, behavior: e.target.value }))}
                    className="cursor-pointer w-56 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                    <option value="PERMISSIVE">Permissive</option>
                    <option value="RESTRICTIVE">Restrictive</option>
                  </select>
                </div>

                {/* Policy Command */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">Policy Command <span className="text-zinc-600">for</span> clause</label>
                  <div className="flex gap-2">
                    {["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"].map((cmd) => (
                      <label key={cmd} className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium select-none"
                        style={policyForm.cmd === cmd ? { borderColor: "#C4623A", background: "rgba(196,98,58,0.12)", color: "#e07a52" } : { borderColor: "#3f3f46", color: "#a1a1aa" }}>
                        <input type="radio" name="policyCmd" value={cmd} checked={policyForm.cmd === cmd}
                          onChange={() => setPolicyForm((f) => ({ ...f, cmd }))} className="sr-only" />
                        {cmd}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Target Roles */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Target Roles <span className="text-zinc-600">to</span> clause</label>
                  <select value={policyForm.targetRoles}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, targetRoles: e.target.value }))}
                    className="cursor-pointer w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                    <option value="">Defaults to all (public) roles if none selected</option>
                    <option value="authenticated">authenticated</option>
                    <option value="anon">anon</option>
                    <option value="service_role">service_role</option>
                    <option value="postgres">postgres</option>
                  </select>
                </div>

                {/* SQL preview */}
                <div>
                  <div className="flex items-center gap-2 mb-2 text-xs text-zinc-500">
                    <span className="font-mono uppercase tracking-wider">USE OPTIONS ABOVE TO EDIT</span>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 font-mono text-xs leading-6 text-zinc-300 whitespace-pre select-none">
{`create policy "${policyForm.policyName || "policy_name"}"
on "public"."${policyForm.table || "table_name"}"
as ${policyForm.behavior}
for ${policyForm.cmd}
to ${policyForm.targetRoles || "public"}${policyForm.using ? `
using (
  ${policyForm.using}
)` : ""}${policyForm.withCheck ? `
with check (
  ${policyForm.withCheck}
)` : ""};`}
                  </div>
                </div>

                {/* USING / WITH CHECK */}
                {(policyForm.cmd === "SELECT" || policyForm.cmd === "UPDATE" || policyForm.cmd === "DELETE" || policyForm.cmd === "ALL") && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">USING expression</label>
                    <input value={policyForm.using}
                      onChange={(e) => setPolicyForm((f) => ({ ...f, using: e.target.value }))}
                      placeholder="true"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                  </div>
                )}
                {(policyForm.cmd === "INSERT" || policyForm.cmd === "UPDATE" || policyForm.cmd === "ALL") && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">WITH CHECK expression</label>
                    <input value={policyForm.withCheck}
                      onChange={(e) => setPolicyForm((f) => ({ ...f, withCheck: e.target.value }))}
                      placeholder="true"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
                <button onClick={() => setShowNewPolicy(false)}
                  className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors border border-zinc-700">
                  Cancel
                </button>
                <button onClick={createPolicy} disabled={!policyForm.table || !policyForm.policyName}
                  className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
                  Save policy
                </button>
              </div>
            </div>

            {/* Right: templates panel */}
            <div className="w-72 shrink-0 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 shrink-0">
                <p className="text-sm font-medium text-white mb-2">Templates</p>
                <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5">
                  <Search size={12} className="text-zinc-500 shrink-0" />
                  <input value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates"
                    className="bg-transparent text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none w-full" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
                {RLS_TEMPLATES.filter((tpl) =>
                  templateSearch === "" || tpl.label.toLowerCase().includes(templateSearch.toLowerCase())
                ).map((tpl) => {
                  const cmdColor: Record<string, string> = { SELECT: "bg-blue-600", INSERT: "bg-green-600", UPDATE: "bg-yellow-600", DELETE: "bg-red-600", ALL: "bg-zinc-600" };
                  const isActive = policyForm.policyName === tpl.policyName;
                  return (
                    <button key={tpl.policyName}
                      onClick={() => setPolicyForm((f) => ({ ...f, policyName: tpl.policyName, cmd: tpl.cmd, behavior: tpl.behavior, using: tpl.using, withCheck: tpl.withCheck }))}
                      className={`cursor-pointer w-full text-left rounded-lg px-3 py-3 transition-colors border ${isActive ? "border-brand-500 bg-brand-500/10" : "border-transparent hover:bg-zinc-800"}`}>
                      <div className="flex items-start gap-2 mb-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded text-white font-mono shrink-0 ${cmdColor[tpl.cmd] ?? cmdColor.ALL}`}>{tpl.cmd}</span>
                        <span className="text-xs font-medium text-zinc-200 leading-tight">{tpl.label}</span>
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed pl-0.5">{tpl.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
      {/* ── Edit Policy Slideover ── */}
      {showEditPolicy && editingPolicy && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setShowEditPolicy(false)} />
          <div className="fixed inset-y-0 right-0 z-50 flex shadow-2xl" style={{ width: "600px" }}>
            <div className="flex-1 bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-white">Edit policy</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">on <span className="font-mono text-zinc-400">{editingPolicy.tablename}</span></p>
                </div>
                <button onClick={() => setShowEditPolicy(false)} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Policy Name */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Policy Name</label>
                  <input value={editPolicyForm.policyName}
                    onChange={(e) => setEditPolicyForm((f) => ({ ...f, policyName: e.target.value }))}
                    placeholder="policy_name"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                </div>

                {/* Policy Behavior */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Policy Behavior <span className="text-zinc-600">as</span> clause</label>
                  <select value={editPolicyForm.behavior}
                    onChange={(e) => setEditPolicyForm((f) => ({ ...f, behavior: e.target.value }))}
                    className="cursor-pointer w-56 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                    <option value="PERMISSIVE">Permissive</option>
                    <option value="RESTRICTIVE">Restrictive</option>
                  </select>
                </div>

                {/* Policy Command */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">Policy Command <span className="text-zinc-600">for</span> clause</label>
                  <div className="flex gap-2">
                    {["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"].map((cmd) => (
                      <label key={cmd} className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium select-none"
                        style={editPolicyForm.cmd === cmd ? { borderColor: "#C4623A", background: "rgba(196,98,58,0.12)", color: "#e07a52" } : { borderColor: "#3f3f46", color: "#a1a1aa" }}>
                        <input type="radio" name="editPolicyCmd" value={cmd} checked={editPolicyForm.cmd === cmd}
                          onChange={() => setEditPolicyForm((f) => ({ ...f, cmd }))} className="sr-only" />
                        {cmd}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Target Roles */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Target Roles <span className="text-zinc-600">to</span> clause</label>
                  <select value={editPolicyForm.targetRoles}
                    onChange={(e) => setEditPolicyForm((f) => ({ ...f, targetRoles: e.target.value }))}
                    className="cursor-pointer w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                    <option value="">Defaults to all (public) roles if none selected</option>
                    <option value="authenticated">authenticated</option>
                    <option value="anon">anon</option>
                    <option value="service_role">service_role</option>
                    <option value="postgres">postgres</option>
                  </select>
                </div>

                {/* SQL preview */}
                <div>
                  <div className="flex items-center gap-2 mb-2 text-xs text-zinc-500">
                    <span className="font-mono uppercase tracking-wider">USE OPTIONS ABOVE TO EDIT</span>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 font-mono text-xs leading-6 text-zinc-300 whitespace-pre select-none">
{`create policy "${editPolicyForm.policyName || "policy_name"}"
on "public"."${editingPolicy.tablename}"
as ${editPolicyForm.behavior}
for ${editPolicyForm.cmd}
to ${editPolicyForm.targetRoles || "public"}${editPolicyForm.using ? `
using (
  ${editPolicyForm.using}
)` : ""}${editPolicyForm.withCheck ? `
with check (
  ${editPolicyForm.withCheck}
)` : ""};`}
                  </div>
                </div>

                {/* USING / WITH CHECK */}
                {(editPolicyForm.cmd === "SELECT" || editPolicyForm.cmd === "UPDATE" || editPolicyForm.cmd === "DELETE" || editPolicyForm.cmd === "ALL") && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">USING expression</label>
                    <input value={editPolicyForm.using}
                      onChange={(e) => setEditPolicyForm((f) => ({ ...f, using: e.target.value }))}
                      placeholder="true"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                  </div>
                )}
                {(editPolicyForm.cmd === "INSERT" || editPolicyForm.cmd === "UPDATE" || editPolicyForm.cmd === "ALL") && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">WITH CHECK expression</label>
                    <input value={editPolicyForm.withCheck}
                      onChange={(e) => setEditPolicyForm((f) => ({ ...f, withCheck: e.target.value }))}
                      placeholder="true"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
                <button onClick={() => setShowEditPolicy(false)}
                  className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors border border-zinc-700">
                  Cancel
                </button>
                <button onClick={updatePolicy} disabled={!editPolicyForm.policyName}
                  className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-sm font-semibold text-white mb-2">Are you sure?</h3>
            <p className="text-sm text-zinc-400 mb-6">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmModal(null)}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors">
                Cancel
              </button>
              <button onClick={confirmModal.onConfirm}
                className="cursor-pointer px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Error Modal ── */}
      {errorModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-sm font-semibold text-red-400 mb-2">Error</h3>
            <p className="text-sm text-zinc-400 mb-6">{errorModal}</p>
            <div className="flex justify-end">
              <button onClick={() => setErrorModal(null)}
                className="cursor-pointer px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Insert Row Slideover ── */}
      {showInsertRow && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowInsertRow(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-[520px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-base font-semibold text-white">
                Add new row to{" "}
                <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-zinc-200">
                  {selectedTable}
                </code>
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
              {/* Required columns */}
              {selectedTableMeta?.columns.filter((c) => c.is_nullable === "NO").map((col) => (
                <div key={col.column_name} className="px-6 py-5 flex gap-6">
                  <div className="w-44 shrink-0">
                    <p className="text-sm text-zinc-200">{col.column_name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{col.data_type}</p>
                  </div>
                  <div className="flex-1">
                    {col.column_default ? (
                      <input disabled placeholder={`Default: ${col.column_default}`}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-600 placeholder-zinc-600 cursor-not-allowed" />
                    ) : col.data_type.includes("timestamp") ? (
                      <div className="space-y-1">
                        <input type="datetime-local"
                          value={insertRowValues[col.column_name] ?? ""}
                          onChange={(e) => setInsertRowValues((v) => ({ ...v, [col.column_name]: e.target.value }))}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-brand-500" />
                        <p className="text-xs text-zinc-500">Your local timezone will be automatically applied (+0000)</p>
                      </div>
                    ) : col.data_type === "text" || col.data_type.includes("character varying") ? (
                      <textarea rows={3}
                        value={insertRowValues[col.column_name] ?? ""}
                        onChange={(e) => setInsertRowValues((v) => ({ ...v, [col.column_name]: e.target.value }))}
                        placeholder="NULL"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500 resize-y" />
                    ) : (
                      <input
                        value={insertRowValues[col.column_name] ?? ""}
                        onChange={(e) => setInsertRowValues((v) => ({ ...v, [col.column_name]: e.target.value }))}
                        placeholder="NULL"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                    )}
                  </div>
                </div>
              ))}

              {/* Optional columns */}
              {(selectedTableMeta?.columns.filter((c) => c.is_nullable === "YES") ?? []).length > 0 && (
                <>
                  <div className="px-6 py-4 bg-zinc-900/40">
                    <p className="text-sm font-semibold text-zinc-200">Optional Fields</p>
                    <p className="text-xs text-zinc-500 mt-0.5">These are columns that do not need any value</p>
                  </div>
                  {selectedTableMeta?.columns.filter((c) => c.is_nullable === "YES").map((col) => (
                    <div key={col.column_name} className="px-6 py-5 flex gap-6">
                      <div className="w-44 shrink-0">
                        <p className="text-sm text-zinc-200">{col.column_name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{col.data_type}</p>
                      </div>
                      <div className="flex-1">
                        {col.data_type === "text" || col.data_type.includes("character varying") ? (
                          <textarea rows={3}
                            value={insertRowValues[col.column_name] ?? ""}
                            onChange={(e) => setInsertRowValues((v) => ({ ...v, [col.column_name]: e.target.value }))}
                            placeholder="NULL"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500 resize-y" />
                        ) : col.data_type.includes("timestamp") ? (
                          <div className="space-y-1">
                            <input type="datetime-local"
                              value={insertRowValues[col.column_name] ?? ""}
                              onChange={(e) => setInsertRowValues((v) => ({ ...v, [col.column_name]: e.target.value }))}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-brand-500" />
                            <p className="text-xs text-zinc-500">Your local timezone will be automatically applied (+0000)</p>
                          </div>
                        ) : (
                          <input
                            value={insertRowValues[col.column_name] ?? ""}
                            onChange={(e) => setInsertRowValues((v) => ({ ...v, [col.column_name]: e.target.value }))}
                            placeholder="NULL"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 shrink-0">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div onClick={() => setCreateMoreRow((v) => !v)}
                  className={`cursor-pointer relative w-9 h-5 rounded-full transition-colors ${createMoreRow ? "bg-brand-500" : "bg-zinc-700"}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${createMoreRow ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className="text-sm text-zinc-400">Create more</span>
              </label>
              <div className="flex gap-3">
                <button onClick={() => setShowInsertRow(false)}
                  className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors">
                  Cancel
                </button>
                <button onClick={insertRow} disabled={insertRowLoading}
                  className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
                  {insertRowLoading ? "Saving…" : <><span>Save</span><kbd className="text-xs bg-brand-600 px-1.5 py-0.5 rounded">⌘↵</kbd></>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Insert Column Slideover ── */}
      {showInsertCol && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowInsertCol(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-[520px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-base font-semibold text-white">
                Add new column to{" "}
                <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-zinc-200">
                  {selectedTable}
                </code>
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
              {/* General */}
              <div className="flex px-6 py-6 gap-6">
                <div className="w-36 shrink-0">
                  <p className="text-sm font-medium text-zinc-300">General</p>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm text-zinc-300 mb-1.5">Name</label>
                    <input value={insertColForm.name}
                      onChange={(e) => setInsertColForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="column_name"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                    <p className="text-xs text-zinc-500 mt-1.5">Recommended to use lowercase and use an underscore to separate words e.g. column_name</p>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-sm text-zinc-300">Description</label>
                      <span className="text-xs text-zinc-600">Optional</span>
                    </div>
                    <input value={insertColForm.description}
                      onChange={(e) => setInsertColForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
                  </div>
                </div>
              </div>

              {/* Data Type */}
              <div className="flex px-6 py-6 gap-6">
                <div className="w-36 shrink-0 space-y-2.5">
                  <p className="text-sm font-medium text-zinc-300">Data Type</p>
                  <button className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors w-full">
                    <Plus size={11} /> Create enum types
                  </button>
                  <button className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors w-full">
                    <ExternalLink size={11} /> About data types
                  </button>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm text-zinc-300 mb-1.5">Type</label>
                    <select value={insertColForm.type}
                      onChange={(e) => setInsertColForm((f) => ({ ...f, type: e.target.value }))}
                      className="cursor-pointer w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-brand-500">
                      <option value="">Choose a column type…</option>
                      {COL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={insertColForm.isArray}
                      onChange={(e) => setInsertColForm((f) => ({ ...f, isArray: e.target.checked }))}
                      className="cursor-pointer mt-0.5 w-4 h-4 accent-[#C4623A]" />
                    <div>
                      <p className="text-sm text-zinc-300">Define as Array</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Allow column to be defined as variable-length multidimensional arrays</p>
                    </div>
                  </label>
                  <div>
                    <label className="block text-sm text-zinc-300 mb-1.5">Default Value</label>
                    <input value={insertColForm.defaultValue}
                      onChange={(e) => setInsertColForm((f) => ({ ...f, defaultValue: e.target.value }))}
                      placeholder="NULL"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500 font-mono" />
                    <p className="text-xs text-zinc-500 mt-1.5">Can either be a literal or an expression. When using an expression wrap it in brackets, e.g. (gen_random_uuid())</p>
                  </div>
                </div>
              </div>

              {/* Foreign Keys */}
              <div className="flex px-6 py-6 gap-6">
                <div className="w-36 shrink-0">
                  <p className="text-sm font-medium text-zinc-300">Foreign Keys</p>
                </div>
                <div className="flex-1">
                  <button className="cursor-pointer px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors">
                    Add foreign key
                  </button>
                </div>
              </div>

              {/* Constraints */}
              <div className="flex px-6 py-6 gap-6">
                <div className="w-36 shrink-0">
                  <p className="text-sm font-medium text-zinc-300">Constraints</p>
                </div>
                <div className="flex-1">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <div onClick={() => setInsertColForm((f) => ({ ...f, isPrimaryKey: !f.isPrimaryKey }))}
                      className={`cursor-pointer relative w-9 h-5 mt-0.5 rounded-full transition-colors shrink-0 ${insertColForm.isPrimaryKey ? "bg-brand-500" : "bg-zinc-700"}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${insertColForm.isPrimaryKey ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                    <div>
                      <p className="text-sm text-zinc-300">Is Primary Key</p>
                      <p className="text-xs text-zinc-500 mt-0.5">A primary key indicates that a column or group of columns can be used as a unique identifier for rows in the table</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 shrink-0">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div onClick={() => setCreateMoreCol((v) => !v)}
                  className={`cursor-pointer relative w-9 h-5 rounded-full transition-colors ${createMoreCol ? "bg-brand-500" : "bg-zinc-700"}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${createMoreCol ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className="text-sm text-zinc-400">Create more</span>
              </label>
              <div className="flex gap-3">
                <button onClick={() => setShowInsertCol(false)}
                  className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors">
                  Cancel
                </button>
                <button onClick={insertColumn} disabled={insertColLoading || !insertColForm.name.trim() || !insertColForm.type}
                  className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
                  {insertColLoading ? "Saving…" : <><span>Save</span><kbd className="text-xs bg-brand-600 px-1.5 py-0.5 rounded">⌘↵</kbd></>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
