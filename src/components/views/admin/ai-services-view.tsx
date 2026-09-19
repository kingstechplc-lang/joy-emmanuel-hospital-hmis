"use client";

// =====================================================================
// AI SERVICES ADMIN VIEW — manage providers, models, credentials, tests
// + realtime usage statistics dashboard
// =====================================================================
// This is the single admin UI for the database-backed AI configuration.
//
// Sections (mobile-first responsive, beautiful animations):
//   1. Animated gradient header — changes colour per active provider
//   2. AI Usage Statistics — KPI cards + per-tool breakdown + recent
//      calls list. Polls /api/admin/ai/usage every 10s for realtime
//      updates. Auto-scrolls the new calls into view as they arrive.
//   3. Current Active Configuration — resolved provider + model + key
//      status (masked only, never the full key).
//   4. Providers — table of all AIProvider rows with add/edit/delete
//      actions. Delete cascades models/credentials/testRuns.
//   5. Models — table of all AIModel rows grouped by provider, with
//      add/edit/delete/test actions.
//
// Security:
//   - API keys are entered via <input type="password"> in the
//     credentials dialog and sent over HTTPS to the encrypted
//     credentials endpoint. The plaintext key is NEVER returned by
//     the API — only a masked preview like `81b2a9...agmq (len=49)`.
//   - All mutations go through endpoints that require ai_config.manage
//     and write to the audit log.
// =====================================================================
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sparkles, Plus, RefreshCw, Loader2, AlertTriangle, CheckCircle2, XCircle,
  Edit, Key, FlaskConical, Star, Power, Activity, Cpu, Eye, EyeOff,
  Server, Brain, Zap, Image as ImageIcon, Wrench, MessageSquare, ShieldCheck,
  Trash2, TrendingUp, Clock, BarChart3, Globe, Lock, ChevronDown, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, safeJson,
} from "@/components/ui-helpers";

// ─── Fetch helper ─────────────────────────────────────────────
async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const json = await safeJson(res);
  if (!res.ok) {
    throw new Error(json?.error || `Request failed with status ${res.status}`);
  }
  return json;
}

// ─── Provider type options ──────────────────────────────────
const PROVIDER_TYPES = [
  { value: "openai_compatible", label: "OpenAI-compatible (most providers)" },
  { value: "anthropic", label: "Anthropic" },
  { value: "custom", label: "Custom" },
];

const PRICING_TYPES = [
  { value: "paid", label: "Paid" },
  { value: "freemium", label: "Freemium" },
  { value: "free", label: "Free" },
];

// Tool metadata for human-friendly labels + colours in the usage dashboard
const TOOL_META: Record<string, { label: string; gradient: string }> = {
  icd10:                { label: "ICD-10 Suggester",          gradient: "from-violet-500 to-purple-700" },
  radiology:            { label: "Radiology Interpreter",    gradient: "from-cyan-500 to-blue-700" },
  triage:               { label: "Triage Scorer",            gradient: "from-blue-500 to-cyan-700" },
  drug_interactions:    { label: "Drug Interaction Checker",  gradient: "from-rose-500 to-pink-700" },
  prescription_check:   { label: "Prescription Error Detector", gradient: "from-orange-500 to-red-700" },
  risk_stratification: { label: "Patient Risk Stratification", gradient: "from-amber-500 to-orange-700" },
  dose:                 { label: "Pediatric Dose Check",      gradient: "from-emerald-500 to-teal-700" },
  anomaly:              { label: "Lab Anomaly Detection",    gradient: "from-fuchsia-500 to-pink-700" },
  clinical_summary:    { label: "Clinical Summary Generator", gradient: "from-indigo-500 to-blue-700" },
  discharge_gen:       { label: "Discharge Summary Generator", gradient: "from-slate-500 to-slate-800" },
};

