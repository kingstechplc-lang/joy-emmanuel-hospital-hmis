"use client";

// =====================================================================
// AI SERVICES ADMIN VIEW — manage providers, models, credentials, tests
// =====================================================================
// This is the single admin UI for the database-backed AI configuration.
// It mirrors the layout pattern of audit-logs-view.tsx (gradient header
// + KPI-style "current configuration" card + tables) and the dialog
// pattern of medications-admin-view.tsx (modal forms with create/edit).
//
// Sections:
//   1. Current Active Configuration — resolved provider + model + key
//      status (masked only, never the full key).
//   2. Providers — table of all AIProvider rows with add/edit/disable
//      actions. The "isDefault" toggle enforces single-default on the
//      client by prompting with a confirmation dialog.
//   3. Models — table of all AIModel rows grouped by provider, with
//      add/edit/disable/set-default/test actions.
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
import {
  Sparkles, Plus, RefreshCw, Loader2, AlertTriangle, CheckCircle2, XCircle,
  Edit, Key, FlaskConical, Star, StarOff, Power, Activity, Cpu, Eye, EyeOff,
  Server, Brain, Zap, Image as ImageIcon, Wrench, MessageSquare, ShieldCheck,
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

// =====================================================================
// MAIN VIEW
// =====================================================================
export function AIServicesView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canManage = user?.roles?.includes("super_admin") || perms.includes("ai_config.manage");

  const qc = useQueryClient();
  const queryKey = ["ai-services-config"];

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => fetchJson("/api/admin/ai/config"),
    refetchInterval: 60_000, // auto-refresh every 60s — admin can see live status
  });

  const [providerDialog, setProviderDialog] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [modelDialog, setModelDialog] = useState<{ open: boolean; editing: any | null; providerId?: string }>({ open: false, editing: null, providerId: undefined });
  const [credDialog, setCredDialog] = useState<{ open: boolean; provider: any | null }>({ open: false, provider: null });
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
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
    <div className="space-y-4 fade-in-up">
      {/* Gradient header */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Sparkles className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> AI Services
        </h2>
        <p className="text-sm text-white/80 mt-1">
          Configure AI providers, models, and credentials. The resolved configuration is used by the AI Assistant and all AI clinical tools.
        </p>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {isFetching ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-violet-600" />
              <span className="text-violet-700 font-medium">Refreshing…</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 text-slate-400" />
              <span>Auto-refresh every 60s</span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setProviderDialog({ open: true, editing: null })} className="bg-violet-600 hover:bg-violet-700">
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
              } })}
            />
          )}

          {/* Section 1: Current Active Configuration */}
          <ActiveConfigCard active={data.active} totalProviders={data.totalProviders} totalModels={data.totalModels} />

          {/* Section 2: Providers */}
          <ProvidersSection
            providers={data.providers || []}
            canManage={canManage}
            onEdit={(p) => setProviderDialog({ open: true, editing: p })}
            onConfigureCreds={(p) => setCredDialog({ open: true, provider: p })}
            onAddModel={(providerId) => setModelDialog({ open: true, editing: null, providerId })}
          />

          {/* Section 3: Models (per provider) */}
          <ModelsSection
            providers={data.providers || []}
            canManage={canManage}
            onEdit={(m, providerId) => setModelDialog({ open: true, editing: m, providerId })}
            onTest={(providerId, modelId) => testMut.mutate({ providerId, modelId })}
            testing={testMut.isPending}
            testResults={testResults}
          />
        </>
      )}

      {/* Dialogs */}
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
    </div>
  );
}

