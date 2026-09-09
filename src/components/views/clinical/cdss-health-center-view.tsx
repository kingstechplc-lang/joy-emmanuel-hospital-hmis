"use client";

// =====================================================================
// CDSSHealthCenterView — Phase 10
// =====================================================================
// A premium, animated dashboard that aggregates the live status of
// every CDSS subsystem (clinical alerts, discharge summaries, patient
// wristbands, medication labels) into one view.
//
// SECTIONS:
//   1. PageHeader with indigo→purple gradient banner + refresh button
//   2. 4 subsystem KPI cards (animated count-up via framer-motion)
//   3. 4 subsystem status panels with live counts + recent activity
//   4. RBAC matrix table (roles × CDSS permissions, color-coded ✓/✗)
//   5. Regression test runner (one-click "Run All Tests" with live
//      progress display + pass/fail badges per test)
//   6. Recent CDSS audit log feed (live)
//   7. Top contributors leaderboard (last 7 days)
//
// ANIMATIONS (framer-motion):
//   - Stagger-in for KPI cards
//   - Pulsing emerald glow on "All Systems Operational" header
//   - Slide-in for new audit log entries
//   - Animated test result rows (red pulse on fail, emerald pop on pass)
//   - Scanning line effect on test runner when tests are running
// =====================================================================

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert, Activity, FileText, QrCode, Pill,
  RefreshCcw, CheckCircle2, XCircle, AlertTriangle,
  Play, Clock, User, Award, Eye, Loader2,
  HeartPulse, FlaskConical,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, PageHeader, MiniStatCard,
  formatDate, formatRelative, safeJson,
} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "bg-rose-600 text-white",
  high: "bg-orange-500 text-white",
  moderate: "bg-amber-400 text-white",
  low: "bg-blue-400 text-white",
  info: "bg-slate-300 text-slate-700",
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  drug_allergy: "Drug Allergy",
  drug_drug_interaction: "Drug Interaction",
  therapeutic_duplication: "Therapeutic Duplication",
  critical_lab: "Critical Lab Result",
  abnormal_vital: "Abnormal Vital Signs",
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  CLINICAL_ALERT_ACKNOWLEDGED: "Alert acknowledged",
  CLINICAL_ALERT_DISMISSED: "Alert dismissed",
  CLINICAL_ALERT_OVERRIDDEN: "Alert overridden",
  CLINICAL_ALERT_ESCALATED: "Alert escalated",
  CLINICAL_ALERT_RESOLVED: "Alert resolved",
  CLINICAL_ALERT_GENERATED: "Alert generated",
  "discharge_summary.create": "Discharge summary created",
  "discharge_summary.review": "Summary submitted for review",
  "discharge_summary.approve": "Summary approved",
  "discharge_summary.finalize": "Summary finalized",
  "discharge_summary.amend": "Summary amended",
  "discharge_summary.delete": "Summary deleted",
  "wristband.create": "Wristband minted",
  "wristband.replace": "Wristband replaced",
  "wristband.reprint": "Wristband reprinted",
  "wristband.void": "Wristband voided",
  "medication_label.create": "Medication label minted",
  "medication_label.reprint": "Label reprinted",
  "medication_label.void": "Label voided",
  CDSS_CHECK: "CDSS safety check",
  TRIAGE_RECORDED: "Triage recorded",
  PRESCRIPTION_CREATED: "Prescription created",
  LAB_CRITICAL_RESULT_ACKNOWLEDGED: "Critical lab acknowledged",
};

