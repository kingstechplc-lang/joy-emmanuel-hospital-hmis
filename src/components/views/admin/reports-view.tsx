"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  FileText, Activity, FlaskConical, Pill, DollarSign, Bed,
  Calendar, Users, Boxes, ScrollText, Scissors, Skull, ShieldCheck,
  Download, RefreshCcw, BarChart3, TrendingUp, Clock, AlertCircle,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, formatDate, safeJson,
  PageHeader, MiniStatCard,
} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res);
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

// =====================================================================
// REPORT TYPE DEFINITIONS
// =====================================================================
const REPORT_TYPES = [
  { type: "patients", label: "Patient Reports", icon: FileText, gradient: "from-emerald-500 to-teal-600", desc: "Demographics, new vs returning, age distribution" },
  { type: "clinical", label: "Clinical Reports", icon: Activity, gradient: "from-blue-500 to-blue-600", desc: "Encounters, admissions, diagnoses, procedures" },
  { type: "diagnoses", label: "Diagnosis Reports", icon: Stethoscope, gradient: "from-indigo-500 to-purple-600", desc: "Top diagnoses, trends, by department/specialty/facility, NHIS claimability" },
  { type: "appointments", label: "Appointment Reports", icon: Calendar, gradient: "from-cyan-500 to-cyan-600", desc: "Booked, completed, cancelled, no-shows" },
  { type: "lab", label: "Laboratory Reports", icon: FlaskConical, gradient: "from-purple-500 to-purple-600", desc: "Tests ordered, pending, critical results" },
  { type: "pharmacy", label: "Pharmacy Reports", icon: Pill, gradient: "from-amber-500 to-orange-600", desc: "Prescriptions, dispensing, low stock" },
  { type: "financial", label: "Financial Reports", icon: DollarSign, gradient: "from-rose-500 to-red-600", desc: "Revenue, payments, outstanding, claims" },
  { type: "insurance", label: "Insurance / NHIS", icon: ShieldCheck, gradient: "from-indigo-500 to-blue-600", desc: "Claims submitted, approved, rejected, paid" },
  { type: "operational", label: "Operational Reports", icon: Bed, gradient: "from-violet-500 to-purple-600", desc: "Bed occupancy, staff activity, encounters" },
  { type: "hr", label: "HR / Staff Reports", icon: Users, gradient: "from-slate-600 to-slate-800", desc: "Staff headcount, roles, employment types" },
  { type: "inventory", label: "Inventory Reports", icon: Boxes, gradient: "from-teal-500 to-teal-600", desc: "Stock levels, low stock, out of stock" },
  { type: "theatre", label: "Theatre Reports", icon: Scissors, gradient: "from-blue-500 to-indigo-600", desc: "Surgical cases, procedures, utilization" },
  { type: "mortuary", label: "Mortuary Reports", icon: Skull, gradient: "from-slate-600 to-slate-800", desc: "Admissions, releases, place of death" },
  { type: "audit", label: "Audit Reports", icon: ScrollText, gradient: "from-slate-500 to-slate-700", desc: "System events, user activity, security" },
] as const;

// Quick date ranges
const QUICK_RANGES = [
  { label: "Today", getRange: () => { const d = new Date(); return { from: d.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }; } },
  { label: "Last 7 Days", getRange: () => { const d = new Date(); const d2 = new Date(d); d2.setDate(d2.getDate() - 7); return { from: d2.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }; } },
  { label: "Last 30 Days", getRange: () => { const d = new Date(); const d2 = new Date(d); d2.setDate(d2.getDate() - 30); return { from: d2.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }; } },
  { label: "This Month", getRange: () => { const d = new Date(); const d2 = new Date(d.getFullYear(), d.getMonth(), 1); return { from: d2.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }; } },
  { label: "This Quarter", getRange: () => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); const d2 = new Date(d.getFullYear(), q * 3, 1); return { from: d2.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }; } },
  { label: "This Year", getRange: () => { const d = new Date(); const d2 = new Date(d.getFullYear(), 0, 1); return { from: d2.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }; } },
];

const CHART_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];

