"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  Table2,
  Search,
  Filter,
  Edit3,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Check,
  AlertCircle,
  Sparkles,
  Send,
  Loader2,
} from "lucide-react";
import { supabase } from "@/app/student/supabase";
import { adminUpdateRecord, adminFetchTableData, adminFetchTableColumns } from "@/app/actions/admin";

// Available tables for staff to explore
const TABLES = [
  { id: "students", label: "Students", accent: "#17685E" },
  { id: "staff", label: "Staff", accent: "#17685E" },
  { id: "event_proposals", label: "Event Proposals", accent: "#10B981" },
  { id: "group_activities", label: "Student Activity Logs", accent: "#8C6A31" },
  { id: "staff_activities", label: "Staff Activity Logs", accent: "#17685E" },
  { id: "student_activities", label: "Legacy Student Activities", accent: "#8C6A31" },
];

const PAGE_SIZE = 20;

type FilterRule = {
  column: string;
  value: string;
};

export default function DBExplorerPage() {
  const [activeTable, setActiveTable] = useState(TABLES[0].id);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filter state
  const [filters, setFilters] = useState<FilterRule[]>([{ column: "", value: "" }]);
  const [appliedFilters, setAppliedFilters] = useState<FilterRule[]>([]);

  // Edit state
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editBuffer, setEditBuffer] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // PulseAI state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLastQuery, setAiLastQuery] = useState<string | null>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  const activeTableConfig = TABLES.find((t) => t.id === activeTable)!;

  // Determine primary key column for each table
  const getPrimaryKey = useCallback((table: string) => {
    switch (table) {
      case "students":
        return "uid";
      case "staff":
        return "suid";
      case "event_proposals":
        return "id";
      case "student_activities":
      case "staff_activities":
        return "activity_id";
      default:
        return "id";
    }
  }, []);

  // Fetch table data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, count } = await adminFetchTableData(activeTable, page, PAGE_SIZE, appliedFilters);

      if (data && data.length > 0) {
        setColumns(Object.keys(data[0]));
        setRows(data);
      } else {
        // Fetch column names even if no rows
        const { columns } = await adminFetchTableColumns(activeTable);
        setColumns(columns);
        setRows([]);
      }
      setTotalCount(count || 0);
    } catch (error: any) {
      console.error("DB Explorer fetch error:", error);
      showToast("error", error.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [activeTable, appliedFilters, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Reset page and filters when switching tables
  useEffect(() => {
    setPage(0);
    setFilters([{ column: "", value: "" }]);
    setAppliedFilters([]);
    setEditingRow(null);
  }, [activeTable]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // --- PulseAI Handler ---
  const handlePulseAI = async () => {
    const trimmed = aiPrompt.trim();
    if (!trimmed || aiLoading) return;

    setAiLoading(true);
    setAiError(null);

    try {
      // We need column info for all tables. Fetch a sample row from each to get columns.
      const tablesWithColumns = await Promise.all(
        TABLES.map(async (table) => {
          const { columns } = await adminFetchTableColumns(table.id);
          return {
            id: table.id,
            label: table.label,
            columns,
          };
        })
      );

      const res = await fetch("/api/pulse-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, tables: tablesWithColumns }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI query failed");
      }

      // Apply the AI result: switch table, set filters, trigger fetch
      setActiveTable(data.table);
      const newFilters =
        data.filters && data.filters.length > 0
          ? data.filters.map((f: any) => ({ column: f.column, value: f.value }))
          : [{ column: "", value: "" }];
      setFilters(newFilters);
      setAppliedFilters(data.filters || []);
      setPage(0);
      setAiLastQuery(trimmed);
      setRefreshKey((k) => k + 1);

      showToast("success", `PulseAI applied: ${data.table}${data.filters?.length ? " with " + data.filters.length + " filter(s)" : ""}`);
    } catch (err: any) {
      setAiError(err.message || "Something went wrong");
      showToast("error", err.message || "PulseAI query failed");
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyFilters = () => {
    const valid = filters.filter((f) => f.column && f.value);
    setAppliedFilters(valid);
    setPage(0);
  };

  const handleClearFilters = () => {
    setFilters([{ column: "", value: "" }]);
    setAppliedFilters([]);
    setPage(0);
  };

  const addFilterRow = () => {
    setFilters([...filters, { column: "", value: "" }]);
  };

  const updateFilter = (index: number, field: "column" | "value", val: string) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], [field]: val };
    setFilters(updated);
  };

  const removeFilter = (index: number) => {
    if (filters.length === 1) {
      setFilters([{ column: "", value: "" }]);
      return;
    }
    setFilters(filters.filter((_, i) => i !== index));
  };

  // --- Inline Editing ---
  const startEdit = (rowIndex: number) => {
    setEditingRow(rowIndex);
    setEditBuffer({ ...rows[rowIndex] });
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditBuffer({});
  };

  const handleEditChange = (col: string, val: string) => {
    setEditBuffer((prev) => ({ ...prev, [col]: val }));
  };

  const saveEdit = async () => {
    if (editingRow === null) return;
    setSaving(true);
    try {
      const pk = getPrimaryKey(activeTable);
      const pkValue = rows[editingRow][pk];

      // Remove the PK from the update payload (don't update the primary key)
      const updatePayload = { ...editBuffer };
      delete updatePayload[pk];

      await adminUpdateRecord(activeTable, pk, pkValue, updatePayload);

      // Update local state
      const updatedRows = [...rows];
      updatedRows[editingRow] = { ...editBuffer };
      setRows(updatedRows);

      setEditingRow(null);
      setEditBuffer({});
      showToast("success", "Row updated successfully!");
    } catch (error: any) {
      showToast("error", error.message || "Failed to update row");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Format cell value for display
  const formatCell = (value: any) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value);
    const str = String(value);
    if (str.length > 60) return str.slice(0, 57) + "...";
    return str;
  };

  return (
    <div className="max-w-full mx-auto pb-10">
      {/* --- Toast Notification --- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={`fixed top-6 left-1/2 z-50 px-6 py-3 rounded-lg font-bold text-sm  flex items-center gap-2 ${
              toast.type === "success"
                ? "bg-emerald-500 text-white "
                : "bg-rose-500 text-white "
            }`}
          >
            {toast.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Header --- */}
      <motion.div initial={false} animate={{ opacity: 1, x: 0 }} className="mb-8">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
          <Database className="text-[#17685E]" size={36} />
          DB <span className="text-[#17685E]">Explorer</span>
        </h1>
        <p className="text-slate-500 mt-2">
          Browse, search, and edit database tables directly.
        </p>
      </motion.div>

      {/* --- PulseAI Input --- */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-8 relative"
      >
        <div
          className="relative bg-[#FFFFFF] rounded-lg border border-slate-200 overflow-hidden"
          style={{
            boxShadow: aiLoading
              ? "0 0 30px rgba(96,165,250,0.15), 8px 8px 16px rgba(0,0,0,0.05), -8px -8px 16px rgba(255,255,255,0.8)"
              : "8px 8px 16px rgba(0,0,0,0.05), -8px -8px 16px rgba(255,255,255,0.8)",
            transition: "box-shadow 0.4s ease",
          }}
        >
          {/* Gradient accent bar */}
          <div
            className="h-1 w-full"
            style={{
              background: "linear-gradient(90deg, #17685E, #17685E, #10B981, #8C6A31, #17685E)",
              backgroundSize: "200% 100%",
              animation: aiLoading ? "pulseai-gradient 2s ease infinite" : "none",
            }}
          />

          <div className="p-5 md:p-6">
            {/* Label row */}
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #17685E, #17685E)",
                  boxShadow: "0 4px 12px rgba(96,165,250,0.3)",
                }}
              >
                <Sparkles size={16} className="text-white" />
              </div>
              <h3 className="text-sm font-semibold normal-case tracking-normal text-slate-600">
                CamPulse<span style={{ color: "#10B981" }}> AI™</span>
              </h3>
              <span className="text-xs font-bold normal-case tracking-normal text-slate-500 ml-1">
                Proprietary Neural Network
              </span>
            </div>

            {/* Input row */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Sparkles
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#10B981] opacity-50"
                />
                <input
                  ref={aiInputRef}
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => {
                    setAiPrompt(e.target.value);
                    if (aiError) setAiError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handlePulseAI();
                  }}
                  placeholder='Ask our self-trained LLM... e.g. "Show female students from AIDS department"'
                  disabled={aiLoading}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3.5 pl-11 pr-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-700 placeholder:text-slate-500 border-none text-sm font-medium disabled:opacity-60"
                />
              </div>
              <motion.button
                onClick={handlePulseAI}
                disabled={aiLoading || !aiPrompt.trim()}
                className="shrink-0 px-6 py-3.5 rounded-full text-white font-bold text-xs normal-case tracking-normal  transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #17685E, #17685E)",
                  boxShadow: "0 8px 20px rgba(96,165,250,0.3)",
                }}
              >
                {aiLoading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 size={14} />
                    </motion.div>
                    Thinking...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Query
                  </>
                )}
              </motion.button>
            </div>

            {/* AI result / error feedback */}
            <AnimatePresence>
              {aiError && (
                <motion.p
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="mt-3 text-xs text-rose-500 font-medium flex items-center gap-1.5 pl-1"
                >
                  <AlertCircle size={12} />
                  {aiError}
                </motion.p>
              )}
              {aiLastQuery && !aiError && !aiLoading && (
                <motion.div
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="mt-3 flex items-center gap-2 pl-1"
                >
                  <Check size={12} className="text-emerald-500" />
                  <span className="text-xs text-slate-500 font-medium">
                    Last query: &ldquo;{aiLastQuery}&rdquo; &rarr;{" "}
                    <span className="font-bold" style={{ color: activeTableConfig.accent }}>
                      {activeTableConfig.label}
                    </span>
                    {appliedFilters.length > 0 && (
                      <> with {appliedFilters.length} filter{appliedFilters.length > 1 ? "s" : ""}</>
                    )}
                  </span>
                  <button
                    onClick={() => {
                      setAiLastQuery(null);
                      setAiPrompt("");
                      handleClearFilters();
                    }}
                    className="ml-2 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Clear AI query"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Keyframe animation for gradient bar */}
      <style jsx>{`
        @keyframes pulseai-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      {/* --- Table Selector Tabs --- */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap gap-3 mb-8"
      >
        {TABLES.map((table) => (
          <button
            key={table.id}
            onClick={() => setActiveTable(table.id)}
            className={`px-6 py-3 rounded-full font-bold normal-case tracking-normal text-xs transition-all flex items-center gap-2 ${
              activeTable === table.id
                ? "text-white "
                : "bg-[#FFFFFF] text-slate-500 border border-slate-200"
            }`}
            style={
              activeTable === table.id
                ? { backgroundColor: table.accent, boxShadow: `0 10px 15px -3px ${table.accent}40` }
                : {}
            }
          >
            <Table2 size={14} />
            {table.label}
          </button>
        ))}
      </motion.div>

      {/* --- Filter Panel --- */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#FFFFFF] p-6 md:p-8 rounded-lg border border-slate-200 mb-8"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-slate-700 flex items-center gap-2">
            <Filter size={18} className="text-[#17685E]" />
            Query Filters
          </h3>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => {
                setRefreshKey((k) => k + 1);
              }}
              className="p-2.5 rounded-full bg-[#FFFFFF] border border-slate-200 text-slate-500 hover:text-[#17685E] transition-colors"
              title="Refresh Data"
            >
              <RefreshCw size={16} />
            </motion.button>
          </div>
        </div>

        <div className="space-y-3">
          {filters.map((filter, i) => (
            <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Column selector */}
              <select
                value={filter.column}
                onChange={(e) => updateFilter(i, "column", e.target.value)}
                className="flex-1 sm:max-w-[200px] bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none cursor-pointer text-sm font-medium"
              >
                <option value="">Select Column</option>
                {columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>

              {/* Value input */}
              <div className="flex-1 relative">
                <Search
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  value={filter.value}
                  onChange={(e) => updateFilter(i, "value", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleApplyFilters();
                  }}
                  placeholder="Search value..."
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 pl-11 pr-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-500 border-none text-sm"
                />
              </div>

              {/* Remove filter button */}
              <button
                onClick={() => removeFilter(i)}
                className="p-3 rounded-full bg-[#FFFFFF] border border-slate-200 text-slate-500 hover:text-rose-500 transition-colors self-center shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          <motion.button
            onClick={handleApplyFilters}
            className="px-6 py-2.5 rounded-full text-white font-bold text-xs normal-case tracking-normal  transition-all"
            style={{
              backgroundColor: activeTableConfig.accent,
              boxShadow: `0 10px 15px -3px ${activeTableConfig.accent}40`,
            }}
          >
            Run Query
          </motion.button>
          <button
            onClick={handleClearFilters}
            className="px-6 py-2.5 rounded-full bg-[#FFFFFF] text-slate-500 font-bold text-xs normal-case tracking-normal border border-slate-200 transition-all"
          >
            Clear
          </button>
          <button
            onClick={addFilterRow}
            className="px-6 py-2.5 rounded-full bg-[#FFFFFF] text-slate-500 font-bold text-xs normal-case tracking-normal border border-slate-200 transition-all"
          >
            + Add Filter
          </button>

          {appliedFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {appliedFilters.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold normal-case tracking-normal"
                  style={{
                    backgroundColor: `${activeTableConfig.accent}15`,
                    color: activeTableConfig.accent,
                  }}
                >
                  {f.column}: &quot;{f.value}&quot;
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* --- Data Table --- */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[#FFFFFF] rounded-lg border border-slate-200 overflow-hidden"
      >
        {/* Table Header Bar */}
        <div className="flex items-center justify-between p-6 md:px-8 border-b border-slate-200/50">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Table2 size={18} style={{ color: activeTableConfig.accent }} />
            {activeTableConfig.label}
            <span className="text-sm font-medium text-slate-500 ml-2">
              {loading ? "..." : `${totalCount} rows`}
            </span>
          </h3>

          {/* Pagination */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0 || loading}
              className="p-2 rounded-full bg-[#FFFFFF] border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-slate-500 px-2 min-w-[60px] text-center">
              {totalPages === 0 ? "0 / 0" : `${page + 1} / ${totalPages}`}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="p-2 rounded-full bg-[#FFFFFF] border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <RefreshCw size={24} className="text-slate-500" />
              </motion.div>
              <span className="ml-3 text-slate-500 font-medium">Loading table data...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20">
              <div
                className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 border border-slate-200"
                style={{ backgroundColor: `${activeTableConfig.accent}10`, color: activeTableConfig.accent }}
              >
                <Database size={28} />
              </div>
              <h4 className="text-lg font-bold text-slate-700">No Records Found</h4>
              <p className="text-sm text-slate-500 mt-1">
                {appliedFilters.length > 0
                  ? "Try adjusting your filters."
                  : "This table appears to be empty."}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/50">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="text-left px-5 py-4 text-xs font-semibold normal-case tracking-normal text-slate-500 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="text-center px-5 py-4 text-xs font-semibold normal-case tracking-normal text-slate-500 whitespace-nowrap sticky right-0 bg-[#FFFFFF]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={`border-b border-slate-100/50 transition-colors ${
                      editingRow === rowIdx
                        ? "bg-[#17685E]/[0.03]"
                        : "hover:bg-white/30"
                    }`}
                  >
                    {columns.map((col) => (
                      <td key={col} className="px-5 py-3.5 whitespace-nowrap">
                        {editingRow === rowIdx ? (
                          col === getPrimaryKey(activeTable) ? (
                            <span className="text-slate-500 font-medium text-xs">
                              {formatCell(row[col])}
                            </span>
                          ) : (
                            <input
                              type="text"
                              value={editBuffer[col] ?? ""}
                              onChange={(e) => handleEditChange(col, e.target.value)}
                              className="w-full min-w-[100px] bg-[#FFFFFF] border border-slate-200 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-700 border-none text-xs font-medium"
                            />
                          )
                        ) : (
                          <span
                            className="text-slate-600 font-medium text-xs"
                            title={String(row[col] ?? "")}
                          >
                            {formatCell(row[col])}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-5 py-3.5 text-center sticky right-0 bg-[#FFFFFF]">
                      {editingRow === rowIdx ? (
                        <div className="flex items-center justify-center gap-2">
                          <motion.button
                            onClick={saveEdit}
                            disabled={saving}
                            className="p-2 rounded-full bg-emerald-500 text-white    transition-all disabled:opacity-60"
                            title="Save changes"
                          >
                            <Save size={14} />
                          </motion.button>
                          <motion.button
                            onClick={cancelEdit}
                            className="p-2 rounded-full bg-[#FFFFFF] border border-slate-200 text-slate-500 hover:text-rose-500 transition-colors"
                            title="Cancel"
                          >
                            <X size={14} />
                          </motion.button>
                        </div>
                      ) : (
                        <motion.button
                          onClick={() => startEdit(rowIdx)}
                          className="p-2 rounded-full bg-[#FFFFFF] border border-slate-200 text-slate-500 hover:text-[#17685E] transition-colors mx-auto"
                          title="Edit row"
                        >
                          <Edit3 size={14} />
                        </motion.button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Bottom Pagination Bar */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between px-6 md:px-8 py-4 border-t border-slate-200/50">
            <span className="text-xs text-slate-500 font-medium">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of{" "}
              {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-full bg-[#FFFFFF] text-xs font-bold text-slate-500 border border-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 rounded-full text-xs font-bold text-white  transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: activeTableConfig.accent,
                  boxShadow: `0 10px 15px -3px ${activeTableConfig.accent}40`,
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
