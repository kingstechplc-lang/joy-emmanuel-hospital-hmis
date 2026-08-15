"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, RefreshCcw, FileText, Activity, FlaskConical, Pill, DollarSign, Bed } from "lucide-react";
import { toast } from "sonner";
import { LoadingState, ErrorState } from "@/components/ui-helpers";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

const REPORT_TYPES = [
  { value: "patients", label: "Patient Reports", icon: FileText, color: "emerald", description: "Patient demographics, new vs returning, age distribution" },
  { value: "clinical", label: "Clinical Reports", icon: Activity, color: "teal", description: "Encounters, admissions, discharges, diagnoses" },
  { value: "lab", label: "Lab Reports", icon: FlaskConical, color: "cyan", description: "Tests performed, pending, critical results" },
  { value: "pharmacy", label: "Pharmacy Reports", icon: Pill, color: "amber", description: "Dispensing, low stock, expiring medicines" },
  { value: "financial", label: "Financial Reports", icon: DollarSign, color: "emerald", description: "Revenue, payments, outstanding, insurance" },
  { value: "operational", label: "Operational Reports", icon: Bed, color: "violet", description: "Bed occupancy, waiting times, staff activity" },
];

const COLORS = ["#059669", "#0d9488", "#06b6d4", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981", "#6366f1"];

export function ReportsView() {
  const [reportType, setReportType] = useState("patients");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [generatedReport, setGeneratedReport] = useState<any | null>(null);

  const facilitiesQ = useQuery({
    queryKey: ["facilities-for-reports"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesQ.data?.facilities || [];

  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (facilityId) params.set("facilityId", facilityId);

  const { isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["report", reportType, dateFrom, dateTo, facilityId],
    queryFn: () => fetchJson(`/api/reports/${reportType}?${params.toString()}`),
    enabled: false, // Manual trigger
  });

  const generate = async () => {
    try {
      const data = await fetchJson(`/api/reports/${reportType}?${params.toString()}`);
      setGeneratedReport(data);
      toast.success("Report generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate report");
    }
  };

  const exportCsv = () => {
    if (!generatedReport?.tableRows?.length) {
      toast.error("No tabular data to export");
      return;
    }
    const headers = generatedReport.tableColumns || [];
    const rows = generatedReport.tableRows || [];
    const csv = [headers, ...rows].map((r: any[]) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-emerald-600" />
          Reports
        </h2>
        <p className="text-sm text-slate-500">Generate operational, clinical, and financial reports across facilities</p>
      </div>

      {/* Report type selector */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {REPORT_TYPES.map((r) => {
          const Icon = r.icon;
          const isActive = reportType === r.value;
          return (
            <button
              key={r.value}
              onClick={() => { setReportType(r.value); setGeneratedReport(null); }}
              className={`text-left p-3 rounded-lg border transition-all ${
                isActive
                  ? "bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200"
                  : "bg-white border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/50"
              }`}
            >
              <Icon className={`w-5 h-5 mb-1.5 ${isActive ? "text-emerald-600" : "text-slate-500"}`} />
              <div className={`text-xs font-semibold ${isActive ? "text-emerald-700" : "text-slate-700"}`}>{r.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Date From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Date To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Facility</Label>
            <Select value={facilityId} onValueChange={setFacilityId}>
              <SelectTrigger><SelectValue placeholder="All facilities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Facilities</SelectItem>
                {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={generate} disabled={isLoading || isFetching} className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700">
              {(isLoading || isFetching) ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <div className="text-sm text-slate-600">
        {REPORT_TYPES.find((r) => r.value === reportType)?.description}
      </div>

      {/* Results */}
      {isError ? (
        <ErrorState message="Failed to generate report" onRetry={() => refetch()} />
      ) : !generatedReport ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-slate-500 text-sm">
              Select date range and facility, then click <span className="font-medium text-emerald-700">Generate</span> to produce a report.
            </div>
          </CardContent>
        </Card>
      ) : (
        <ReportResults report={generatedReport} reportType={reportType} onExportCsv={exportCsv} />
      )}
    </div>
  );
}

function ReportResults({ report, reportType, onExportCsv }: { report: any; reportType: string; onExportCsv: () => void }) {
  const stats = report.stats || {};
  const chartData = report.byStatus || report.byType || report.bySex || report.byAgeGroup || report.byPriority || report.activeEncounters || report.staffActivity || [];

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(stats).filter(([k, v]) => typeof v === "number" && !["occupancyRate"].includes(k)).slice(0, 8).map(([key, value]: [string, any]) => (
          <Card key={key}>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500 capitalize">{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{typeof value === "number" ? value.toLocaleString() : value}</div>
            </CardContent>
          </Card>
        ))}
        {stats.occupancyRate !== undefined && (
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">Occupancy Rate</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{stats.occupancyRate}%</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts */}
      {chartData && chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                {reportType === "patients" || reportType === "operational" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(e: any) => `${e.label}: ${e.value}`}
                      labelLine={false}
                    >
                      {chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Additional sections for pharmacy report */}
      {reportType === "pharmacy" && (
        <>
          {report.lowStock && report.lowStock.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Low Stock Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Item</th>
                        <th className="text-left p-3 font-semibold text-slate-700">SKU</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Current Qty</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Min Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.lowStock.map((l: any, i: number) => (
                        <tr key={i} className="border-b">
                          <td className="p-3 text-slate-900">{l.itemName}</td>
                          <td className="p-3 text-xs text-slate-500">{l.sku}</td>
                          <td className="p-3 text-right text-rose-600 font-medium">{l.currentQty}</td>
                          <td className="p-3 text-right text-slate-500">{l.minQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {report.expiringSoon && report.expiringSoon.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Expiring Medicines (90 days)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Item</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Facility</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Batch</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Expiry</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.expiringSoon.map((b: any, i: number) => (
                        <tr key={i} className="border-b">
                          <td className="p-3 text-slate-900">{b.itemName}</td>
                          <td className="p-3 text-slate-700">{b.facility}</td>
                          <td className="p-3 text-xs text-slate-500">{b.batchNumber}</td>
                          <td className="p-3 text-amber-700">{new Date(b.expiryDate).toLocaleDateString("en-GB")}</td>
                          <td className="p-3 text-right">{b.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Table view */}
      {report.tableRows && report.tableRows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Breakdown Table</CardTitle>
              <Button onClick={onExportCsv} variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    {(report.tableColumns || []).map((c: string, i: number) => (
                      <th key={i} className="text-left p-3 font-semibold text-slate-700">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.tableRows.map((row: any[], i: number) => (
                    <tr key={i} className="border-b hover:bg-slate-50">
                      {row.map((c, j) => (
                        <td key={j} className={`p-3 ${j === 0 ? "text-slate-900 font-medium" : "text-slate-700"}`}>{c}</td>
                      ))}
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