// =====================================================================
// SECTION 1: ACTIVE CONFIGURATION CARD
// =====================================================================
function ActiveConfigCard({ active, totalProviders, totalModels }: { active: any; totalProviders: number; totalModels: number }) {
  const isConfigured = active?.configured === true;
  const sourceLabel = active?.source === "database" ? "Database" : active?.source === "environment" ? "Environment Variables" : "Not Configured";
  const sourceColor = active?.source === "database" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : active?.source === "environment" ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-rose-100 text-rose-700 border-rose-200";

  return (
    <Card className="card-hover-lift">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Activity className="w-4 h-4 text-violet-600" /> Current Active Configuration
        </CardTitle>
        <CardDescription className="text-xs">
          The resolved AI runtime config — used by the AI Assistant and all AI clinical tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <ConfigItem label="Source" value={<Badge variant="outline" className={`text-xs ${sourceColor}`}>{sourceLabel}</Badge>} />
          <ConfigItem label="Provider" value={active?.providerName || "—"} />
          <ConfigItem label="Model" value={active?.displayName || active?.modelCode || "—"} />
          <ConfigItem
            label="Connection Status"
            value={
              isConfigured ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" /> Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-rose-700">
                  <XCircle className="w-4 h-4" /> Not Configured
                </span>
              )
            }
          />
          <ConfigItem label="Base URL" value={<code className="text-xs break-all">{active?.baseUrl || "—"}</code>} />
          <ConfigItem label="Model Code" value={<code className="text-xs">{active?.modelCode || "—"}</code>} />
          <ConfigItem
            label="API Key (masked)"
            value={active?.apiKeyMasked ? <code className="text-xs">{active.apiKeyMasked}</code> : <span className="text-slate-400 text-xs">Not set</span>}
          />
          <ConfigItem label="Capabilities" value={
            <div className="flex flex-wrap gap-1">
              <CapChip icon={<Brain className="w-3 h-3" />} label="Thinking" on={active?.supportsThinking} />
              <CapChip icon={<ImageIcon className="w-3 h-3" />} label="Vision" on={active?.supportsVision} />
              <CapChip icon={<Wrench className="w-3 h-3" />} label="Tools" on={active?.supportsTools} />
            </div>
          } />
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
          <Stat label="Total Providers" value={totalProviders} icon={<Server className="w-3.5 h-3.5" />} />
          <Stat label="Total Models" value={totalModels} icon={<Cpu className="w-3.5 h-3.5" />} />
        </div>

        {!isConfigured && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">AI is not configured.</div>
              <div className="text-amber-700">
                Add a provider, set it as default, add a model (mark it default for the provider), and configure an API key. Alternatively, set the <code>ZAI_API_KEY</code> environment variable.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigItem({ label, value }: { label: string; value: any }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] uppercase tracking-wide text-slate-500">{label}</Label>
      <div className="text-sm text-slate-900">{value}</div>
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
// SECTION 2: PROVIDERS TABLE
// =====================================================================
function ProvidersSection({
  providers, canManage, onEdit, onConfigureCreds, onAddModel,
}: {
  providers: any[];
  canManage: boolean;
  onEdit: (p: any) => void;
  onConfigureCreds: (p: any) => void;
  onAddModel: (providerId: string) => void;
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
// SECTION 3: MODELS TABLE (per provider)
// =====================================================================
function ModelsSection({
  providers, canManage, onEdit, onTest, testing, testResults,
}: {
  providers: any[];
  canManage: boolean;
  onEdit: (m: any, providerId: string) => void;
  onTest: (providerId: string, modelId?: string) => void;
  testing: boolean;
  testResults: Record<string, any>;
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
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onEdit(m, p.id)}>
                                <Edit className="w-3 h-3" /> Edit
                              </Button>
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
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Server className="w-5 h-5" /> {isEdit ? "Edit Provider" : "Add Provider"}
          </DialogTitle>
          <DialogDescription className="text-white/80">
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
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Cpu className="w-5 h-5" /> {isEdit ? "Edit Model" : "Add Model"}
          </DialogTitle>
          <DialogDescription className="text-white/80">
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
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Key className="w-5 h-5" /> Configure API Key — {provider?.name}
          </DialogTitle>
          <DialogDescription className="text-white/80">
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-md shrink-0">
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