// =====================================================================
// MAIN VIEW
// =====================================================================
export function AIServicesView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canManage = user?.roles?.includes("super_admin") || perms.includes("ai_config.manage");
  const canViewUsage = canManage || perms.includes("analytics.view");

  const qc = useQueryClient();
  const queryKey = ["ai-services-config"];
  const usageQueryKey = ["ai-usage-stats"];

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => fetchJson("/api/admin/ai/config"),
    refetchInterval: 60_000,
  });

  // Realtime usage stats — poll every 10s
  const usageQuery = useQuery({
    queryKey: usageQueryKey,
    queryFn: () => fetchJson("/api/admin/ai/usage"),
    refetchInterval: 10_000,
    enabled: canViewUsage,
  });

  const [providerDialog, setProviderDialog] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [modelDialog, setModelDialog] = useState<{ open: boolean; editing: any | null; providerId?: string }>({ open: false, editing: null, providerId: undefined });
  const [credDialog, setCredDialog] = useState<{ open: boolean; provider: any | null }>({ open: false, provider: null });
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ type: "provider" | "model"; item: any } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: usageQueryKey });
  };

  // ── Provider mutations ──────────────────────────────────────
  const createProviderMut = useMutation({
    mutationFn: (data: any) => fetchJson("/api/admin/ai/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { toast.success("Provider created"); invalidate(); setProviderDialog({ open: false, editing: null }); },
    onError: (e: any) => toast.error(e?.message || "Failed to create provider"),
  });
  const updateProviderMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => fetchJson(`/api/admin/ai/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { toast.success("Provider updated"); invalidate(); setProviderDialog({ open: false, editing: null }); },
    onError: (e: any) => toast.error(e?.message || "Failed to update provider"),
  });
  const deleteProviderMut = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/admin/ai/providers/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Provider deleted"); invalidate(); setDeleteTarget(null); },
    onError: (e: any) => { toast.error(e?.message || "Failed to delete provider"); setDeleteTarget(null); },
  });

  // ── Model mutations ─────────────────────────────────────────
  const createModelMut = useMutation({
    mutationFn: (data: any) => fetchJson("/api/admin/ai/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { toast.success("Model created"); invalidate(); setModelDialog({ open: false, editing: null, providerId: undefined }); },
    onError: (e: any) => toast.error(e?.message || "Failed to create model"),
  });
  const updateModelMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => fetchJson(`/api/admin/ai/models/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { toast.success("Model updated"); invalidate(); setModelDialog({ open: false, editing: null, providerId: undefined }); },
    onError: (e: any) => toast.error(e?.message || "Failed to update model"),
  });
  const deleteModelMut = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/admin/ai/models/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Model deleted"); invalidate(); setDeleteTarget(null); },
    onError: (e: any) => { toast.error(e?.message || "Failed to delete model"); setDeleteTarget(null); },
  });

  // ── Credential mutation ─────────────────────────────────────
  const setCredMut = useMutation({
    mutationFn: ({ providerId, apiKey, label }: { providerId: string; apiKey: string; label?: string }) =>
      fetchJson("/api/admin/ai/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, apiKey, label }),
      }),
    onSuccess: () => { toast.success("API key updated"); invalidate(); setCredDialog({ open: false, provider: null }); },
    onError: (e: any) => toast.error(e?.message || "Failed to set API key"),
  });

  // ── Test mutation ───────────────────────────────────────────
  const testMut = useMutation({
    mutationFn: ({ providerId, modelId }: { providerId: string; modelId?: string }) =>
      fetchJson("/api/admin/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, modelId }),
      }),
    onSuccess: (data, vars) => {
      const key = vars.modelId ? `model:${vars.modelId}` : `provider:${vars.providerId}`;
      setTestResults((s) => ({ ...s, [key]: data }));
      if (data.status === "ok") toast.success(`Test OK — ${data.latencyMs}ms`);
      else toast.error(`Test failed: ${data.status}`);
    },
    onError: (e: any) => toast.error(e?.message || "Test request failed"),
  });

  return (
    <div className="space-y-4 sm:space-y-5 fade-in-up">
      {/* ───────────────────────────────────────────────────────
          ANIMATED GRADIENT HEADER
          - Per-active-provider gradient colour
          - Subtle grid pattern + shimmer sweep (desktop only)
          - Compact on mobile, roomier on desktop
      ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 via-purple-700 to-fuchsia-700 text-white p-4 sm:p-6 shadow-xl sm:shadow-2xl relative overflow-hidden">
        {/* Floating orbs — desktop only */}
        <div className="ai-desktop-blur absolute top-0 right-0 w-64 h-64 bg-white opacity-10 blur-3xl rounded-full pointer-events-none ai-float-slow" />
        <div className="ai-desktop-blur absolute bottom-0 left-1/3 w-48 h-48 bg-fuchsia-300 opacity-20 blur-3xl rounded-full pointer-events-none ai-float-slower" />
        {/* Subtle grid pattern — pure CSS, no GPU cost */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Shimmer sweep — desktop only */}
        <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 sm:gap-4 mb-2">
            <div className="relative shrink-0">
              {/* Rotating gradient ring — desktop only */}
              <div
                className="hidden sm:block absolute inset-0 rounded-xl bg-gradient-to-tr from-white/40 via-transparent to-white/30 ai-spin-slow"
                style={{ animationDuration: "4s" }}
              />
              <div className="relative w-11 h-11 sm:w-12 sm:h-12 bg-white/15 backdrop-blur rounded-xl ring-1 ring-white/30 shadow-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">AI Services</h2>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-white/15 ring-1 ring-white/30 rounded-full px-2 py-0.5">
                  <BarChart3 className="w-3 h-3" /> Realtime Stats
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/80 mt-0.5">
                Configure AI providers, models, and credentials. The resolved configuration is used by the AI Assistant and all AI clinical tools.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────
          ACTION BAR
      ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {isFetching || usageQuery.isFetching ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-violet-600" />
              <span className="text-violet-700 font-medium">Refreshing…</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 text-slate-400" />
              <span>Config: 60s · Usage: 10s</span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); usageQuery.refetch(); }} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setProviderDialog({ open: true, editing: null })} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:opacity-90 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Provider
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load AI configuration" onRetry={() => refetch()} />
      ) : !data ? null : (
        <>
          {/* Quick Setup wizard — shows when no DB providers exist */}
          {canManage && (data.totalProviders || 0) === 0 && (
            <QuickSetupCard
              activeConfig={data.active}
              onCreateProvider={() => setProviderDialog({ open: true, editing: {
                code: "zai",
                name: "Z.ai",
                baseUrl: "https://api.z.ai/api/paas/v4",
                providerType: "openai_compatible",
                isDefault: true,
              }})}
            />
          )}

          {/* Section 1: Current Active Configuration (hero card) */}
          <ActiveConfigCard active={data.active} totalProviders={data.totalProviders} totalModels={data.totalModels} />

          {/* Section 2: Providers (with delete) */}
          <ProvidersSection
            providers={data.providers || []}
            canManage={canManage}
            onEdit={(p) => setProviderDialog({ open: true, editing: p })}
            onConfigureCreds={(p) => setCredDialog({ open: true, provider: p })}
            onAddModel={(providerId) => setModelDialog({ open: true, editing: null, providerId })}
            onDelete={(p) => setDeleteTarget({ type: "provider", item: p })}
          />

          {/* Section 3: Models (with delete, per provider) */}
          <ModelsSection
            providers={data.providers || []}
            canManage={canManage}
            onEdit={(m, providerId) => setModelDialog({ open: true, editing: m, providerId })}
            onTest={(providerId, modelId) => testMut.mutate({ providerId, modelId })}
            testing={testMut.isPending}
            testResults={testResults}
            onDelete={(m) => setDeleteTarget({ type: "model", item: m })}
          />

          {/* Section 4: AI Usage Statistics (realtime, collapsible)
              Moved to bottom so admin can find provider/model config
              without scrolling past the (growing) stats list. The
              stats section is collapsed by default — only KPI cards +
              24h bar chart are visible; expand to see calls-by-tool
              and recent-calls lists. */}
          {canViewUsage && (
            <UsageStatsSection
              data={usageQuery.data}
              isLoading={usageQuery.isLoading}
              isError={usageQuery.isError}
              onRetry={() => usageQuery.refetch()}
            />
          )}
        </>
      )}

      {/* ── Dialogs ── */}
      {providerDialog.open && (
        <ProviderFormDialog
          provider={providerDialog.editing}
          onClose={() => setProviderDialog({ open: false, editing: null })}
          onSave={(data) => {
            if (providerDialog.editing) {
              updateProviderMut.mutate({ id: providerDialog.editing.id, data });
            } else {
              createProviderMut.mutate(data);
            }
          }}
          saving={createProviderMut.isPending || updateProviderMut.isPending}
        />
      )}

      {modelDialog.open && (
        <ModelFormDialog
          model={modelDialog.editing}
          providers={data?.providers || []}
          initialProviderId={modelDialog.providerId}
          onClose={() => setModelDialog({ open: false, editing: null, providerId: undefined })}
          onSave={(data) => {
            if (modelDialog.editing) {
              updateModelMut.mutate({ id: modelDialog.editing.id, data });
            } else {
              createModelMut.mutate(data);
            }
          }}
          saving={createModelMut.isPending || updateModelMut.isPending}
        />
      )}

      {credDialog.open && credDialog.provider && (
        <CredentialDialog
          provider={credDialog.provider}
          onClose={() => setCredDialog({ open: false, provider: null })}
          onSave={(apiKey, label) =>
            setCredMut.mutate({ providerId: credDialog.provider.id, apiKey, label })
          }
          saving={setCredMut.isPending}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title={deleteTarget.type === "provider" ? "Delete AI Provider" : "Delete AI Model"}
          description={
            deleteTarget.type === "provider"
              ? `This will permanently delete "${deleteTarget.item.name}" and cascade-delete its models, credentials, and test runs. AIUsageLog rows are kept for historical stats. This action cannot be undone.`
              : `This will permanently delete model "${deleteTarget.item.displayName}" (${deleteTarget.item.modelCode}) and cascade-delete its test runs. This action cannot be undone.`
          }
          details={
            <div className="space-y-1 text-xs">
              <div><span className="text-slate-500">Name:</span> <span className="font-semibold">{deleteTarget.item.name || deleteTarget.item.displayName}</span></div>
              {deleteTarget.type === "provider" && (
                <>
                  <div><span className="text-slate-500">Code:</span> <code className="px-1 py-0.5 bg-slate-100 rounded">{deleteTarget.item.code}</code></div>
                  <div><span className="text-slate-500">Status:</span> {deleteTarget.item.isDefault ? <Badge variant="outline" className="ml-1 text-amber-700 bg-amber-50 border-amber-200">DEFAULT — cannot delete</Badge> : <Badge variant="outline" className="ml-1">OK</Badge>}</div>
                </>
              )}
              {deleteTarget.type === "model" && (
                <div><span className="text-slate-500">Status:</span> {deleteTarget.item.defaultForProvider ? <Badge variant="outline" className="ml-1 text-amber-700 bg-amber-50 border-amber-200">DEFAULT — cannot delete</Badge> : <Badge variant="outline" className="ml-1">OK</Badge>}</div>
              )}
            </div>
          }
          variant="destructive"
          confirmText="Delete Permanently"
          onConfirm={async () => {
            if (deleteTarget.type === "provider") {
              if (deleteTarget.item.isDefault) {
                toast.error("Cannot delete the default provider. Set another provider as default first.");
                return;
              }
              await deleteProviderMut.mutateAsync(deleteTarget.item.id);
            } else {
              if (deleteTarget.item.defaultForProvider) {
                toast.error("Cannot delete the default model. Set another model as default for this provider first.");
                return;
              }
              await deleteModelMut.mutateAsync(deleteTarget.item.id);
            }
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// SECTION 0: AI USAGE STATISTICS (REALTIME)
// =====================================================================
function UsageStatsSection({
  data, isLoading, isError, onRetry,
}: {
  data: any;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  // Collapsible details: KPI cards + last-24h bar chart are always
  // visible (compact, useful at a glance). Calls-by-tool + recent-calls
  // lists are collapsed by default — admin expands to see details.
  // This keeps the section short so the admin doesn't have to scroll
  // past an ever-growing stats list to reach the provider/model tables
  // (which are now placed ABOVE the stats section).
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  if (isLoading) {
    return (
      <Card className="shadow-md border-violet-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-violet-600" /> AI Usage Statistics
          </CardTitle>
          <CardDescription className="text-xs">Realtime — auto-refreshes every 10 seconds</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-rose-600" /> AI Usage Statistics</CardTitle></CardHeader>
        <CardContent>
          <ErrorState message="Failed to load usage stats" onRetry={onRetry} />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const totals = data.totals || { today: 0, week: 0, month: 0, allTime: 0 };
  const successRate = data.successRate || { today: 100, week: 100, month: 100 };
  const avgLatencyMs = data.avgLatencyMs || { today: 0, week: 0, month: 0 };
  const callsByTool = data.callsByTool || [];
  const recentCalls = data.recentCalls || [];
  const last24hSeries = data.last24hSeries || [];
  const warning: string | undefined = data._warning;

  // Find max count for bar chart scaling
  const maxHourly = Math.max(1, ...last24hSeries.map((h: any) => h.count));
  const maxToolCount = Math.max(1, ...callsByTool.map((t: any) => t.count));

  return (
    <Card className="shadow-md border-violet-200 overflow-hidden">
      {/* Gradient top strip */}
      <div className="h-1.5 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-600" /> AI Usage Statistics
            </CardTitle>
            <CardDescription className="text-xs flex items-center gap-1.5 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Realtime — auto-refreshes every 10s
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 shrink-0">
            <Clock className="w-2.5 h-2.5 mr-0.5" />
            {new Date(data.generatedAt).toLocaleTimeString()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── Warning banner (when backend couldn't read the table) ── */}
        {warning && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 ai-enter-up">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1">
              <div className="font-semibold mb-0.5">Usage stats unavailable</div>
              <div className="text-amber-700 leading-relaxed">{warning}</div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-amber-700 hover:bg-amber-100 shrink-0"
              onClick={onRetry}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        )}

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <UsageKpiCard
            label="Calls Today"
            value={totals.today}
            icon={Activity}
            gradient="from-violet-500 to-purple-700"
            subtext={`${successRate.today}% success`}
          />
          <UsageKpiCard
            label="Calls (7 days)"
            value={totals.week}
            icon={TrendingUp}
            gradient="from-blue-500 to-cyan-700"
            subtext={`${successRate.week}% success`}
          />
          <UsageKpiCard
            label="Calls (30 days)"
            value={totals.month}
            icon={BarChart3}
            gradient="from-emerald-500 to-teal-700"
            subtext={`${successRate.month}% success`}
          />
          <UsageKpiCard
            label="Avg Latency"
            value={`${avgLatencyMs.today || 0}ms`}
            icon={Clock}
            gradient="from-amber-500 to-orange-700"
            subtext={`today · ${avgLatencyMs.week || 0}ms 7d`}
          />
        </div>

        {/* ── Last 24h activity bar chart ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-violet-600" /> Last 24 hours
            </h4>
            <span className="text-[10px] text-slate-500">{last24hSeries.reduce((s: number, h: any) => s + h.count, 0)} calls</span>
          </div>
          <div className="flex items-end gap-0.5 h-20 sm:h-24 px-1 bg-slate-50 rounded-lg p-2 overflow-hidden">
            {last24hSeries.map((h: any, i: number) => {
              const heightPct = (h.count / maxHourly) * 100;
              const hour = new Date(h.hour).getHours();
              const isPeak = h.count === maxHourly && h.count > 0;
              return (
                <div
                  key={i}
                  className="flex-1 group relative flex flex-col items-center justify-end h-full"
                  title={`${hour}:00 — ${h.count} calls (${h.successCount} ok)`}
                >
                  <div
                    className={`w-full rounded-t-sm transition-all duration-500 ${
                      isPeak
                        ? "bg-gradient-to-t from-violet-600 to-fuchsia-500"
                        : h.count > 0
                        ? "bg-gradient-to-t from-violet-400 to-purple-500"
                        : "bg-slate-200"
                    }`}
                    style={{ height: `${Math.max(2, heightPct)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-slate-400 mt-1 px-1">
            <span>23h ago</span>
            <span>12h ago</span>
            <span>now</span>
          </div>
        </div>

        {/* ── Expand / collapse button for detailed breakdown ── */}
        {(callsByTool.length > 0 || recentCalls.length > 0) && (
          <button
            type="button"
            onClick={() => setDetailsExpanded(s => !s)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-800 hover:bg-violet-50 transition-colors rounded-lg py-1.5 border border-violet-200 bg-violet-50/50"
            aria-expanded={detailsExpanded}
          >
            {detailsExpanded ? (
              <>
                <ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 transition-transform" />
                Show Details
                <Badge variant="outline" className="text-[9px] bg-white text-violet-700 border-violet-200 ml-1">
                  {callsByTool.length} tools · {recentCalls.length} recent
                </Badge>
              </>
            )}
          </button>
        )}

        {/* ── Collapsible details: Calls by tool + Recent calls ── */}
        {detailsExpanded && (callsByTool.length > 0 || recentCalls.length > 0) && (
          <div className="space-y-4 ai-enter-up">
            {/* ── Calls by tool (horizontal bar chart) ── */}
            {callsByTool.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Brain className="w-3 h-3 text-violet-600" /> Calls by Tool (30 days)
                </h4>
                <div className="space-y-1.5">
                  {callsByTool.map((t: any, i: number) => {
                    const meta = TOOL_META[t.tool] || { label: t.tool, gradient: "from-slate-500 to-slate-700" };
                    const pct = (t.count / maxToolCount) * 100;
                    const successPct = t.count > 0 ? (t.successCount / t.count) * 100 : 100;
                    return (
                      <div
                        key={t.tool}
                        className="flex items-center gap-2 sm:gap-3 text-xs ai-enter-up"
                        style={{ animationDelay: `${i * 0.04}s` }}
                      >
                        <div className="w-24 sm:w-36 truncate font-medium text-slate-700">{meta.label}</div>
                        <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden relative">
                          <div
                            className={`h-full bg-gradient-to-r ${meta.gradient} transition-all duration-700 ease-out flex items-center justify-end pr-2`}
                            style={{ width: `${Math.max(3, pct)}%` }}
                          >
                            <span className="text-[10px] font-bold text-white drop-shadow-sm">{t.count}</span>
                          </div>
                        </div>
                        <div className="w-16 sm:w-20 text-right text-[10px] text-slate-500">
                          {Math.round(successPct)}% ok
                          {t.avgLatencyMs > 0 && <div className="text-[9px]">{t.avgLatencyMs}ms</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Recent calls ── */}
            {recentCalls.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Activity className="w-3 h-3 text-violet-600" /> Recent Calls
                </h4>
                <div className="space-y-1 max-h-72 overflow-y-auto sidebar-scroll">
                  {recentCalls.map((c: any, i: number) => {
                    const meta = TOOL_META[c.tool] || { label: c.tool || "unknown", gradient: "from-slate-500 to-slate-700" };
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-50 transition-colors ai-enter-up"
                        style={{ animationDelay: `${Math.min(i * 0.02, 0.3)}s` }}
                      >
                        <div className={`shrink-0 w-7 h-7 rounded-md bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                          {c.success ? <CheckCircle2 className="w-3.5 h-3.5 text-white" /> : <XCircle className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-semibold text-slate-900 truncate">{meta.label}</span>
                            <span className="text-slate-400">·</span>
                            <code className="text-[10px] text-slate-500 truncate">{c.modelCode}</code>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {c.user ? `${c.user.firstName} ${c.user.lastName}`.trim() || c.user.email || "system" : "system"}
                            {c.latencyMs != null && ` · ${c.latencyMs}ms`}
                            {c.totalTokens != null && ` · ${c.totalTokens} tok`}
                            {!c.success && c.errorMessage && ` · ${c.errorMessage.slice(0, 80)}`}
                          </div>
                        </div>
                        <div className="text-[9px] text-slate-400 shrink-0">
                          {timeAgo(new Date(c.createdAt))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {totals.allTime === 0 && (
          <div className="text-center py-6 text-slate-500 text-xs">
            <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            No AI calls logged yet. Statistics will appear here as clinicians use the AI Assistant.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsageKpiCard({ label, value, icon: Icon, gradient, subtext }: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  gradient: string;
  subtext?: string;
}) {
  return (
    <div className="relative rounded-xl p-3 sm:p-4 bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-xl`} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
          <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
            <Icon className="w-3 h-3 text-white" />
          </div>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight tabular-nums">{value}</div>
        {subtext && <div className="text-[10px] text-slate-500 mt-0.5">{subtext}</div>}
      </div>
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// =====================================================================
// SECTION 1: CURRENT ACTIVE CONFIGURATION (HERO CARD)
// =====================================================================
// Unique hero design — the visual treatment changes based on the
// active source (database = emerald, environment = amber, none = rose)
// so an admin can see at a glance whether AI is properly configured.
//
// Layout:
//   - Top: gradient banner with large provider icon + provider/model name
//     + animated "Configured" status pill
//   - Middle: 3 mini-cards (Base URL, Model Code, API Key masked) with
//     gradient accent icons
//   - Bottom: capability chips + stats row (providers / models count)
//   - If not configured: warning message replaces the mini-cards
// =====================================================================
function ActiveConfigCard({ active, totalProviders, totalModels }: { active: any; totalProviders: number; totalModels: number }) {
  const isConfigured = active?.configured === true;
  const source = active?.source || "none";
  const sourceLabel = source === "database" ? "Database-backed" : source === "environment" ? "Environment Vars" : "Not Configured";

  // Visual treatment per source
  const theme = source === "database"
    ? {
        gradient: "from-emerald-600 via-teal-600 to-cyan-700",
        glow: "bg-emerald-300",
        badge: "bg-emerald-500/20 text-emerald-50 ring-emerald-300/40",
        accent: "text-emerald-700",
        accentBg: "bg-emerald-50",
        accentRing: "ring-emerald-200",
        iconBg: "bg-emerald-500/20 ring-emerald-300/40",
        statusColor: "text-emerald-300",
        stripGradient: "from-emerald-400 via-teal-400 to-cyan-500",
      }
    : source === "environment"
    ? {
        gradient: "from-amber-600 via-orange-600 to-yellow-700",
        glow: "bg-amber-300",
        badge: "bg-amber-500/20 text-amber-50 ring-amber-300/40",
        accent: "text-amber-700",
        accentBg: "bg-amber-50",
        accentRing: "ring-amber-200",
        iconBg: "bg-amber-500/20 ring-amber-300/40",
        statusColor: "text-amber-300",
        stripGradient: "from-amber-400 via-orange-400 to-yellow-500",
      }
    : {
        gradient: "from-rose-600 via-rose-700 to-red-800",
        glow: "bg-rose-300",
        badge: "bg-rose-500/20 text-rose-50 ring-rose-300/40",
        accent: "text-rose-700",
        accentBg: "bg-rose-50",
        accentRing: "ring-rose-200",
        iconBg: "bg-rose-500/20 ring-rose-300/40",
        statusColor: "text-rose-300",
        stripGradient: "from-rose-400 via-red-400 to-pink-500",
      };

  return (
    <Card className="card-hover-lift overflow-hidden shadow-md sm:shadow-lg">
      {/* ── HERO BANNER ─────────────────────────────────────────── */}
      <div className={`relative overflow-hidden bg-gradient-to-r ${theme.gradient} text-white p-4 sm:p-6`}>
        {/* Decorative orbs — desktop only */}
        <div className={`ai-desktop-blur absolute -top-10 -right-10 w-48 h-48 ${theme.glow} opacity-20 blur-3xl rounded-full pointer-events-none ai-float-slow`} />
        <div className={`ai-desktop-blur absolute -bottom-12 left-1/4 w-40 h-40 ${theme.glow} opacity-10 blur-3xl rounded-full pointer-events-none ai-float-slower`} />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Shimmer sweep — desktop only */}
        <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />

        <div className="relative z-10">
          {/* Top row: title + source badge + status pill */}
          <div className="flex items-start justify-between gap-2 sm:gap-3 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-white/80 shrink-0" />
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white/90 truncate">
                Active Configuration
              </h3>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${theme.badge}`}>
                <Server className="w-2.5 h-2.5" />
                {sourceLabel}
              </span>
            </div>
          </div>

          {/* Middle: large provider icon + provider/model name */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Icon with glow ring */}
            <div className="relative shrink-0">
              {/* Rotating gradient ring — desktop only */}
              <div
                className="hidden sm:block absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/40 via-transparent to-white/30 ai-spin-slow"
                style={{ animationDuration: "5s" }}
              />
              <div className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${theme.iconBg} ring-1 backdrop-blur flex items-center justify-center shadow-lg`}>
                {isConfigured ? (
                  <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                ) : source === "environment" ? (
                  <Zap className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                ) : (
                  <XCircle className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                )}
              </div>
            </div>

            {/* Provider + model display */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate">
                  {active?.providerName || "Not configured"}
                </h2>
                {/* Animated status pill */}
                <span className={`inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-white/15 ring-1 ring-white/30`}>
                  <span className="relative flex h-2 w-2">
                    {isConfigured && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isConfigured ? "bg-emerald-400" : source === "environment" ? "bg-amber-400" : "bg-rose-400"}`} />
                  </span>
                  {isConfigured ? "Live" : source === "environment" ? "Read-only" : "Down"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-xs sm:text-sm text-white/80 min-w-0">
                <Brain className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="truncate">
                  {active?.displayName || active?.modelCode || "— no model —"}
                </span>
                {active?.modelCode && active?.displayName && active?.modelCode !== active?.displayName && (
                  <code className="text-[10px] sm:text-[11px] text-white/60 truncate">({active.modelCode})</code>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── METADATA MINI-CARDS ────────────────────────────────── */}
      <CardContent className="p-3 sm:p-4 space-y-3">
        {isConfigured ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <ConfigMiniCard
              icon={<Globe className="w-3.5 h-3.5" />}
              label="Base URL"
              value={<code className="text-xs break-all">{active?.baseUrl || "—"}</code>}
              theme={theme}
            />
            <ConfigMiniCard
              icon={<Cpu className="w-3.5 h-3.5" />}
              label="Model Code"
              value={<code className="text-xs font-mono">{active?.modelCode || "—"}</code>}
              theme={theme}
            />
            <ConfigMiniCard
              icon={<Key className="w-3.5 h-3.5" />}
              label="API Key (masked)"
              value={
                active?.apiKeyMasked ? (
                  <code className="text-xs font-mono">{active.apiKeyMasked}</code>
                ) : (
                  <span className="text-slate-400 text-xs">Not set</span>
                )
              }
              theme={theme}
            />
          </div>
        ) : (
          /* Not configured warning */
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 ai-enter-up">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1">
              <div className="font-semibold mb-0.5">AI is not configured</div>
              <div className="text-amber-700 leading-relaxed">
                Add a provider, set it as default, add a model (mark it default for the provider), and configure an API key. Alternatively, set the <code className="px-1 py-0.5 bg-amber-100 rounded">ZAI_API_KEY</code> environment variable.
              </div>
            </div>
          </div>
        )}

        {/* ── Capabilities + stats ───────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          {/* Capabilities */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Capabilities
            </Label>
            <div className="flex flex-wrap gap-1.5">
              <CapChip icon={<Brain className="w-3 h-3" />} label="Thinking" on={active?.supportsThinking} />
              <CapChip icon={<ImageIcon className="w-3 h-3" />} label="Vision" on={active?.supportsVision} />
              <CapChip icon={<Wrench className="w-3 h-3" />} label="Tools" on={active?.supportsTools} />
            </div>
          </div>
          {/* Stats */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
              <Server className="w-3 h-3" /> Inventory
            </Label>
            <div className="flex flex-wrap gap-3">
              <Stat label="Providers" value={totalProviders} icon={<Server className="w-3.5 h-3.5" />} />
              <Stat label="Models" value={totalModels} icon={<Cpu className="w-3.5 h-3.5" />} />
            </div>
          </div>
        </div>
      </CardContent>

      {/* Bottom gradient strip — matches hero theme */}
      <div className={`h-1 bg-gradient-to-r ${theme.stripGradient}`} />
    </Card>
  );
}

// Mini card for metadata fields in the Active Configuration hero
function ConfigMiniCard({ icon, label, value, theme }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  theme: any;
}) {
  return (
    <div className={`relative rounded-xl p-3 ${theme.accentBg} ring-1 ${theme.accentRing} overflow-hidden`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-5 h-5 rounded-md flex items-center justify-center ${theme.accent} bg-white ring-1 ring-slate-200 shadow-sm`}>
          {icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className="text-sm text-slate-900 min-w-0">{value}</div>
    </div>
  );
}

function CapChip({ icon, label, on }: { icon: React.ReactNode; label: string; on?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${
      on ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-400 border-slate-200"
    }`}>
      {icon} {label}
    </span>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-violet-100 text-violet-700 p-1.5 rounded">{icon}</div>
      <div>
        <div className="text-[10px] uppercase text-slate-500">{label}</div>
        <div className="text-sm font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

// =====================================================================
// SECTION 2: PROVIDERS TABLE (with delete)
// =====================================================================
function ProvidersSection({
  providers, canManage, onEdit, onConfigureCreds, onAddModel, onDelete,
}: {
  providers: any[];
  canManage: boolean;
  onEdit: (p: any) => void;
  onConfigureCreds: (p: any) => void;
  onAddModel: (providerId: string) => void;
  onDelete: (p: any) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Server className="w-4 h-4 text-violet-600" /> Providers
        </CardTitle>
        <CardDescription className="text-xs">
          All configured AI providers. Only one can be the default — the resolver uses the default provider's default model.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {providers.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No providers configured"
              description="Add your first AI provider to get started. Most OpenAI-compatible providers work out of the box."
              icon={Server}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="text-left p-3 font-semibold text-slate-700">Name</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Code</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Base URL</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Credential</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Models</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                  {canManage && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => {
                  const cred = p.credential;
                  return (
                    <tr key={p.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900 flex items-center gap-1.5">
                          {p.name}
                          {p.isDefault && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                              <Star className="w-2.5 h-2.5 mr-0.5" /> Default
                            </Badge>
                          )}
                        </div>
                        {p.description && <div className="text-xs text-slate-500 mt-0.5">{p.description}</div>}
                      </td>
                      <td className="p-3"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{p.code}</code></td>
                      <td className="p-3 text-xs text-slate-600">{p.providerType}</td>
                      <td className="p-3"><code className="text-xs break-all">{p.baseUrl}</code></td>
                      <td className="p-3">
                        {cred ? (
                          <div className="space-y-0.5">
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Configured
                            </Badge>
                            {cred.apiKeyMasked && (
                              <div className="text-[10px] text-slate-500 font-mono">{cred.apiKeyMasked}</div>
                            )}
                            {cred.label && <div className="text-[10px] text-slate-500">"{cred.label}"</div>}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                            <XCircle className="w-2.5 h-2.5 mr-0.5" /> Not configured
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs text-slate-600">{p.models?.length || 0}</td>
                      <td className="p-3">
                        {p.active ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">Inactive</Badge>
                        )}
                      </td>
                      {canManage && (
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onConfigureCreds(p)}>
                              <Key className="w-3 h-3" /> Key
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onAddModel(p.id)}>
                              <Plus className="w-3 h-3" /> Model
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onEdit(p)}>
                              <Edit className="w-3 h-3" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => onDelete(p)}
                              title={p.isDefault ? "Cannot delete the default provider — set another as default first" : "Delete provider"}
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// SECTION 3: MODELS TABLE (with delete, per provider)
// =====================================================================
function ModelsSection({
  providers, canManage, onEdit, onTest, testing, testResults, onDelete,
}: {
  providers: any[];
  canManage: boolean;
  onEdit: (m: any, providerId: string) => void;
  onTest: (providerId: string, modelId?: string) => void;
  testing: boolean;
  testResults: Record<string, any>;
  onDelete: (m: any) => void;
}) {
  const totalModels = providers.reduce((n, p) => n + (p.models?.length || 0), 0);
  if (totalModels === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Cpu className="w-4 h-4 text-violet-600" /> Models
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <EmptyState
            title="No models configured"
            description="Add a provider first, then add models to it. Each provider can have multiple models; mark one as the default."
            icon={Cpu}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Cpu className="w-4 h-4 text-violet-600" /> Models
        </CardTitle>
        <CardDescription className="text-xs">
          AI models grouped by provider. Use the Test button to send a non-PHI probe request and verify connectivity + credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 space-y-0">
        {providers.map((p) => (
          <div key={p.id} className="border-b last:border-b-0">
            <div className="px-4 py-2 bg-slate-50/50 border-b flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">{p.name}</span>
              <code className="text-[10px] text-slate-500">{p.code}</code>
              <Badge variant="outline" className="text-[10px]">{p.models?.length || 0} model(s)</Badge>
            </div>
            {(p.models?.length || 0) === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-400 italic">No models configured for this provider.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-white">
                    <tr>
                      <th className="text-left p-2 font-semibold text-slate-700 text-xs">Display Name</th>
                      <th className="text-left p-2 font-semibold text-slate-700 text-xs">Model Code</th>
                      <th className="text-left p-2 font-semibold text-slate-700 text-xs">Pricing</th>
                      <th className="text-left p-2 font-semibold text-slate-700 text-xs">Capabilities</th>
                      <th className="text-left p-2 font-semibold text-slate-700 text-xs">Status</th>
                      <th className="text-left p-2 font-semibold text-slate-700 text-xs">Test</th>
                      {canManage && <th className="text-right p-2 font-semibold text-slate-700 text-xs">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {p.models.map((m: any) => {
                      const testKey = `model:${m.id}`;
                      const testResult = testResults[testKey];
                      return (
                        <tr key={m.id} className="border-b last:border-b-0 hover:bg-slate-50">
                          <td className="p-2">
                            <div className="font-medium text-slate-900 flex items-center gap-1.5">
                              {m.displayName}
                              {m.defaultForProvider && (
                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                  <Star className="w-2.5 h-2.5 mr-0.5" /> Default
                                </Badge>
                              )}
                            </div>
                            {m.description && <div className="text-xs text-slate-500">{m.description}</div>}
                          </td>
                          <td className="p-2"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{m.modelCode}</code></td>
                          <td className="p-2">
                            <Badge variant="outline" className={`text-[10px] ${
                              m.pricingType === "free" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : m.pricingType === "freemium" ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-50 text-slate-600 border-slate-200"
                            }`}>{m.pricingType}</Badge>
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              <CapChip icon={<Brain className="w-3 h-3" />} label="Think" on={m.supportsThinking} />
                              <CapChip icon={<ImageIcon className="w-3 h-3" />} label="Vision" on={m.supportsVision} />
                              <CapChip icon={<Wrench className="w-3 h-3" />} label="Tools" on={m.supportsTools} />
                              <CapChip icon={<MessageSquare className="w-3 h-3" />} label="Stream" on={m.supportsStreaming} />
                            </div>
                          </td>
                          <td className="p-2">
                            {m.active ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">Inactive</Badge>
                            )}
                          </td>
                          <td className="p-2">
                            <Button
                              size="sm" variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={testing || !p.credential}
                              onClick={() => onTest(p.id, m.id)}
                            >
                              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
                              Test
                            </Button>
                            {testResult && (
                              <div className="mt-1 text-[10px]">
                                <TestResultBadge result={testResult} />
                              </div>
                            )}
                          </td>
                          {canManage && (
                            <td className="p-2 text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onEdit(m, p.id)}>
                                  <Edit className="w-3 h-3" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                  onClick={() => onDelete(m)}
                                  title={m.defaultForProvider ? "Cannot delete the default model — set another as default first" : "Delete model"}
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TestResultBadge({ result }: { result: any }) {
  const isOk = result.status === "ok";
  return (
    <div className={`inline-flex items-start gap-1 px-1.5 py-0.5 rounded border ${
      isOk ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-rose-50 text-rose-700 border-rose-200"
    }`}>
      {isOk ? <CheckCircle2 className="w-2.5 h-2.5 mt-0.5" /> : <XCircle className="w-2.5 h-2.5 mt-0.5" />}
      <div>
        <div className="font-semibold">{result.status}</div>
        {result.latencyMs != null && <div className="text-[9px] opacity-75">{result.latencyMs}ms</div>}
        {result.responsePreview && <div className="text-[9px] opacity-75 truncate max-w-[200px]">"{result.responsePreview}"</div>}
        {result.errorMessage && <div className="text-[9px] opacity-75 truncate max-w-[200px]">{result.errorMessage}</div>}
      </div>
    </div>
  );
}

// =====================================================================
// DIALOG: PROVIDER FORM (add/edit)
// =====================================================================
function ProviderFormDialog({
  provider, onClose, onSave, saving,
}: {
  provider: any | null;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const isEdit = !!provider;
  const [form, setForm] = useState({
    code: provider?.code || "",
    name: provider?.name || "",
    description: provider?.description || "",
    baseUrl: provider?.baseUrl || "",
    providerType: provider?.providerType || "openai_compatible",
    active: provider?.active ?? true,
    isDefault: provider?.isDefault ?? false,
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const submit = () => {
    if (!form.code.trim()) { toast.error("Code is required"); return; }
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.baseUrl.trim()) { toast.error("Base URL is required"); return; }
    onSave(form);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="large">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white relative overflow-hidden">
          <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />
          <DialogTitle className="text-white flex items-center gap-2 relative">
            <Server className="w-5 h-5" /> {isEdit ? "Edit Provider" : "Add Provider"}
          </DialogTitle>
          <DialogDescription className="text-white/80 relative">
            {isEdit ? "Update this AI provider's configuration." : "Register a new AI provider. Most OpenAI-compatible providers work out of the box."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Code <span className="text-rose-500">*</span></Label>
              <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="zai | openai | anthropic | groq" disabled={isEdit} />
              <p className="text-[10px] text-slate-500">Unique identifier. Cannot be changed after creation.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name <span className="text-rose-500">*</span></Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Z.ai" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Base URL <span className="text-rose-500">*</span></Label>
            <Input value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} placeholder="https://api.z.ai/api/paas/v4" />
            <p className="text-[10px] text-slate-500">The base URL of the chat completions endpoint. The resolver appends <code>/chat/completions</code>.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Provider Type</Label>
            <Select value={form.providerType} onValueChange={(v) => set("providerType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Optional note, e.g. 'Production key for GLM-4 Plus'"
            />
          </div>
          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.active} onCheckedChange={(c) => set("active", c === true)} />
              <span className="text-sm">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.isDefault} onCheckedChange={(c) => set("isDefault", c === true)} />
              <span className="text-sm">Set as default <span className="text-[10px] text-slate-500">(unsets other defaults)</span></span>
            </label>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// DIALOG: MODEL FORM (add/edit)
// =====================================================================
function ModelFormDialog({
  model, providers, initialProviderId, onClose, onSave, saving,
}: {
  model: any | null;
  providers: any[];
  initialProviderId?: string;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const isEdit = !!model;
  const [form, setForm] = useState({
    providerId: model?.providerId || initialProviderId || "",
    modelCode: model?.modelCode || "",
    displayName: model?.displayName || "",
    description: model?.description || "",
    pricingType: model?.pricingType || "paid",
    supportsThinking: model?.supportsThinking || false,
    supportsVision: model?.supportsVision || false,
    supportsTools: model?.supportsTools || false,
    supportsStreaming: model?.supportsStreaming || false,
    temperatureDefault: model?.temperatureDefault?.toString() || "",
    maxTokensDefault: model?.maxTokensDefault?.toString() || "",
    contextWindow: model?.contextWindow?.toString() || "",
    notes: model?.notes || "",
    active: model?.active ?? true,
    defaultForProvider: model?.defaultForProvider ?? false,
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const submit = () => {
    if (!form.providerId) { toast.error("Provider is required"); return; }
    if (!form.modelCode.trim()) { toast.error("Model code is required"); return; }
    if (!form.displayName.trim()) { toast.error("Display name is required"); return; }
    onSave(form);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="large">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white relative overflow-hidden">
          <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />
          <DialogTitle className="text-white flex items-center gap-2 relative">
            <Cpu className="w-5 h-5" /> {isEdit ? "Edit Model" : "Add Model"}
          </DialogTitle>
          <DialogDescription className="text-white/80 relative">
            {isEdit ? "Update this AI model's configuration." : "Register a new AI model. The model code is the exact ID sent to the provider API."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Provider <span className="text-rose-500">*</span></Label>
              <Select value={form.providerId} onValueChange={(v) => set("providerId", v)} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder="Select a provider" /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Model Code <span className="text-rose-500">*</span></Label>
              <Input value={form.modelCode} onChange={(e) => set("modelCode", e.target.value)} placeholder="glm-4-plus | gpt-4o | claude-3-opus" disabled={isEdit} />
              <p className="text-[10px] text-slate-500">Exact ID sent to the provider API.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Display Name <span className="text-rose-500">*</span></Label>
            <Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="GLM-4 Plus" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Pricing Type</Label>
              <Select value={form.pricingType} onValueChange={(v) => set("pricingType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRICING_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Temperature (0–2)</Label>
              <Input type="number" step="0.1" min="0" max="2" value={form.temperatureDefault} onChange={(e) => set("temperatureDefault", e.target.value)} placeholder="0.7" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Tokens</Label>
              <Input type="number" min="1" value={form.maxTokensDefault} onChange={(e) => set("maxTokensDefault", e.target.value)} placeholder="2048" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Context Window (tokens)</Label>
              <Input type="number" min="1" value={form.contextWindow} onChange={(e) => set("contextWindow", e.target.value)} placeholder="128000" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Capabilities</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.supportsThinking} onCheckedChange={(c) => set("supportsThinking", c === true)} />
                <span className="text-xs flex items-center gap-1"><Brain className="w-3 h-3" /> Thinking</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.supportsVision} onCheckedChange={(c) => set("supportsVision", c === true)} />
                <span className="text-xs flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Vision</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.supportsTools} onCheckedChange={(c) => set("supportsTools", c === true)} />
                <span className="text-xs flex items-center gap-1"><Wrench className="w-3 h-3" /> Tools</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.supportsStreaming} onCheckedChange={(c) => set("supportsStreaming", c === true)} />
                <span className="text-xs flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Streaming</span>
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional internal notes" />
          </div>

          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.active} onCheckedChange={(c) => set("active", c === true)} />
              <span className="text-sm">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.defaultForProvider} onCheckedChange={(c) => set("defaultForProvider", c === true)} />
              <span className="text-sm">Default for this provider <span className="text-[10px] text-slate-500">(unsets other defaults)</span></span>
            </label>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Model"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// DIALOG: CREDENTIAL (set/rotate API key)
// =====================================================================
function CredentialDialog({
  provider, onClose, onSave, saving,
}: {
  provider: any;
  onClose: () => void;
  onSave: (apiKey: string, label?: string) => void;
  saving: boolean;
}) {
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const cred = provider?.credential;

  const submit = () => {
    if (!apiKey.trim()) { toast.error("API key is required"); return; }
    if (apiKey.length < 8) { toast.error("API key looks too short — check you have pasted the full key."); return; }
    onSave(apiKey.trim(), label.trim() || undefined);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="medium">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white relative overflow-hidden">
          <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />
          <DialogTitle className="text-white flex items-center gap-2 relative">
            <Key className="w-5 h-5" /> Configure API Key — {provider?.name}
          </DialogTitle>
          <DialogDescription className="text-white/80 relative">
            The key is encrypted with AES-256-GCM before storage. It is NEVER returned in plaintext by the API.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
          {cred && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-semibold text-slate-700">Current key (masked):</span>
              </div>
              <code className="text-xs text-slate-700">{cred.apiKeyMasked}</code>
              {cred.label && <div className="text-[10px] text-slate-500">Label: "{cred.label}"</div>}
              {!cred.decryptable && (
                <div className="text-[10px] text-rose-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Stored key is undecryptable — re-enter it.
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">API Key <span className="text-rose-500">*</span></Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste the API key from the provider dashboard"
                className="pr-10 font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              Stored encrypted with AES-256-GCM. Decryption only happens server-side in the AI service.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Label (optional)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Production key | Backup key | Trial key" />
          </div>

          <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <div>Setting a new key deactivates the previous active key. Old keys are kept as inactive for forensic review.</div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !apiKey.trim()} className="bg-violet-600 hover:bg-violet-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Key className="w-4 h-4 mr-1" />}
            {saving ? "Saving…" : "Save & Encrypt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// QUICK SETUP CARD — shows when no DB providers exist
// =====================================================================
function QuickSetupCard({ activeConfig, onCreateProvider }: {
  activeConfig: any;
  onCreateProvider: () => void;
}) {
  const isEnvConfigured = activeConfig?.source === "environment";
  const isNotConfigured = activeConfig?.source === "none";

  return (
    <Card className="border-violet-300 shadow-lg shadow-violet-500/10 overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-md shrink-0 ai-glow-pulse">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-900">Quick Setup Required</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              No AI providers are configured in the database yet. Set up a provider to enable runtime model switching.
            </p>
          </div>
        </div>

        <div className={`rounded-lg p-3 mb-4 text-xs ${isEnvConfigured ? "bg-amber-50 border border-amber-200" : "bg-rose-50 border border-rose-200"}`}>
          {isEnvConfigured ? (
            <div className="flex items-start gap-2 text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">AI is using environment variables (read-only)</p>
                <p className="mt-0.5">Provider: {activeConfig?.providerName || "Z.ai"} | Model: {activeConfig?.modelCode || "glm-4-plus"}</p>
                <p className="mt-0.5">Create a database-backed provider below to switch models without redeploying.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-rose-800">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">AI is not configured</p>
                <p className="mt-0.5">No environment variables or database configuration found.</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 mb-4">
          <SetupStep number={1} title="Create Provider" desc="Add Z.ai as a provider (pre-filled)" />
          <SetupStep number={2} title="Configure API Key" desc="Enter your Z.ai API key (encrypted)" />
          <SetupStep number={3} title="Add Model" desc="Add glm-4-plus and set as default" />
          <SetupStep number={4} title="Test Model" desc="Verify the model works" />
        </div>

        <Button onClick={onCreateProvider} className="w-full bg-gradient-to-r from-violet-600 to-purple-700 hover:opacity-90 gap-2 h-11 font-semibold">
          <Plus className="w-4 h-4" /> Start Setup — Create Z.ai Provider
        </Button>
      </CardContent>
    </Card>
  );
}

function SetupStep({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-violet-100 text-violet-700">
        {number}
      </div>
      <div className="flex-1">
        <p className="text-xs font-medium text-slate-900">{title}</p>
        <p className="text-[10px] text-slate-500">{desc}</p>
      </div>
    </div>
  );
}
