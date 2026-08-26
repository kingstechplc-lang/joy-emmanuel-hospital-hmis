"use client";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";

// =====================================================================
// DATATABLE — beautiful gradient-header table with pagination + sorting
// =====================================================================
// Usage:
// <DataTable
//   headers={["Name", "Status", "Date"]}
//   rows={[
//     { cells: ["John", "Active", "2026-01-01"], sortValues: ["John", "Active", "2026-01-01"] }
//   ]}
//   gradient="from-slate-700 to-slate-800"
//   pageSize={10}
// />
// =====================================================================

type Row = {
  cells: React.ReactNode[];
  sortValues?: (string | number)[];
  onClick?: () => void;
  rowClassName?: string;
};

export function DataTable({
  headers,
  rows,
  gradient = "from-slate-700 to-slate-800",
  pageSize = 10,
  sortable = true,
  emptyMessage = "No records found",
}: {
  headers: string[];
  rows: Row[];
  gradient?: string;
  pageSize?: number;
  sortable?: boolean;
  emptyMessage?: string;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Sorting
  const sortedRows = useMemo(() => {
    if (sortCol === null || !sortable) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a.sortValues?.[sortCol] ?? String(a.cells[sortCol] ?? "");
      const bVal = b.sortValues?.[sortCol] ?? String(b.cells[sortCol] ?? "");
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [rows, sortCol, sortDir, sortable]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedRows = sortedRows.slice(startIndex, startIndex + pageSize);

  // Reset to page 1 if data changes significantly
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }

  const handleSort = (col: number) => {
    if (!sortable) return;
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">{emptyMessage}</div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm" style={{ WebkitOverflowScrolling: "touch" }}>
        <table className="w-full" style={{ minWidth: "600px" }}>
          <thead>
            <tr className={`bg-gradient-to-r ${gradient} text-white`}>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`text-left px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${sortable ? "cursor-pointer hover:bg-white/10 select-none" : ""}`}
                  onClick={() => handleSort(i)}
                >
                  <span className="inline-flex items-center gap-1">
                    {h}
                    {sortable && sortCol === i && (
                      sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                    {sortable && sortCol !== i && (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedRows.map((row, i) => (
              <tr
                key={i}
                className={`hover:bg-slate-50 transition-colors ${row.onClick ? "cursor-pointer" : ""} ${row.rowClassName || ""}`}
                onClick={row.onClick}
              >
                {row.cells.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-sm text-slate-700">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-500">
            Showing <span className="font-semibold text-slate-700">{startIndex + 1}</span>–
            <span className="font-semibold text-slate-700">{Math.min(startIndex + pageSize, sortedRows.length)}</span> of{" "}
            <span className="font-semibold text-slate-700">{sortedRows.length}</span> records
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(1)}
              disabled={safePage === 1}
            >
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {getPageNumbers(safePage, totalPages).map((p, i) => (
              p === "..." ? (
                <span key={i} className="px-2 text-slate-400">…</span>
              ) : (
                <Button
                  key={i}
                  variant={p === safePage ? "default" : "outline"}
                  size="sm"
                  className={`h-8 w-8 p-0 ${p === safePage ? "bg-gradient-to-r from-rose-500 to-red-600 text-white border-0" : ""}`}
                  onClick={() => setCurrentPage(p as number)}
                >
                  {p}
                </Button>
              )
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(totalPages)}
              disabled={safePage === totalPages}
            >
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: get page numbers with ellipsis
function getPageNumbers(current: number, total: number): (number | string)[] {
  const pages: (number | string)[] = [];
  const maxVisible = 5;

  if (total <= maxVisible) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }

  pages.push(1);

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push("...");

  pages.push(total);
  return pages;
}
