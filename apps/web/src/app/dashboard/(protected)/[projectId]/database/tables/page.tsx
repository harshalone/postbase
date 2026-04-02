"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
import { useSlidePanel } from "@/hooks/use-slide-panel";
import { useToast } from "@/hooks/use-toast";
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
  Lock,
  Star,
  Users,
  Clock,
  MoreHorizontal,
  Check,
  Copy,
  AlertTriangle,
  Upload,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Column = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  is_primary_key?: boolean;
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

type Tab = "tables" | "rls" | "sql";

type SqlQuery = {
  id: string;
  sql: string;
  name: string | null;
  visibility: "private" | "shared" | "favorite";
  executedAt: string;
};

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

// ─── System tables (created by Postbase, read-only in the UI) ────────────────

const SYSTEM_TABLES = new Set(["users", "accounts", "sessions", "verification_tokens"]);

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
  const router = useRouter();
  const toast = useToast();
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

  // Sidebar schema selector: "public" (user tables) or "system"
  const [publicGroupOpen, setPublicGroupOpen] = useState(true);

  // New table dialog
  const newTablePanel = useSlidePanel();
  const showNewTable = newTablePanel.visible;
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
  const [defCopied, setDefCopied] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const insertRowPanel = useSlidePanel();
  const showInsertRow = insertRowPanel.visible;
  const [insertRowValues, setInsertRowValues] = useState<Record<string, string>>({});
  const [insertRowLoading, setInsertRowLoading] = useState(false);
  const [createMoreRow, setCreateMoreRow] = useState(false);
  const insertColPanel = useSlidePanel();
  const showInsertCol = insertColPanel.visible;
  const [insertColForm, setInsertColForm] = useState({ name: "", description: "", type: "", isArray: false, defaultValue: "", isPrimaryKey: false });
  const [insertColLoading, setInsertColLoading] = useState(false);
  const [createMoreCol, setCreateMoreCol] = useState(false);

  // Selection state
  const [selectedRows, setSelectedRows] = useState<Set<string | number>>(new Set());

  // Cell selection & context menu
  const [selectedCell, setSelectedCell] = useState<{ rowIndex: number; colName: string } | null>(null);
  const [cellContextMenu, setCellContextMenu] = useState<{
    x: number;
    y: number;
    row: Record<string, unknown>;
    rowIndex: number;
    colName: string;
  } | null>(null);
  const cellContextMenuRef = useRef<HTMLDivElement>(null);

  // Sort state
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Freeze state — ordered list of frozen column names (order = freeze order)
  // Persisted to localStorage per project+table
  const frozenKey = selectedTable ? `frozen:${projectId}:${selectedTable}` : null;
  const [frozenOrder, setFrozenOrder] = useState<string[]>([]);

  // Column context menu
  // anchorRect is the button's bounding rect; resolved position is computed after render
  const [colMenu, setColMenu] = useState<{ col: Column; anchorRect: DOMRect } | null>(null);
  const [colMenuPos, setColMenuPos] = useState<{ x: number; y: number; opacity: number }>({ x: 0, y: 0, opacity: 0 });
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colMenu || !colMenuRef.current) return;
    const menu = colMenuRef.current;
    const { anchorRect } = colMenu;
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 4;

    // Horizontal: prefer left-aligned to anchor, flip left if it clips right edge
    let x = anchorRect.left;
    if (x + menuW > vw - 8) x = anchorRect.right - menuW;
    if (x < 8) x = 8;

    // Vertical: prefer below anchor, flip above if it clips bottom edge
    let y = anchorRect.bottom + GAP;
    if (y + menuH > vh - 8) y = anchorRect.top - menuH - GAP;
    if (y < 8) y = 8;

    setColMenuPos({ x, y, opacity: 1 });
  }, [colMenu]);

  // Close cell context menu on outside click or Escape
  useEffect(() => {
    if (!cellContextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (cellContextMenuRef.current && !cellContextMenuRef.current.contains(e.target as Node)) {
        setCellContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCellContextMenu(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [cellContextMenu]);

  // Persist frozen columns to localStorage whenever they change
  useEffect(() => {
    if (!frozenKey) return;
    if (frozenOrder.length === 0) {
      localStorage.removeItem(frozenKey);
    } else {
      localStorage.setItem(frozenKey, JSON.stringify(frozenOrder));
    }
  }, [frozenKey, frozenOrder]);

  // Edit column panel
  const editColPanel = useSlidePanel();
  const showEditCol = editColPanel.visible;
  const [editColTarget, setEditColTarget] = useState<Column | null>(null);
  const [editColName, setEditColName] = useState("");
  const [editColLoading, setEditColLoading] = useState(false);


  // SQL editor state
  const [sqlQuery, setSqlQuery] = useState("");
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlResult, setSqlResult] = useState<{
    rows: Record<string, unknown>[];
    fields: { name: string }[];
    rowCount: number | null;
    command: string;
    schema: string;
  } | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlHistory, setSqlHistory] = useState<SqlQuery[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // RLS state
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [rlsTables, setRlsTables] = useState<RlsTable[]>([]);
  const [rlsLoading, setRlsLoading] = useState(false);
  const [selectedRlsTable, setSelectedRlsTable] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const newPolicyPanel = useSlidePanel();
  const showNewPolicy = newPolicyPanel.visible;
  const [policyForm, setPolicyForm] = useState({
    table: "",
    policyName: "",
    cmd: "SELECT",
    behavior: "PERMISSIVE",
    targetRoles: "",
    using: "",
    withCheck: "",
  });
  const editPolicyPanel = useSlidePanel();
  const showEditPolicy = editPolicyPanel.visible;
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

  // Edit row panel
  const editRowPanel = useSlidePanel();
  const showEditRow = editRowPanel.visible;
  const [editRowData, setEditRowData] = useState<Record<string, unknown> | null>(null);
  const [editRowValues, setEditRowValues] = useState<Record<string, string>>({});
  const [editRowLoading, setEditRowLoading] = useState(false);

  // Import SQL panel
  const importSqlPanel = useSlidePanel();
  const showImportSql = importSqlPanel.visible;
  const [importSqlContent, setImportSqlContent] = useState("");
  const [importSqlFileName, setImportSqlFileName] = useState<string | null>(null);
  const [importSqlDragging, setImportSqlDragging] = useState(false);
  const [importSqlRunning, setImportSqlRunning] = useState(false);
  const [importSqlResult, setImportSqlResult] = useState<{ success: boolean; message: string } | null>(null);
  const importSqlInputRef = useRef<HTMLInputElement>(null);

  // ─── Data fetchers ──────────────────────────────────────────────────────────

  const fetchTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/tables`);
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setTables(data.tables ?? []);
    } finally {
      setTablesLoading(false);
    }
  }, [projectId]);

  const fetchTableRows = useCallback(
    async (tableName: string, offset = 0, col?: string | null, dir?: "asc" | "desc") => {
      setTableLoading(true);
      try {
        const resolvedCol = col !== undefined ? col : sortCol;
        const resolvedDir = dir !== undefined ? dir : sortDir;
        const sortParam = resolvedCol ? `&sortCol=${encodeURIComponent(resolvedCol)}&sortDir=${resolvedDir}` : "";
        const res = await fetch(
          `/api/dashboard/${projectId}/tables/${tableName}?limit=${TABLE_LIMIT}&offset=${offset}${sortParam}`
        );
        const data = await res.json();
        setTableRows(data.rows ?? []);
        setTableTotal(data.total ?? 0);
        setTableOffset(offset);
      } finally {
        setTableLoading(false);
      }
    },
    [projectId, sortCol, sortDir]
  );

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/sql/history`);
      const data = await res.json();
      setSqlHistory(data.queries ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

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
    if (tab === "tables") fetchTables();
    if (tab === "sql") fetchHistory();
  }, [tab, fetchRls, fetchTables, fetchHistory]);

  function handleSelectTable(name: string) {
    setSelectedTable(name);
    setSelectedRows(new Set());
    setSortCol(null);
    setSortDir("asc");
    try {
      const stored = localStorage.getItem(`frozen:${projectId}:${name}`);
      setFrozenOrder(stored ? (JSON.parse(stored) as string[]) : []);
    } catch {
      setFrozenOrder([]);
    }
    fetchTableRows(name, 0, null, "asc");
  }

  function handleSort(colName: string) {
    if (!selectedTable) return;
    const newDir = sortCol === colName && sortDir === "asc" ? "desc" : "asc";
    setSortCol(colName);
    setSortDir(newDir);
    fetchTableRows(selectedTable, 0, colName, newDir);
    setColMenu(null);
  }

  function handleSortAsc(colName: string) {
    if (!selectedTable) return;
    setSortCol(colName);
    setSortDir("asc");
    fetchTableRows(selectedTable, 0, colName, "asc");
    setColMenu(null);
  }

  function handleSortDesc(colName: string) {
    if (!selectedTable) return;
    setSortCol(colName);
    setSortDir("desc");
    fetchTableRows(selectedTable, 0, colName, "desc");
    setColMenu(null);
  }

  function handleCopyColName(colName: string) {
    navigator.clipboard.writeText(colName);
    toast.success(`Copied "${colName}"`);
    setColMenu(null);
  }

  function handleFreezeCol(colName: string) {
    setFrozenOrder((prev) =>
      prev.includes(colName) ? prev.filter((n) => n !== colName) : [...prev, colName]
    );
    setColMenu(null);
  }

  function openEditCol(col: Column) {
    setEditColTarget(col);
    setEditColName(col.column_name);
    setColMenu(null);
    editColPanel.open();
  }

  async function saveEditCol() {
    if (!selectedTable || !editColTarget || !editColName.trim()) return;
    if (editColName.trim() === editColTarget.column_name) { editColPanel.close(); return; }
    setEditColLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/tables/${selectedTable}/columns`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnName: editColTarget.column_name, newName: editColName.trim() }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      editColPanel.close();
      setEditColTarget(null);
      await fetchTables();
      fetchTableRows(selectedTable, tableOffset);
    } finally {
      setEditColLoading(false);
    }
  }

  function handleDeleteCol(col: Column) {
    if (!selectedTable) return;
    setColMenu(null);
    setConfirmModal({
      message: `Drop column "${col.column_name}" from "${selectedTable}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        const res = await fetch(`/api/dashboard/${projectId}/tables/${selectedTable}/columns`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnName: col.column_name }),
        });
        const data = await res.json();
        if (data.error) { toast.error(data.error); return; }
        toast.success(`Column "${col.column_name}" deleted`);
        await fetchTables();
        fetchTableRows(selectedTable, tableOffset);
      },
    });
  }

  function toggleRow(id: string | number) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!pkCol) return;
    if (selectableIds.size > 0 && selectedRows.size === selectableIds.size) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(selectableIds));
    }
  }

  async function bulkDelete() {
    if (selectedRows.size === 0 || !selectedTable) return;
    if (!pkCol) return;

    const count = selectedRows.size;
    setConfirmModal({
      message: `Delete ${count} selected row${count !== 1 ? "s" : ""} from "${selectedTable}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        const ids = Array.from(selectedRows);
        try {
          const res = await fetch(`/api/dashboard/${projectId}/tables/${selectedTable}/batch`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pkCol, ids }),
          });
          const data = await res.json();
          if (data.error) {
            toast.error(data.error);
          } else if (data.rowCount === 0) {
            toast.error(`No rows deleted — pkCol "${pkCol}" may not match the primary key`);
          } else {
            toast.success(`Deleted ${data.rowCount} row${data.rowCount !== 1 ? "s" : ""}`);
            setSelectedRows(new Set());
            fetchTableRows(selectedTable, tableOffset);
          }
        } catch (err) {
          toast.error(String(err));
        }
      },
    });
  }

  // ─── Insert row ─────────────────────────────────────────────────────────────

  async function saveEditRow() {
    if (!selectedTable || !editRowData || !pkCol) return;
    setEditRowLoading(true);
    try {
      const set = Object.fromEntries(
        Object.entries(editRowValues).filter(([, v]) => v !== "")
      );
      const res = await fetch(`/api/dashboard/${projectId}/tables/${selectedTable}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ where: { [pkCol]: editRowData[pkCol] }, set }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      editRowPanel.close();
      setEditRowData(null);
      fetchTableRows(selectedTable, tableOffset);
    } finally {
      setEditRowLoading(false);
    }
  }

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
      if (data.error) { toast.error(data.error); return; }
      if (!createMoreRow) insertRowPanel.close();
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
      if (data.error) { toast.error(data.error); return; }
      if (!createMoreCol) insertColPanel.close();
      setInsertColForm({ name: "", description: "", type: "", isArray: false, defaultValue: "", isPrimaryKey: false });
      fetchTables();
    } finally {
      setInsertColLoading(false);
    }
  }

  // ─── SQL runner ─────────────────────────────────────────────────────────────

  async function executeSql(query: string) {
    setSqlRunning(true);
    setSqlError(null);
    setSqlResult(null);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: query }),
      });
      const data = await res.json();
      if (data.error) {
        setSqlError(data.error);
      } else {
        setSqlResult(data);
        const ddl = new Set(["CREATE", "DROP", "ALTER", "TRUNCATE", "RENAME", "COMMENT"]);
        if (ddl.has(data.command)) fetchTables();
      }
      // Auto-save to history regardless of error
      const saveRes = await fetch(`/api/dashboard/${projectId}/sql/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: query }),
      });
      const saveData = await saveRes.json();
      if (saveData.query) {
        setSqlHistory((prev) => [saveData.query, ...prev].slice(0, 200));
      }
    } catch (err) {
      setSqlError(String(err));
    } finally {
      setSqlRunning(false);
    }
  }

  async function runSql() {
    if (!sqlQuery.trim()) return;

    const destructive = /truncate|delete|drop/i.test(sqlQuery);
    if (destructive) {
      const command = sqlQuery.trim().split(/\s+/)[0].toUpperCase();
      setConfirmModal({
        message: `You are about to run a destructive ${command} query. This action could result in permanent data loss. Are you 100% sure you want to proceed?`,
        onConfirm: () => {
          setConfirmModal(null);
          executeSql(sqlQuery);
        },
      });
      return;
    }

    executeSql(sqlQuery);
  }

  async function updateQueryVisibility(id: string, visibility: SqlQuery["visibility"]) {
    const res = await fetch(`/api/dashboard/${projectId}/sql/history/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    const data = await res.json();
    if (data.query) {
      setSqlHistory((prev) => prev.map((q) => (q.id === id ? data.query : q)));
    }
  }

  async function renameQuery(id: string, name: string) {
    const res = await fetch(`/api/dashboard/${projectId}/sql/history/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.query) {
      setSqlHistory((prev) => prev.map((q) => (q.id === id ? data.query : q)));
    }
    setRenamingId(null);
  }

  async function deleteQuery(id: string) {
    await fetch(`/api/dashboard/${projectId}/sql/history/${id}`, { method: "DELETE" });
    setSqlHistory((prev) => prev.filter((q) => q.id !== id));
  }

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
        toast.error(data.error);
        return;
      }
      newTablePanel.close();
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
    newPolicyPanel.close();
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
    editPolicyPanel.open();
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
    editPolicyPanel.close();
    setEditingPolicy(null);
    fetchRls();
  }

  // ─── Import SQL handlers ──────────────────────────────────────────────────────

  function handleImportSqlFile(file: File) {
    if (!file.name.endsWith(".sql") && file.type !== "text/plain") {
      toast.error("Please select a .sql file");
      return;
    }
    setImportSqlFileName(file.name);
    setImportSqlResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setImportSqlContent((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  async function runImportSql() {
    if (!importSqlContent.trim()) return;
    setImportSqlRunning(true);
    setImportSqlResult(null);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: importSqlContent }),
      });
      const data = await res.json();
      if (data.error) {
        setImportSqlResult({ success: false, message: data.error });
      } else {
        setImportSqlResult({ success: true, message: `SQL executed successfully. Command: ${data.command ?? "OK"}` });
        fetchTables();
      }
    } catch (err) {
      setImportSqlResult({ success: false, message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setImportSqlRunning(false);
    }
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const selectedTableMeta = tables.find((t) => t.table_name === selectedTable);
  const colHeaders = selectedTableMeta?.columns.map((c) => c.column_name) ?? [];
  const pkCol = selectedTableMeta?.columns.find((c) => c.is_primary_key)?.column_name
    ?? colHeaders.find((c) => c === "id")
    ?? colHeaders[0];
  const selectableIds = new Set<string | number>(
    tableRows.map((row) => row[pkCol] as string | number).filter((v) => v !== undefined && v !== null)
  );

  const frozenColumns = selectedTableMeta
    ? frozenOrder.map((name) => selectedTableMeta.columns.find((c) => c.column_name === name)!).filter(Boolean)
    : [];
  const unfrozenColumns = selectedTableMeta
    ? selectedTableMeta.columns.filter((c) => !frozenOrder.includes(c.column_name))
    : [];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-white">Database</h1>
          <button
            onClick={() => { setImportSqlContent(""); setImportSqlFileName(null); setImportSqlResult(null); importSqlPanel.open(); }}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
          >
            <Upload size={12} />
            Import SQL
          </button>
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              { id: "tables", label: "Tables", icon: Table2 },
              { id: "rls", label: "RLS Policies", icon: Shield },
              { id: "sql", label: "SQL Editor", icon: FileText },
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
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {/* ── Tables Tab ── */}
        {tab === "tables" && (
          <div className="flex h-full">
            {/* Table list sidebar */}
            <div className="w-56 shrink-0 border-r border-zinc-800 flex flex-col">
              {/* Schema dropdown + actions */}
              <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={publicGroupOpen ? "public" : "system"}
                    onChange={(e) => setPublicGroupOpen(e.target.value === "public")}
                    className="cursor-pointer w-full appearance-none bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 pr-6"
                  >
                    <option value="public">public</option>
                    <option value="system">_system</option>
                  </select>
                  <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                </div>
                <button
                  onClick={fetchTables}
                  title="Refresh"
                  className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <RefreshCw size={12} />
                </button>
                {publicGroupOpen && (
                  <button
                    onClick={() => newTablePanel.open()}
                    title="New table"
                    className="cursor-pointer p-1.5 rounded bg-brand-500 hover:bg-brand-600 text-white transition-colors"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
              <ul className="flex-1 overflow-y-auto py-2">
                {tablesLoading ? (
                  <li className="px-4 py-3 text-xs text-zinc-600">Loading…</li>
                ) : (() => {
                  const isSystem = !publicGroupOpen;
                  const visibleTables = isSystem
                    ? tables.filter((t) => SYSTEM_TABLES.has(t.table_name))
                    : tables.filter((t) => !SYSTEM_TABLES.has(t.table_name));

                  if (visibleTables.length === 0) {
                    return (
                      <li className="px-4 py-8 text-center text-xs text-zinc-600">
                        {isSystem ? "No system tables found." : (
                          <>
                            No tables yet.
                            <br />
                            <button
                              onClick={() => newTablePanel.open()}
                              className="cursor-pointer mt-2 text-brand-400 hover:text-brand-300"
                            >
                              Create one
                            </button>
                          </>
                        )}
                      </li>
                    );
                  }

                  return visibleTables.map((t) => (
                    <li key={t.table_name}>
                      <button
                        onClick={() => handleSelectTable(t.table_name)}
                        className={`cursor-pointer w-full text-left px-4 py-2 text-sm transition-colors ${
                          selectedTable === t.table_name
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          {isSystem && <Lock size={10} className="shrink-0 text-zinc-600" />}
                          <span className="truncate">{t.table_name}</span>
                        </span>
                        <span className="block text-xs text-zinc-600">
                          ~{Number(t.row_estimate).toLocaleString()} rows
                        </span>
                      </button>
                    </li>
                  ));
                })()}
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

                    {/* Bulk Actions */}
                    {selectedRows.size > 0 && (
                      <div className="flex items-center gap-3 px-2 py-1 bg-brand-500/10 border border-brand-500/20 rounded-md animate-in fade-in slide-in-from-left-2">
                        <div className="flex items-center gap-2 px-1.5 border-r border-brand-500/20 mr-0.5">
                           <span className="text-xs font-bold text-brand-400">{selectedRows.size}</span>
                           <span className="text-[10px] font-bold text-brand-500 uppercase tracking-tight">Selected</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={bulkDelete}
                            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-red-400/10 text-xs font-bold text-red-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                          <button 
                            onClick={() => setSelectedRows(new Set())}
                            className="px-2 py-1 rounded hover:bg-zinc-800 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
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
                                onClick: () => { setShowInsertMenu(false); insertRowPanel.open(); },
                              },
                              {
                                icon: Columns2,
                                label: "Insert column",
                                sub: `Insert a new column into ${selectedTable}`,
                                onClick: () => { setShowInsertMenu(false); insertColPanel.open(); },
                              },
                              {
                                icon: FileText,
                                label: "Import data from CSV",
                                sub: "Insert new rows from a CSV",
                                onClick: () => { setShowInsertMenu(false); router.push(`/dashboard/${projectId}/database/tables/import/${selectedTable}`); },
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

                  {/* No primary key warning */}
                  {selectedTableMeta && !selectedTableMeta.columns.some((c) => c.is_primary_key) && (
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-yellow-500/5 border-b border-yellow-500/20 shrink-0">
                      <AlertTriangle size={13} className="shrink-0 text-yellow-500" />
                      <span className="text-xs text-yellow-400/90">
                        This table has no primary key. Row operations (edit, delete) may affect multiple rows. Add a primary key column to ensure safe row-level operations.
                      </span>
                    </div>
                  )}

                  {/* Data / Definition view */}
                  {tableView === "definition" ? ((() => {
                    const cols = selectedTableMeta?.columns ?? [];
                    const lines = cols.map((col) => {
                      let line = `  "${col.column_name}" ${col.data_type}`;
                      if (col.is_nullable === "NO") line += " NOT NULL";
                      if (col.column_default) line += ` DEFAULT ${col.column_default}`;
                      return line;
                    });
                    const ddl = `CREATE TABLE "${selectedTable}" (\n${lines.join(",\n")}\n);`;
                    return (
                      <div className="flex-1 overflow-auto relative">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(ddl);
                            setDefCopied(true);
                            setTimeout(() => setDefCopied(false), 2000);
                          }}
                          className="cursor-pointer absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors border border-zinc-700"
                        >
                          {defCopied ? <><Check size={12} className="text-green-400" /> Copied</> : <><Copy size={12} /> Copy</>}
                        </button>
                        <MonacoEditor
                          height="100%"
                          language="sql"
                          theme="vs-dark"
                          value={ddl}
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            lineNumbers: "on",
                            fontSize: 13,
                            glyphMargin: false,
                            folding: false,
                            lineDecorationsWidth: 16,
                            lineNumbersMinChars: 3,
                            overviewRulerLanes: 0,
                            renderLineHighlight: "none",
                            padding: { top: 12, bottom: 12 },
                            automaticLayout: true,
                            wordWrap: "on",
                            domReadOnly: true,
                          }}
                        />
                      </div>
                    );
                  })()) : (
                    <div className="flex-1 flex overflow-hidden">
                      {/* ── Frozen columns panel (hidden when empty) ── */}
                      {frozenColumns.length > 0 && (
                        <div className="shrink-0 overflow-hidden border-r-2 border-zinc-700 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.5)]">
                          <table className="text-xs border-collapse">
                            <thead className="sticky top-0 bg-zinc-950 z-10">
                              <tr className="border-b border-zinc-800">
                                <th className="w-10 px-3 py-2.5 border-r border-zinc-800 bg-zinc-950 text-zinc-700 font-normal select-none">
                                  <div className="flex items-center justify-center">
                                    <input
                                      type="checkbox"
                                      checked={selectableIds.size > 0 && selectedRows.size === selectableIds.size}
                                      onChange={toggleAll}
                                      className="cursor-pointer w-3.5 h-3.5 accent-brand-500 rounded border-zinc-700 bg-zinc-900"
                                    />
                                  </div>
                                </th>
                                {frozenColumns.map((col) => {
                                  const isSorted = sortCol === col.column_name;
                                  return (
                                    <th
                                      key={col.column_name}
                                      className="text-left px-3 py-2.5 font-medium border-r border-zinc-800 whitespace-nowrap min-w-30 group/col"
                                    >
                                      <div className="flex items-center gap-1.5 justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <Lock size={9} className="text-brand-500 shrink-0" />
                                          <span className="text-zinc-200">{col.column_name}</span>
                                          <span className="text-[10px] text-zinc-600 font-normal font-mono">{col.data_type}</span>
                                          {isSorted && (
                                            <span className="text-[9px] text-brand-400 font-mono">{sortDir === "asc" ? "↑" : "↓"}</span>
                                          )}
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            setColMenuPos({ x: 0, y: 0, opacity: 0 });
                                            setColMenu({ col, anchorRect: rect });
                                          }}
                                          className="cursor-pointer opacity-0 group-hover/col:opacity-100 p-0.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
                                        >
                                          <ChevronDown size={11} />
                                        </button>
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {tableLoading ? (
                                <tr><td colSpan={99} className="px-4 py-12" /></tr>
                              ) : tableRows.length === 0 ? (
                                <tr><td colSpan={99} className="px-4 py-12" /></tr>
                              ) : tableRows.map((row, i) => {
                                const rowId = pkCol ? (row[pkCol] as string | number) : i;
                                const isSelected = selectedRows.has(rowId);
                                return (
                                  <tr key={i} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 group ${isSelected ? "bg-brand-500/5 hover:bg-brand-500/10" : ""}`}>
                                    <td className="px-3 py-2 text-zinc-700 border-r border-zinc-800 text-center font-mono select-none">
                                      <div className="flex items-center justify-center">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleRow(rowId)}
                                          className="cursor-pointer w-3.5 h-3.5 accent-brand-500 rounded border-zinc-700 bg-zinc-900"
                                        />
                                      </div>
                                    </td>
                                    {frozenColumns.map((col) => {
                                      const isCellSelected = selectedCell?.rowIndex === i && selectedCell?.colName === col.column_name;
                                      return (
                                        <td
                                          key={col.column_name}
                                          className={`px-3 py-2 text-zinc-300 border-r border-zinc-800 max-w-xs truncate cursor-pointer select-none ${isCellSelected ? "ring-1 ring-inset ring-brand-500 bg-brand-500/5" : ""}`}
                                          title={String(row[col.column_name] ?? "")}
                                          onClick={() => setSelectedCell({ rowIndex: i, colName: col.column_name })}
                                          onContextMenu={(e) => {
                                            e.preventDefault();
                                            setSelectedCell({ rowIndex: i, colName: col.column_name });
                                            setCellContextMenu({ x: e.clientX, y: e.clientY, row, rowIndex: i, colName: col.column_name });
                                          }}
                                        >
                                          {row[col.column_name] === null || row[col.column_name] === undefined ? (
                                            <span className="text-zinc-700 italic">NULL</span>
                                          ) : typeof row[col.column_name] === "object" ? (
                                            <span className="font-mono text-zinc-400">{JSON.stringify(row[col.column_name])}</span>
                                          ) : (
                                            String(row[col.column_name])
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* ── Scrollable main table ── */}
                      <div className="flex-1 overflow-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead className="sticky top-0 bg-zinc-950 z-10">
                            <tr className="border-b border-zinc-800">
                              {frozenColumns.length === 0 && (
                                <th className="w-10 px-3 py-2.5 border-r border-zinc-800 bg-zinc-950 text-zinc-700 font-normal select-none">
                                  <div className="flex items-center justify-center">
                                    <input
                                      type="checkbox"
                                      checked={selectableIds.size > 0 && selectedRows.size === selectableIds.size}
                                      onChange={toggleAll}
                                      className="cursor-pointer w-3.5 h-3.5 accent-brand-500 rounded border-zinc-700 bg-zinc-900"
                                    />
                                  </div>
                                </th>
                              )}
                              {unfrozenColumns.map((col) => {
                                const isSorted = sortCol === col.column_name;
                                return (
                                  <th
                                    key={col.column_name}
                                    className="text-left px-3 py-2.5 font-medium border-r border-zinc-800 last:border-r-0 whitespace-nowrap min-w-30 group/col"
                                  >
                                    <div className="flex items-center gap-1.5 justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-zinc-200">{col.column_name}</span>
                                        <span className="text-[10px] text-zinc-600 font-normal font-mono">{col.data_type}</span>
                                        {isSorted && (
                                          <span className="text-[9px] text-brand-400 font-mono">{sortDir === "asc" ? "↑" : "↓"}</span>
                                        )}
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                          setColMenuPos({ x: 0, y: 0, opacity: 0 });
                                          setColMenu({ col, anchorRect: rect });
                                        }}
                                        className="cursor-pointer opacity-0 group-hover/col:opacity-100 p-0.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
                                      >
                                        <ChevronDown size={11} />
                                      </button>
                                    </div>
                                  </th>
                                );
                              })}
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
                            ) : tableRows.map((row, i) => {
                              const rowId = pkCol ? (row[pkCol] as string | number) : i;
                              const isSelected = selectedRows.has(rowId);
                              return (
                                <tr key={i} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 group ${isSelected ? "bg-brand-500/5 hover:bg-brand-500/10" : ""}`}>
                                  {frozenColumns.length === 0 && (
                                    <td className="px-3 py-2 text-zinc-700 border-r border-zinc-800 text-center font-mono select-none">
                                      <div className="flex items-center justify-center">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleRow(rowId)}
                                          className="cursor-pointer w-3.5 h-3.5 accent-brand-500 rounded border-zinc-700 bg-zinc-900"
                                        />
                                      </div>
                                    </td>
                                  )}
                                  {unfrozenColumns.map((col) => {
                                    const isCellSelected = selectedCell?.rowIndex === i && selectedCell?.colName === col.column_name;
                                    return (
                                      <td
                                        key={col.column_name}
                                        className={`px-3 py-2 text-zinc-300 border-r border-zinc-800 last:border-r-0 max-w-xs truncate cursor-pointer select-none ${isCellSelected ? "ring-1 ring-inset ring-brand-500 bg-brand-500/5" : ""}`}
                                        title={String(row[col.column_name] ?? "")}
                                        onClick={() => setSelectedCell({ rowIndex: i, colName: col.column_name })}
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          setSelectedCell({ rowIndex: i, colName: col.column_name });
                                          setCellContextMenu({ x: e.clientX, y: e.clientY, row, rowIndex: i, colName: col.column_name });
                                        }}
                                      >
                                        {row[col.column_name] === null || row[col.column_name] === undefined ? (
                                          <span className="text-zinc-700 italic">NULL</span>
                                        ) : typeof row[col.column_name] === "object" ? (
                                          <span className="font-mono text-zinc-400">{JSON.stringify(row[col.column_name])}</span>
                                        ) : (
                                          String(row[col.column_name])
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="px-2 py-2">
                                    <button
                                      onClick={() => {
                                        if (!pkCol) return;
                                        setConfirmModal({
                                          message: `Delete this row from "${selectedTable}"? This cannot be undone.`,
                                          onConfirm: async () => {
                                            setConfirmModal(null);
                                            const delRes = await fetch(`/api/dashboard/${projectId}/tables/${selectedTable}`, {
                                              method: "DELETE",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ where: { [pkCol]: row[pkCol] } }),
                                            });
                                            const delData = await delRes.json();
                                            if (delData.error) { toast.error(delData.error); return; }
                                            fetchTableRows(selectedTable!, tableOffset);
                                          },
                                        });
                                      }}
                                      className="cursor-pointer opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-all"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
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
        {tab === "sql" && (
          <div className="flex h-full overflow-hidden">
            {/* ── History sidebar ── */}
            <div className="w-60 shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-950 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-800 shrink-0">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">History</span>
                {historyLoading && <RefreshCw size={11} className="animate-spin text-zinc-600" />}
              </div>
              <div className="flex-1 overflow-y-auto">
                {(["favorite", "shared", "private"] as const).map((section) => {
                  const items = sqlHistory.filter((q) => q.visibility === section);
                  const sectionLabel = section === "favorite" ? "Favorites" : section === "shared" ? "Shared" : "Private";
                  const SectionIcon = section === "favorite" ? Star : section === "shared" ? Users : Lock;
                  return (
                    <div key={section}>
                      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-900">
                        <SectionIcon size={11} className="text-zinc-600 shrink-0" />
                        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{sectionLabel}</span>
                        <span className="ml-auto text-[10px] text-zinc-700">{items.length}</span>
                      </div>
                      {items.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] text-zinc-700 italic">None</p>
                      ) : (
                        <ul>
                          {items.map((q) => (
                            <li key={q.id} className="group border-b border-zinc-900/50">
                              {renamingId === q.id ? (
                                <div className="flex items-center gap-1 px-2 py-1.5">
                                  <input
                                    autoFocus
                                    className="flex-1 bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded focus:outline-none"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") renameQuery(q.id, renameValue);
                                      if (e.key === "Escape") setRenamingId(null);
                                    }}
                                  />
                                  <button onClick={() => renameQuery(q.id, renameValue)} className="cursor-pointer p-1 text-green-400 hover:text-green-300">
                                    <Check size={11} />
                                  </button>
                                  <button onClick={() => setRenamingId(null)} className="cursor-pointer p-1 text-zinc-500 hover:text-zinc-300">
                                    <X size={11} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setSqlQuery(q.sql)}
                                  className="cursor-pointer w-full text-left px-3 py-2 hover:bg-zinc-800/60 transition-colors"
                                >
                                  <div className="text-[11px] text-zinc-300 truncate">
                                    {q.name ?? q.sql.replace(/\s+/g, " ").slice(0, 60)}
                                  </div>
                                  <div className="text-[10px] text-zinc-600 mt-0.5">
                                    {new Date(q.executedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                  {/* action row — shown on hover */}
                                  <div className="hidden group-hover:flex items-center gap-1 mt-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); updateQueryVisibility(q.id, "favorite"); }}
                                      title="Favorite"
                                      className={`cursor-pointer p-0.5 rounded transition-colors ${q.visibility === "favorite" ? "text-yellow-400" : "text-zinc-600 hover:text-yellow-400"}`}
                                    >
                                      <Star size={10} />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); updateQueryVisibility(q.id, q.visibility === "shared" ? "private" : "shared"); }}
                                      title={q.visibility === "shared" ? "Make private" : "Share"}
                                      className={`cursor-pointer p-0.5 rounded transition-colors ${q.visibility === "shared" ? "text-blue-400" : "text-zinc-600 hover:text-blue-400"}`}
                                    >
                                      <Users size={10} />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setRenamingId(q.id); setRenameValue(q.name ?? ""); }}
                                      title="Rename"
                                      className="cursor-pointer p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                                    >
                                      <Pencil size={10} />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); deleteQuery(q.id); }}
                                      title="Delete"
                                      className="cursor-pointer p-0.5 rounded text-zinc-600 hover:text-red-400 transition-colors ml-auto"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  </div>
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Editor + Results ── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Editor area */}
              <div className="flex flex-col" style={{ height: "50%" }}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">SQL Query</span>
                    <span className="text-xs text-zinc-600 font-mono bg-zinc-900 px-2 py-0.5 rounded">
                      schema: proj_{projectId.replace(/-/g, "")}
                    </span>
                  </div>
                  <button
                    onClick={runSql}
                    disabled={sqlRunning || !sqlQuery.trim()}
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                  >
                    {sqlRunning ? <RefreshCw size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                    {sqlRunning ? "Running…" : "Run"}
                  </button>
                </div>
                <textarea
                  className="flex-1 w-full bg-zinc-950 text-zinc-100 text-sm font-mono px-4 py-3 resize-none focus:outline-none placeholder-zinc-700"
                  placeholder={"-- All queries run in your project schema automatically.\n-- Use table names directly, e.g.:\nSELECT * FROM dating_profiles LIMIT 10;\nCREATE TABLE my_table (id SERIAL PRIMARY KEY, name TEXT);"}
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      runSql();
                    }
                  }}
                  spellCheck={false}
                />
              </div>

              {/* Results area */}
              <div className="flex-1 flex flex-col border-t border-zinc-800 overflow-hidden">
                <div className="px-4 py-2 border-b border-zinc-800 shrink-0 flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Results</span>
                  {sqlResult && (
                    <span className="text-xs text-zinc-500">
                      {sqlResult.rowCount ?? sqlResult.rows.length} row{(sqlResult.rowCount ?? sqlResult.rows.length) !== 1 ? "s" : ""}
                      {" · "}
                      {sqlResult.command}
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-auto">
                  {sqlError ? (
                    <div className="px-4 py-3 text-xs text-red-400 font-mono whitespace-pre-wrap">{sqlError}</div>
                  ) : !sqlResult ? (
                    <div className="h-full flex items-center justify-center text-zinc-700 text-sm">
                      Run a query to see results
                    </div>
                  ) : sqlResult.rows.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-zinc-500">
                      {sqlResult.command === "SELECT" ? "Query returned 0 rows." : `${sqlResult.command} executed successfully.`}
                    </div>
                  ) : (
                    <table className="w-full text-xs font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 sticky top-0 bg-zinc-950">
                          {sqlResult.fields.map((f) => (
                            <th key={f.name} className="px-4 py-2 text-left text-zinc-400 font-semibold whitespace-nowrap border-r border-zinc-800 last:border-r-0">
                              {f.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResult.rows.map((row, i) => (
                          <tr key={i} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                            {sqlResult!.fields.map((f) => (
                              <td key={f.name} className="px-4 py-1.5 text-zinc-300 whitespace-nowrap border-r border-zinc-900 last:border-r-0 max-w-xs truncate">
                                {row[f.name] === null ? (
                                  <span className="text-zinc-600 italic">null</span>
                                ) : typeof row[f.name] === "object" ? (
                                  JSON.stringify(row[f.name])
                                ) : (
                                  String(row[f.name])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
                            onClick={() => { setPolicyForm((f) => ({ ...f, table: t.tablename })); newPolicyPanel.open(); }}
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
                          <button onClick={() => { setPolicyForm((f) => ({ ...f, table: t.tablename })); newPolicyPanel.open(); }}
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
            className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${newTablePanel.closing ? "closing" : ""}`}
            onClick={() => newTablePanel.close()}
          />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-170 bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${newTablePanel.closing ? "closing" : ""}`}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
              <p className="text-sm text-zinc-400">
                Create a new table under{" "}
                <code className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-xs font-mono">public</code>
              </p>
              <button
                onClick={() => newTablePanel.close()}
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
                onClick={() => newTablePanel.close()}
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
          <div className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/60 ${newPolicyPanel.closing ? "closing" : ""}`} onClick={() => newPolicyPanel.close()} />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 flex shadow-2xl ${newPolicyPanel.closing ? "closing" : ""}`} style={{ width: "860px" }}>
            {/* Left: form */}
            <div className="flex-1 bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                <h2 className="text-base font-semibold text-white">Create a new Row Level Security policy</h2>
                <button onClick={() => newPolicyPanel.close()} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
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
                <button onClick={() => newPolicyPanel.close()}
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
          <div className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/60 ${editPolicyPanel.closing ? "closing" : ""}`} onClick={() => editPolicyPanel.close()} />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 flex shadow-2xl ${editPolicyPanel.closing ? "closing" : ""}`} style={{ width: "600px" }}>
            <div className="flex-1 bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-white">Edit policy</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">on <span className="font-mono text-zinc-400">{editingPolicy.tablename}</span></p>
                </div>
                <button onClick={() => editPolicyPanel.close()} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
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
                <button onClick={() => editPolicyPanel.close()}
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

      {/* ── Column Context Menu ── */}
      {colMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColMenu(null)} />
          <div
            ref={colMenuRef}
            className="fixed z-50 w-52 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 overflow-hidden transition-opacity duration-75"
            style={{ left: colMenuPos.x, top: colMenuPos.y, opacity: colMenuPos.opacity }}
          >
            <button
              onClick={() => handleSortAsc(colMenu.col.column_name)}
              className="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <ArrowUpDown size={13} className="text-zinc-500 shrink-0" />
              Sort Ascending
            </button>
            <button
              onClick={() => handleSortDesc(colMenu.col.column_name)}
              className="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <ArrowUpDown size={13} className="text-zinc-500 shrink-0 rotate-180" />
              Sort Descending
            </button>
            <div className="h-px bg-zinc-800 my-1" />
            <button
              onClick={() => handleCopyColName(colMenu.col.column_name)}
              className="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Copy size={13} className="text-zinc-500 shrink-0" />
              Copy name
            </button>
            <button
              onClick={() => openEditCol(colMenu.col)}
              className="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Pencil size={13} className="text-zinc-500 shrink-0" />
              Edit column
            </button>
            <button
              onClick={() => handleFreezeCol(colMenu.col.column_name)}
              className="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Lock size={13} className={`shrink-0 ${frozenOrder.includes(colMenu.col.column_name) ? "text-brand-400" : "text-zinc-500"}`} />
              {frozenOrder.includes(colMenu.col.column_name) ? "Unfreeze column" : "Freeze column"}
            </button>
            <div className="h-px bg-zinc-800 my-1" />
            <button
              onClick={() => handleDeleteCol(colMenu.col)}
              className="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
            >
              <Trash2 size={13} className="shrink-0" />
              Delete column
            </button>
          </div>
        </>
      )}

      {/* ── Edit Column Slideover ── */}
      {showEditCol && editColTarget && (
        <>
          <div className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${editColPanel.closing ? "closing" : ""}`} onClick={() => editColPanel.close()} />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-[420px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${editColPanel.closing ? "closing" : ""}`}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-white">Edit column</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  in <span className="font-mono text-zinc-400">{selectedTable}</span>
                </p>
              </div>
              <button onClick={() => editColPanel.close()} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">Column name</label>
                  <input
                    autoFocus
                    value={editColName}
                    onChange={(e) => setEditColName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEditCol(); }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">Type</label>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-500 font-mono cursor-not-allowed">
                    {editColTarget.data_type}
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">Type changes require SQL — use the SQL editor.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
              <button onClick={() => editColPanel.close()} className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors">
                Cancel
              </button>
              <button
                onClick={saveEditCol}
                disabled={editColLoading || !editColName.trim()}
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                {editColLoading ? "Saving…" : "Save changes"}
              </button>
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
          <div className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${insertRowPanel.closing ? "closing" : ""}`} onClick={() => insertRowPanel.close()} />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-[520px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${insertRowPanel.closing ? "closing" : ""}`}>
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
                <button onClick={() => insertRowPanel.close()}
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
          <div className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${insertColPanel.closing ? "closing" : ""}`} onClick={() => insertColPanel.close()} />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-[520px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${insertColPanel.closing ? "closing" : ""}`}>
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
                <button onClick={() => insertColPanel.close()}
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

      {/* ── Cell Context Menu ── */}
      {cellContextMenu && (
        <div
          ref={cellContextMenuRef}
          className="fixed z-[80] min-w-[180px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 text-xs"
          style={{ left: cellContextMenu.x, top: cellContextMenu.y }}
        >
          <button
            className="cursor-pointer w-full flex items-center gap-3 px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            onClick={() => {
              const val = cellContextMenu.row[cellContextMenu.colName];
              const text = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
              navigator.clipboard.writeText(text);
              toast.success("Copied");
              setCellContextMenu(null);
            }}
          >
            <Copy size={13} className="text-zinc-500" />
            Copy cell
          </button>
          <button
            className="cursor-pointer w-full flex items-center gap-3 px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(cellContextMenu.row));
              toast.success("Copied");
              setCellContextMenu(null);
            }}
          >
            <Copy size={13} className="text-zinc-500" />
            Copy row
          </button>
          <div className="h-px bg-zinc-800 my-1" />
          <button
            className="cursor-pointer w-full flex items-center gap-3 px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            onClick={() => {
              const val = cellContextMenu.row[cellContextMenu.colName];
              const text = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
              toast.success(`Filtered by: ${cellContextMenu.colName} = ${text}`);
              setCellContextMenu(null);
            }}
          >
            <Search size={13} className="text-zinc-500" />
            Filter by value
          </button>
          <div className="h-px bg-zinc-800 my-1" />
          <button
            className="cursor-pointer w-full flex items-center gap-3 px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            onClick={() => {
              setEditRowData(cellContextMenu.row);
              setEditRowValues(
                Object.fromEntries(
                  Object.entries(cellContextMenu.row).map(([k, v]) => [
                    k,
                    v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v),
                  ])
                )
              );
              editRowPanel.open();
              setCellContextMenu(null);
            }}
          >
            <Pencil size={13} className="text-zinc-500" />
            Edit row
          </button>
          <button
            className="cursor-pointer w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:bg-zinc-800 hover:text-red-300 transition-colors"
            onClick={() => {
              setCellContextMenu(null);
              if (!pkCol) return;
              setConfirmModal({
                message: `Delete this row from "${selectedTable}"? This cannot be undone.`,
                onConfirm: async () => {
                  setConfirmModal(null);
                  const delRes = await fetch(`/api/dashboard/${projectId}/tables/${selectedTable}`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ where: { [pkCol]: cellContextMenu.row[pkCol] } }),
                  });
                  const delData = await delRes.json();
                  if (delData.error) { toast.error(delData.error); return; }
                  fetchTableRows(selectedTable!, tableOffset);
                },
              });
            }}
          >
            <Trash2 size={13} className="text-red-500" />
            Delete row
          </button>
        </div>
      )}

      {/* ── Edit Row Slideover ── */}
      {showEditRow && editRowData && (
        <>
          <div className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${editRowPanel.closing ? "closing" : ""}`} onClick={() => editRowPanel.close()} />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-[520px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${editRowPanel.closing ? "closing" : ""}`}>
            <div className="px-6 py-4 border-b border-zinc-800 shrink-0 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                Edit row in{" "}
                <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-zinc-200">
                  {selectedTable}
                </code>
              </h2>
              <button onClick={() => editRowPanel.close()} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
              {selectedTableMeta?.columns.map((col) => (
                <div key={col.column_name} className="px-6 py-4 flex gap-6">
                  <div className="w-44 shrink-0">
                    <p className="text-sm text-zinc-200">{col.column_name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{col.data_type}</p>
                    {col.is_primary_key && <span className="text-[10px] text-brand-400 font-mono">primary key</span>}
                  </div>
                  <div className="flex-1">
                    <input
                      disabled={!!col.is_primary_key}
                      value={editRowValues[col.column_name] ?? ""}
                      onChange={(e) => setEditRowValues((v) => ({ ...v, [col.column_name]: e.target.value }))}
                      placeholder={col.column_default ?? "NULL"}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
              <button onClick={() => editRowPanel.close()}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors">
                Cancel
              </button>
              <button onClick={saveEditRow} disabled={editRowLoading}
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
                {editRowLoading ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Import SQL Slideover ── */}
      {showImportSql && (
        <>
          <div
            className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${importSqlPanel.closing ? "closing" : ""}`}
            onClick={() => importSqlPanel.close()}
          />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-[560px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${importSqlPanel.closing ? "closing" : ""}`}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 shrink-0">
              <div>
                <p className="text-sm font-semibold text-white">Import SQL</p>
                <p className="text-xs text-zinc-500 mt-0.5">Upload a .sql file to create tables, indexes, or run any SQL</p>
              </div>
              <button
                onClick={() => importSqlPanel.close()}
                className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-6">

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setImportSqlDragging(true); }}
                onDragLeave={() => setImportSqlDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setImportSqlDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleImportSqlFile(file);
                }}
                onClick={() => importSqlInputRef.current?.click()}
                className={`cursor-pointer flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-10 transition-colors ${
                  importSqlDragging
                    ? "border-brand-500 bg-brand-500/5"
                    : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/40"
                }`}
              >
                <Upload size={24} className="text-zinc-500" />
                <div className="text-center">
                  <p className="text-sm text-zinc-300">
                    {importSqlFileName ?? "Drop a .sql file here or click to browse"}
                  </p>
                  {!importSqlFileName && (
                    <p className="text-xs text-zinc-600 mt-1">Supports .sql files</p>
                  )}
                </div>
                {importSqlFileName && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setImportSqlFileName(null); setImportSqlContent(""); setImportSqlResult(null); }}
                    className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 underline"
                  >
                    Remove file
                  </button>
                )}
                <input
                  ref={importSqlInputRef}
                  type="file"
                  accept=".sql,text/plain"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportSqlFile(f); e.target.value = ""; }}
                />
              </div>

              {/* SQL preview / editor */}
              {importSqlContent && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-400 font-medium">SQL Preview / Edit</label>
                  <textarea
                    value={importSqlContent}
                    onChange={(e) => setImportSqlContent(e.target.value)}
                    rows={12}
                    spellCheck={false}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono placeholder-zinc-600 focus:outline-none focus:border-brand-500 resize-y"
                  />
                </div>
              )}

              {/* Result */}
              {importSqlResult && (
                <div className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm border ${
                  importSqlResult.success
                    ? "bg-green-950/40 border-green-800/50 text-green-300"
                    : "bg-red-950/40 border-red-800/50 text-red-300"
                }`}>
                  {importSqlResult.success
                    ? <Check size={14} className="mt-0.5 shrink-0" />
                    : <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  }
                  <span className="break-words">{importSqlResult.message}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
              <button
                onClick={() => importSqlPanel.close()}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={runImportSql}
                disabled={!importSqlContent.trim() || importSqlRunning}
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                <Upload size={14} />
                {importSqlRunning ? "Running…" : "Run SQL"}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