// =====================================================================
// MAIN REPORTS VIEW
// =====================================================================
export function ReportsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [facilityId, setFacilityId] = useState(activeFacilityId || "");
  const [generatedReport, setGeneratedReport] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Fetch facilities
  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesData?.facilities || [];

  // Generate report
  const generate = async () => {
    if (!selectedType) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (facilityId && facilityId !== "__none__") params.set("facilityId", facilityId);
      const data = await fetchJson(`/api/reports/${selectedType}?${params.toString()}`);
      setGeneratedReport(data);
      toast.success("Report generated successfully");
    } catch (e: any) {
      setGenerateError(e.message || "Failed to generate report");
      toast.error(e.message || "Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  // CSV export — full report (stats + table + detail sections)
  const exportCSV = () => {
    if (!generatedReport) return;
    const lines: string[] = [];
    const reportType = REPORT_TYPES.find((r) => r.type === generatedReport.type);
    const facName = facilities.find((f: any) => f.id === facilityId)?.name || "All Facilities";

    // Header
    lines.push(`Joy Emmanuel Hospital HMIS`);
    lines.push(`Report: ${reportType?.label || generatedReport.type}`);
    lines.push(`Facility: ${facName}`);
    lines.push(`Date Range: ${dateFrom || "All"} to ${dateTo || "All"}`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push("");

    // Stats
    lines.push("=== SUMMARY STATISTICS ===");
    if (generatedReport.stats) {
      for (const [key, value] of Object.entries(generatedReport.stats)) {
        lines.push(`"${key}","${value}"`);
      }
    }
    lines.push("");

    // Table data
    if (generatedReport.tableRows?.length > 0) {
      lines.push("=== BREAKDOWN TABLE ===");
      lines.push(generatedReport.tableColumns.map((c: string) => `"${c}"`).join(","));
      generatedReport.tableRows.forEach((row: any[]) => {
        lines.push(row.map((c) => `"${String(c)}"`).join(","));
      });
      lines.push("");
    }

    // Detail sections (lowStock, expiringSoon, etc.)
    if (generatedReport.lowStock?.length > 0) {
      lines.push("=== LOW STOCK ITEMS ===");
      lines.push('"Item Name","SKU","Current Qty","Min Qty"');
      generatedReport.lowStock.forEach((item: any) => {
        lines.push(`"${item.itemName}","${item.sku}","${item.currentQty}","${item.minQty}"`);
      });
      lines.push("");
    }
    if (generatedReport.expiringSoon?.length > 0) {
      lines.push("=== EXPIRING SOON ===");
      lines.push('"Item Name","Batch","Expiry","Quantity","Facility"');
      generatedReport.expiringSoon.forEach((item: any) => {
        lines.push(`"${item.itemName}","${item.batchNumber}","${formatDate(item.expiryDate)}","${item.quantity}","${item.facility}"`);
      });
      lines.push("");
    }
    if (generatedReport.recentLogs?.length > 0) {
      lines.push("=== RECENT AUDIT LOGS ===");
      lines.push('"Action","User","Resource Type","Time"');
      generatedReport.recentLogs.forEach((log: any) => {
        lines.push(`"${log.action}","${log.user}","${log.resourceType}","${formatDate(log.time, true)}"`);
      });
      lines.push("");
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${generatedReport.type}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Report exported to CSV");
  };

  // Print report — uses centralized print system instead of raw window.print()
  const printReport = () => {
    if (!generatedReport) return;
    const reportType = REPORT_TYPES.find((r) => r.type === generatedReport.type);
    const printWindow = window.open("", "_blank", "width=900,height=1100");
    if (!printWindow) {
      alert("Please allow popups to print this report.");
      return;
    }
    const title = reportType?.label || generatedReport.type || "Report";
    const now = new Date().toLocaleString("en-GB");
    const reportJson = JSON.stringify(generatedReport, null, 2);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title} — Joy Emmanuel Hospital HMIS</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; padding: 0; font-size: 14px; line-height: 1.4; }
          @page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
          @media print { body { padding: 0; } .no-print { display: none !important; } }
          .doc-header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #059669; margin-bottom: 16px; }
          .doc-header h1 { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
          .doc-header .meta { font-size: 11px; color: #64748b; margin-top: 4px; }
          .doc-header .doc-num { display: inline-block; margin-top: 6px; padding: 2px 12px; background: #f1f5f9; border-radius: 4px; font-size: 11px; font-family: monospace; color: #475569; }
          h2 { font-size: 13px; font-weight: 600; color: #334155; margin-top: 12px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
          pre { font-family: monospace; font-size: 10.5px; white-space: pre-wrap; word-break: break-word; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
          .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="doc-header">
          <h1>${title}</h1>
          <div class="meta">Generated by Joy Emmanuel Hospital HMIS on ${now}</div>
          <div class="doc-num">${generatedReport.type || "report"} — ${new Date().toISOString().slice(0, 10)}</div>
        </div>
        <h2>Report Data</h2>
        <pre>${(reportJson || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        <div class="footer">
          Confidential — Joy Emmanuel Hospital HMIS<br/>
          Printed ${now}
        </div>
        <div class="no-print" style="position:fixed;bottom:20px;left:0;right:0;text-align:center;padding:12px;background:white;border-top:1px solid #e2e8f0;">
          <button onclick="window.print()" style="background:#059669;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;margin-right:8px;">Print Document</button>
          <button onclick="window.close()" style="background:#64748b;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;">Close</button>
        </div>
        <script>window.onload = function() { setTimeout(function(){ window.print(); }, 300); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();

    // Best-effort audit log
    fetch("/api/print-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentType: "report",
        paperSize: "A4",
        orientation: "portrait",
        recordId: generatedReport.type || null,
        recordSummary: `${title} — ${new Date().toISOString().slice(0, 10)}`,
      }),
    }).catch(() => {});
  };

  const selectedReportType = REPORT_TYPES.find((r) => r.type === selectedType);

  return (
    <div className="space-y-6 fade-in-up">
      {/* Header */}
      <PageHeader
        title="Reports & Analytics"
        description="Hospital-wide reporting and management intelligence center"
        icon={BarChart3}
        gradient="from-rose-500 to-red-600"
        actions={
          generatedReport && (
            <>
              <Button size="sm" onClick={exportCSV} className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
                <Download className="w-4 h-4 mr-1" /> Export CSV
              </Button>
              <Button size="sm" onClick={printReport} className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
                <FileText className="w-4 h-4 mr-1" /> Print
              </Button>
            </>
          )
        }
      />

      {/* Report Type Selection — colorful cards */}
      {!selectedType && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_TYPES.map((rt) => {
            const Icon = rt.icon;
            return (
              <Card
                key={rt.type}
                onClick={() => setSelectedType(rt.type)}
                className="group cursor-pointer overflow-hidden border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 rounded-xl"
              >
                <div className={`relative h-24 bg-gradient-to-br ${rt.gradient} flex items-center px-4`}>
                  <Icon className="w-10 h-10 text-white/90" />
                  <div className="absolute top-2 right-2 text-white/20">
                    <Icon className="w-12 h-12" strokeWidth={1} />
                  </div>
                  <div className="absolute bottom-2 left-4">
                    <h3 className="text-white font-bold text-base">{rt.label}</h3>
                  </div>
                </div>
                <CardContent className="p-3">
                  <p className="text-xs text-slate-600 leading-relaxed">{rt.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Report Builder — filters + generate */}
      {selectedType && (
        <>
          {/* Back button + selected report header */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => { setSelectedType(null); setGeneratedReport(null); }}>
              ← Back to Reports
            </Button>
            <h3 className="text-lg font-bold text-slate-900">{selectedReportType?.label}</h3>
          </div>

          {/* Filters */}
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4 space-y-3">
              {/* Quick date ranges */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider self-center mr-1">Quick Range:</span>
                {QUICK_RANGES.map((qr) => (
                  <Button
                    key={qr.label}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700"
                    onClick={() => {
                      const { from, to } = qr.getRange();
                      setDateFrom(from);
                      setDateTo(to);
                    }}
                  >
                    {qr.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                >
                  Clear Dates
                </Button>
              </div>

              {/* Date inputs + facility + generate */}
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">From Date</label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">To Date</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Facility</label>
                  <Select value={facilityId || "__none__"} onValueChange={setFacilityId}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">All Facilities</SelectItem>
                      {facilities.map((f: any) => (
                        <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={generate}
                  disabled={isGenerating}
                  className="bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white shadow-md"
                >
                  {isGenerating ? <RefreshCcw className="w-4 h-4 mr-1 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-1" />}
                  {isGenerating ? "Generating..." : "Generate Report"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Generated Report Display */}
          {generateError && (
            <ErrorState message={generateError} onRetry={generate} />
          )}

          {isGenerating && (
            <Card><CardContent className="py-12"><LoadingState rows={4} /></CardContent></Card>
          )}

          {generatedReport && !isGenerating && (
            <GeneratedReportDisplay report={generatedReport} />
          )}

          {!generatedReport && !isGenerating && !generateError && (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  title="No report generated yet"
                  description="Select a date range and facility, then click Generate Report to see the data."
                  icon={BarChart3}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// =====================================================================
// GENERATED REPORT DISPLAY — stat cards + charts + tables
// =====================================================================
function GeneratedReportDisplay({ report }: { report: any }) {
  const stats = report.stats || {};
  const statEntries = Object.entries(stats).filter(([, v]) => typeof v === "number" || typeof v === "string");

  // Determine chart data
  const chartData = report.byStatus || report.byType || report.bySex || report.byAgeGroup || report.byPriority || report.byBedStatus || report.byRole || report.byAction || report.byPlaceOfDeath || report.byEmploymentType || report.byFacility || [];

  // Determine top items for horizontal bar chart
  const topItems = report.topDiagnoses || report.topTests || report.topMedications || [];

  return (
    <div className="space-y-4">
      {/* Summary KPI Cards — colorful gradients */}
      {statEntries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {statEntries.slice(0, 12).map(([key, value], i) => {
            const gradients = [
              "from-blue-500 to-blue-600",
              "from-emerald-500 to-emerald-600",
              "from-rose-500 to-red-600",
              "from-amber-500 to-orange-600",
              "from-purple-500 to-purple-600",
              "from-cyan-500 to-cyan-600",
              "from-indigo-500 to-indigo-600",
              "from-teal-500 to-teal-600",
              "from-pink-500 to-rose-600",
              "from-violet-500 to-violet-600",
              "from-slate-600 to-slate-800",
              "from-orange-500 to-red-600",
            ];
            const gradient = gradients[i % gradients.length];
            const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
            const displayValue = key.toLowerCase().includes("rate") || key.toLowerCase().includes("occupancy")
              ? `${value}%`
              : key.toLowerCase().includes("revenue") || key.toLowerCase().includes("amount") || key.toLowerCase().includes("paid") || key.toLowerCase().includes("outstanding") || key.toLowerCase().includes("discount") || key.toLowerCase().includes("claim")
                ? `₵${Number(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : String(value);
            return (
              <MiniStatCard
                key={key}
                label={label}
                value={displayValue}
                gradient={gradient}
              />
            );
          })}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Main breakdown chart */}
        {chartData.length > 0 && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-4 rounded-full bg-gradient-to-b from-rose-500 to-red-600" />
                Breakdown Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "12px",
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Top items horizontal bar chart */}
        {topItems.length > 0 && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-4 rounded-full bg-gradient-to-b from-blue-500 to-blue-600" />
                Top 10 Items
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topItems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} width={120} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {topItems.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Pie chart for status distribution */}
        {chartData.length > 0 && chartData.length <= 8 && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-4 rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600" />
                Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={45}
                    label={(entry: any) => `${entry.label}: ${entry.value}`}
                    labelLine={false}
                  >
                    {chartData.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Staff activity or active encounters */}
        {report.staffActivity?.length > 0 && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-4 rounded-full bg-gradient-to-b from-violet-500 to-purple-600" />
                Staff by Role
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={report.staffActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Breakdown Table */}
      {report.tableRows?.length > 0 && (
        <Card className="shadow-sm border-slate-200 overflow-hidden">
          <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-2 h-4 rounded-full bg-gradient-to-b from-rose-500 to-red-600" />
              Detailed Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
                    {report.tableColumns.map((col: string, i: number) => (
                      <th key={i} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.tableRows.map((row: any[], i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      {row.map((cell, j) => (
                        <td key={j} className="px-4 py-2.5 text-sm text-slate-700">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diagnoses-specific: by Category, Department, Specialty + Trend */}
      {report.type === "diagnoses" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.byCategory?.length > 0 && (
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-2 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200">
                  <CardTitle className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                    <span className="w-2 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-purple-600" />
                    Diagnoses by Category
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={report.byCategory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {report.byCategory.map((_: any, i: number) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {report.byDepartment?.length > 0 && (
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-2 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-200">
                  <CardTitle className="text-sm font-bold text-blue-800 flex items-center gap-2">
                    <span className="w-2 h-4 rounded-full bg-gradient-to-b from-blue-500 to-cyan-600" />
                    Diagnoses by Department
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={report.byDepartment} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} width={120} />
                      <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {report.bySpecialty?.length > 0 && (
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-2 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-200">
                  <CardTitle className="text-sm font-bold text-purple-800 flex items-center gap-2">
                    <span className="w-2 h-4 rounded-full bg-gradient-to-b from-purple-500 to-pink-600" />
                    Diagnoses by Specialty
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={report.bySpecialty}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {report.trend?.length > 0 && (
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-2 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200">
                  <CardTitle className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                    <span className="w-2 h-4 rounded-full bg-gradient-to-b from-emerald-500 to-teal-600" />
                    Diagnosis Trend (Monthly)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={report.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                      <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: "#10b981" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* NHIS Claimability + Demographics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {report.stats?.nhisClaimable != null && (
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-2 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-200">
                  <CardTitle className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    NHIS Claimability
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { label: "Claimable", value: report.stats.nhisClaimable },
                          { label: "Not Claimable", value: report.stats.nhisNotClaimable },
                        ]}
                        dataKey="value"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        innerRadius={35}
                        label={(entry: any) => `${entry.label}: ${entry.value}`}
                        labelLine={false}
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {report.bySex?.length > 0 && (
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-2 bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-200">
                  <CardTitle className="text-sm font-bold text-rose-800 flex items-center gap-2">
                    <span className="w-2 h-4 rounded-full bg-gradient-to-b from-rose-500 to-pink-600" />
                    By Sex
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={report.bySex}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {report.bySex.map((_: any, i: number) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {report.byAgeGroup?.length > 0 && (
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-2 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
                  <CardTitle className="text-sm font-bold text-amber-800 flex items-center gap-2">
                    <span className="w-2 h-4 rounded-full bg-gradient-to-b from-amber-500 to-orange-600" />
                    By Age Group
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={report.byAgeGroup}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Low Stock Items */}
      {report.lowStock?.length > 0 && (
        <Card className="shadow-sm border-slate-200 overflow-hidden">
          <CardHeader className="pb-2 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
            <CardTitle className="text-sm font-bold text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Low Stock Items ({report.lowStock.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-amber-600 to-orange-600 text-white">
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Item</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">SKU</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Current Qty</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Min Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.lowStock.slice(0, 20).map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-amber-50/50 transition-colors">
                      <td className="px-4 py-2 text-sm font-medium text-slate-900">{item.itemName}</td>
                      <td className="px-4 py-2 text-xs text-slate-500 font-mono">{item.sku || "—"}</td>
                      <td className="px-4 py-2 text-sm text-rose-600 font-bold">{item.currentQty}</td>
                      <td className="px-4 py-2 text-sm text-slate-500">{item.minQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expiring Soon */}
      {report.expiringSoon?.length > 0 && (
        <Card className="shadow-sm border-slate-200 overflow-hidden">
          <CardHeader className="pb-2 bg-gradient-to-r from-rose-50 to-red-50 border-b border-rose-200">
            <CardTitle className="text-sm font-bold text-rose-800 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Expiring Soon (90 days) — {report.expiringSoon.length} items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-rose-600 to-red-600 text-white">
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Item</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Batch</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Expiry</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Qty</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Facility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.expiringSoon.slice(0, 20).map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-rose-50/50 transition-colors">
                      <td className="px-4 py-2 text-sm font-medium text-slate-900">{item.itemName}</td>
                      <td className="px-4 py-2 text-xs text-slate-500 font-mono">{item.batchNumber}</td>
                      <td className="px-4 py-2 text-sm text-rose-600 font-semibold">{formatDate(item.expiryDate)}</td>
                      <td className="px-4 py-2 text-sm text-slate-700">{item.quantity}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{item.facility}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Audit Logs */}
      {report.recentLogs?.length > 0 && (
        <Card className="shadow-sm border-slate-200 overflow-hidden">
          <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ScrollText className="w-4 h-4" />
              Recent Audit Events ({report.recentLogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Action</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">User</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Resource</th>
                    <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.recentLogs.map((log: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 text-sm font-semibold text-slate-900">{log.action}</td>
                      <td className="px-4 py-2 text-sm text-slate-700">{log.user}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{log.resourceType}</td>
                      <td className="px-4 py-2 text-xs text-slate-400">{formatDate(log.time, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