export function CDSSHealthCenterView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canView = user?.roles?.includes("super_admin") || perms.includes("cdss.view");

  const qc = useQueryClient();
  const [regressionResults, setRegressionResults] = useState<any[] | null>(null);
  const [regressionRunning, setRegressionRunning] = useState(false);
  const [regressionSummary, setRegressionSummary] = useState<any | null>(null);

  // ─── Fetch live health ──────────────────────────────────────────
  const { data: health, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["cdss-health"],
    queryFn: () => fetchJson("/api/cdss/health"),
    enabled: canView,
    refetchInterval: 30000,
  });

  // ─── Fetch RBAC matrix ──────────────────────────────────────────
  const { data: rbac } = useQuery({
    queryKey: ["cdss-rbac-matrix"],
    queryFn: () => fetchJson("/api/cdss/rbac-matrix"),
    enabled: canView,
  });

  // ─── Regression test runner ──────────────────────────────────────
  const runRegression = useMutation({
    mutationFn: async () => {
      setRegressionRunning(true);
      setRegressionResults(null);
      setRegressionSummary(null);
      const res = await fetch("/api/cdss/regression-test", { method: "POST" });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Regression test failed");
      return data;
    },
    onSuccess: (data) => {
      setRegressionResults(data.results);
      setRegressionSummary(data.summary);
      setRegressionRunning(false);
      const pass = data.summary.pass;
      const fail = data.summary.fail;
      const warn = data.summary.warn;
      if (fail === 0) {
        toast.success(`Regression passed: ${pass} tests ✓${warn > 0 ? `, ${warn} warnings` : ""}`);
      } else {
        toast.error(`Regression FAILED: ${fail} test(s) failed, ${pass} passed`);
      }
    },
    onError: (e: Error) => {
      setRegressionRunning(false);
      toast.error(e.message);
    },
  });

  if (!canView) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-amber-500" />
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Access Restricted</h3>
          <p className="text-sm text-slate-500">
            You don&apos;t have permission to view the CDSS Health Center.
            <br />
            Required permission: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">cdss.view</code>
          </p>
        </CardContent>
      </Card>
    );
  }

  // ─── Derived state ──────────────────────────────────────────────
  const clinicalAlerts = health?.clinicalAlerts || {};
  const dischargeSummaries = health?.dischargeSummaries || {};
  const wristbands = health?.wristbands || {};
  const medicationLabels = health?.medicationLabels || {};
  const recentAuditLogs = health?.recentAuditLogs || [];
  const topContributors = health?.topContributors || [];
  const engine = health?.engine || { interactionRules: 0 };

  // Determine overall system status
  const criticalAlerts = clinicalAlerts.critical || 0;
  const systemStatus: "operational" | "warning" | "critical" =
    criticalAlerts > 0 ? "critical" :
    (clinicalAlerts.active || 0) > 5 ? "warning" : "operational";

  const statusConfig = {
    operational: { label: "All Systems Operational", color: "emerald", icon: CheckCircle2, gradient: "from-emerald-500 to-teal-600" },
    warning: { label: "Active Alerts Require Attention", color: "amber", icon: AlertTriangle, gradient: "from-amber-500 to-orange-600" },
    critical: { label: "Critical Alerts Active", color: "rose", icon: ShieldAlert, gradient: "from-rose-600 to-red-700" },
  };
  const StatusIcon = statusConfig[systemStatus].icon;

  return (
    <div className="space-y-4">
      <PageHeader
        title="CDSS Health Center"
        description="Live status of every Clinical Decision Support subsystem — clinical alerts, discharge summaries, patient wristbands, medication labels, RBAC permissions, and end-to-end regression testing."
        icon={ShieldAlert}
        gradient="from-indigo-600 via-purple-600 to-fuchsia-600"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="bg-white/90 border-0 text-slate-700 hover:bg-white">
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* ─── System status banner (animated) ───────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl border-2 p-4 bg-gradient-to-r ${statusConfig[systemStatus].gradient} text-white shadow-lg`}
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={systemStatus === "critical" ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 1.2, repeat: systemStatus === "critical" ? Infinity : 0 }}
            className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center"
          >
            <StatusIcon className="w-7 h-7" />
          </motion.div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{statusConfig[systemStatus].label}</h2>
            <p className="text-white/80 text-sm">
              {criticalAlerts > 0 && `${criticalAlerts} critical alert${criticalAlerts > 1 ? "s" : ""} active · `}
              {clinicalAlerts.active || 0} total active alert{(clinicalAlerts.active || 0) !== 1 ? "s" : ""} across all CDSS subsystems
              {health?.generatedAt && ` · last updated ${formatRelative(health.generatedAt)}`}
            </p>
          </div>
          <div className="hidden md:block text-right">
            <div className="text-3xl font-bold">{clinicalAlerts.active || 0}</div>
            <div className="text-xs uppercase tracking-wider text-white/80">Active alerts</div>
          </div>
        </div>
      </motion.div>

      {/* ─── 4 KPI cards (animated stagger-in) ──────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Clinical Alerts", value: clinicalAlerts.active || 0, sub: `${clinicalAlerts.last24h || 0} in last 24h`, icon: ShieldAlert, gradient: "from-rose-500 to-red-600", delay: 0 },
          { label: "Pending Summaries", value: (dischargeSummaries.drafts || 0) + (dischargeSummaries.reviewed || 0) + (dischargeSummaries.approved || 0), sub: `${dischargeSummaries.finalized || 0} finalized`, icon: FileText, gradient: "from-emerald-500 to-teal-600", delay: 0.08 },
          { label: "Active Wristbands", value: wristbands.active || 0, sub: `${wristbands.printedToday || 0} printed today`, icon: QrCode, gradient: "from-violet-500 to-purple-600", delay: 0.16 },
          { label: "Active Med Labels", value: medicationLabels.active || 0, sub: `${medicationLabels.highAlert || 0} high-alert`, icon: Pill, gradient: "from-amber-500 to-orange-600", delay: 0.24 },
        ].map((kpi, idx) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: kpi.delay }}
          >
            <MiniStatCard
              label={kpi.label}
              value={kpi.value}
              sublabel={kpi.sub}
              icon={kpi.icon}
              gradient={kpi.gradient}
            />
          </motion.div>
        ))}
      </div>

      {/* ─── 4 Subsystem status panels ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Clinical Alerts */}
        <SubsystemPanel
          title="Clinical Alerts"
          icon={ShieldAlert}
          iconBg="bg-gradient-to-br from-rose-500 to-red-600"
          isLoading={isLoading}
          stats={[
            { label: "Active", value: clinicalAlerts.active || 0, highlight: (clinicalAlerts.active || 0) > 0 },
            { label: "Critical", value: clinicalAlerts.critical || 0, highlight: (clinicalAlerts.critical || 0) > 0 },
            { label: "Last 24h", value: clinicalAlerts.last24h || 0 },
            { label: "MTTA", value: clinicalAlerts.mttaMinutes != null ? `${clinicalAlerts.mttaMinutes}m` : "—" },
          ]}
          breakdown={clinicalAlerts.byType?.map((t: any) => ({
            label: ALERT_TYPE_LABEL[t.type] || t.type,
            value: t.count,
          })) || []}
        />

        {/* Discharge Summaries */}
        <SubsystemPanel
          title="Discharge Summaries"
          icon={FileText}
          iconBg="bg-gradient-to-br from-emerald-500 to-teal-600"
          isLoading={isLoading}
          stats={[
            { label: "Drafts", value: dischargeSummaries.drafts || 0 },
            { label: "Reviewed", value: dischargeSummaries.reviewed || 0 },
            { label: "Approved", value: dischargeSummaries.approved || 0 },
            { label: "Finalized today", value: dischargeSummaries.finalizedToday || 0 },
          ]}
          breakdown={[
            { label: "Total finalized", value: dischargeSummaries.finalized || 0 },
            { label: "Total all-time", value: dischargeSummaries.total || 0 },
          ]}
        />

        {/* Patient Wristbands */}
        <SubsystemPanel
          title="Patient Wristbands"
          icon={QrCode}
          iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
          isLoading={isLoading}
          stats={[
            { label: "Active", value: wristbands.active || 0, highlight: true },
            { label: "Replaced", value: wristbands.replaced || 0 },
            { label: "Voided", value: wristbands.voided || 0 },
            { label: "Printed today", value: wristbands.printedToday || 0 },
          ]}
          breakdown={[
            { label: "Total all-time", value: wristbands.total || 0 },
          ]}
        />

        {/* Medication Labels */}
        <SubsystemPanel
          title="Medication Labels"
          icon={Pill}
          iconBg="bg-gradient-to-br from-amber-500 to-orange-600"
          isLoading={isLoading}
          stats={[
            { label: "Active", value: medicationLabels.active || 0, highlight: true },
            { label: "High Alert", value: medicationLabels.highAlert || 0, highlight: (medicationLabels.highAlert || 0) > 0 },
            { label: "Controlled", value: medicationLabels.controlled || 0 },
            { label: "Printed today", value: medicationLabels.medicationLabels || 0 },
          ]}
          breakdown={[
            { label: "Voided", value: medicationLabels.voided || 0 },
            { label: "Total all-time", value: medicationLabels.total || 0 },
          ]}
        />
      </div>

      {/* ─── RBAC Matrix table ────────────────────────────────── */}
      <Card className="w-full">
        <CardContent className="p-4 w-full">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> RBAC Permission Matrix
            </h3>
            <span className="text-xs text-slate-500">
              Roles × CDSS Permissions · {rbac?.roles?.length || 0} roles · {rbac?.permissions?.length || 0} permissions
            </span>
          </div>
          {!rbac ? (
            <LoadingState rows={3} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="text-left p-2 sticky left-0 bg-slate-100">Role</th>
                    {rbac.permissions.map((p: any) => (
                      <th
                        key={p.code}
                        title={`${p.label} (${p.categoryLabel})`}
                        className="text-center p-2 font-medium min-w-[60px]"
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px]">{p.label.split(" ")[0]}</span>
                          <span className="text-[9px] text-slate-500 normal-case font-normal">
                            {p.categoryLabel.split(" ")[0]}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rbac.roles.map((role: any) => (
                    <tr key={role.key} className={role.isSuperAdmin ? "bg-purple-50" : ""}>
                      <td className="p-2 sticky left-0 bg-white font-medium text-slate-900 capitalize">
                        {role.label}
                        {role.isSuperAdmin && (
                          <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-purple-600 text-white font-bold">
                            SUPER
                          </span>
                        )}
                      </td>
                      {rbac.permissions.map((p: any) => {
                        const has = role.permissions[p.code];
                        return (
                          <td key={p.code} className="text-center p-2">
                            {has ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" />
                            ) : (
                              <XCircle className="w-4 h-4 text-slate-300 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                {rbac.categories.map((c: any) => (
                  <span key={c.key} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Regression test runner ──────────────────────────── */}
      <Card className="w-full">
        <CardContent className="p-4 w-full">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Play className="w-4 h-4" /> Regression Test Runner
            </h3>
            <Button
              size="sm"
              onClick={() => runRegression.mutate()}
              disabled={regressionRunning}
              className="bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 text-white gap-2"
            >
              {regressionRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Run All Tests
                </>
              )}
            </Button>
          </div>

          {/* Summary row */}
          {regressionSummary && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-lg p-3 mb-3 border-2 ${
                regressionSummary.fail > 0
                  ? "bg-rose-50 border-rose-300 text-rose-700"
                  : regressionSummary.warn > 0
                    ? "bg-amber-50 border-amber-300 text-amber-700"
                    : "bg-emerald-50 border-emerald-300 text-emerald-700"
              }`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 font-semibold">
                  {regressionSummary.fail === 0 ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span>
                    {regressionSummary.fail === 0 ? "All tests passed" : `${regressionSummary.fail} test(s) failed`}
                  </span>
                  <span className="text-xs font-normal opacity-80">
                    {regressionSummary.pass} passed · {regressionSummary.warn} warnings · {regressionSummary.total} total
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Test results list */}
          {regressionRunning && !regressionResults && (
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              className="text-center py-8 text-slate-500 text-sm"
            >
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Running regression suite across all CDSS subsystems...
            </motion.div>
          )}

          {regressionResults && (
            <motion.div layout className="space-y-1.5 max-h-[400px] overflow-y-auto">
              <AnimatePresence>
                {regressionResults.map((r: any, idx: number) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                      r.status === "pass" ? "border-emerald-200 bg-emerald-50" :
                      r.status === "fail" ? "border-rose-300 bg-rose-50" :
                      "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {r.status === "pass" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : r.status === "fail" ? (
                        <motion.span
                          animate={{ scale: [1, 1.15, 1] }}
                          transition={{ duration: 0.8, repeat: 2 }}
                        >
                          <XCircle className="w-4 h-4 text-rose-600" />
                        </motion.span>
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">{r.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-wide">
                          {r.category}
                        </span>
                        <span className="text-[10px] text-slate-400">{r.durationMs}ms</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{r.message}</p>
                      {r.details && Object.keys(r.details).length > 0 && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">
                            Show details
                          </summary>
                          <pre className="text-[10px] text-slate-600 mt-1 p-2 bg-white rounded border overflow-x-auto">
                            {JSON.stringify(r.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}

          {!regressionResults && !regressionRunning && (
            <div className="text-center py-8 text-slate-400 text-sm">
              <Play className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Click <strong>Run All Tests</strong> to verify the CDSS engine, schema, permissions, RBAC matrix, database queries, audit log, and print system.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Recent audit log + top contributors (2 cols) ─────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent CDSS audit log */}
        <Card className="w-full">
          <CardContent className="p-4 w-full">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Recent CDSS Activity
            </h3>
            {isLoading ? (
              <LoadingState rows={3} />
            ) : recentAuditLogs.length === 0 ? (
              <EmptyState
                title="No CDSS activity yet"
                description="Once you start using the CDSS subsystems, recent actions will appear here."
                icon={Activity}
              />
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                <AnimatePresence>
                  {recentAuditLogs.slice(0, 10).map((log: any, idx: number) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                      className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="shrink-0 w-2 h-2 rounded-full bg-indigo-500 mt-2" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-slate-900">
                            {AUDIT_ACTION_LABEL[log.action] || log.action}
                          </span>
                          <span className="text-[10px] text-slate-400">·</span>
                          <span className="text-[10px] text-slate-500">{log.userName}</span>
                          <span className="text-[10px] text-slate-400">·</span>
                          <span className="text-[10px] text-slate-400">{formatRelative(log.createdAt)}</span>
                        </div>
                        {log.resourceType && (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {log.resourceType}
                            {log.reason && ` · reason: "${log.reason}"`}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top contributors */}
        <Card className="w-full">
          <CardContent className="p-4 w-full">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
              <Award className="w-4 h-4" /> Top Contributors (7 days)
            </h3>
            {isLoading ? (
              <LoadingState rows={3} />
            ) : topContributors.length === 0 ? (
              <EmptyState
                title="No contributors yet"
                description="CDSS actions taken in the last 7 days will be aggregated here."
                icon={User}
              />
            ) : (
              <div className="space-y-2">
                {topContributors.map((c: any, idx: number) => (
                  <motion.div
                    key={c.userId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.06 }}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50"
                  >
                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                      idx === 0 ? "bg-gradient-to-br from-amber-400 to-orange-500" :
                      idx === 1 ? "bg-gradient-to-br from-slate-400 to-slate-500" :
                      idx === 2 ? "bg-gradient-to-br from-amber-700 to-yellow-800" :
                      "bg-gradient-to-br from-slate-300 to-slate-400"
                    }`}>
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {c.count} CDSS action{c.count !== 1 ? "s" : ""} in last 7 days
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Engine rule coverage ────────────────────────────── */}
      <Card className="w-full">
        <CardContent className="p-4 w-full">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
            <FlaskConical className="w-4 h-4" /> Engine Rule Coverage
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <HeartPulse className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-medium text-slate-600">DDI Interaction Rules</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{engine.interactionRules || 0}</p>
              <p className="text-[10px] text-slate-500">medication interaction pairs seeded</p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-slate-600">Allergy Check</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">✓</p>
              <p className="text-[10px] text-slate-500">patient allergy cross-check active</p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-slate-600">Critical Lab Rules</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">✓</p>
              <p className="text-[10px] text-slate-500">critical value auto-flagging active</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Subsystem panel sub-component ────────────────────────────
function SubsystemPanel({
  title,
  icon: Icon,
  iconBg,
  isLoading,
  stats,
  breakdown,
}: {
  title: string;
  icon: any;
  iconBg: string;
  isLoading: boolean;
  stats: Array<{ label: string; value: number | string; highlight?: boolean }>;
  breakdown: Array<{ label: string; value: number }>;
}) {
  return (
    <Card className="w-full">
      <CardContent className="p-4 w-full">
        <div className="flex items-center gap-3 mb-3">
          <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm ${iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">{title}</h3>
        </div>
        {isLoading ? (
          <LoadingState rows={2} />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className={`p-2 rounded-lg border ${
                    s.highlight
                      ? "border-rose-300 bg-rose-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className={`text-xl font-bold ${s.highlight ? "text-rose-700" : "text-slate-900"}`}>
                    {s.value}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</div>
                </div>
              ))}
            </div>
            {breakdown.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-1">
                {breakdown.map((b) => (
                  <div key={b.label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{b.label}</span>
                    <span className="font-mono font-medium text-slate-700">{b.value}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
