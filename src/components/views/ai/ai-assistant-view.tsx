"use client";

// =====================================================================
// AI ASSISTANT — 10 AI-powered clinical tools with beautiful UI
// =====================================================================
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Brain, Stethoscope, Pill, FlaskConical, Loader2, Sparkles,
  AlertTriangle, CheckCircle2, Lightbulb, Activity, TrendingUp,
  Zap, ShieldCheck, ArrowRight, Wand2, FileText, ScanLine,
  GitCompare, ClipboardList, ChevronDown, Copy, XCircle, Check,
  Search, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { safeJson } from "@/components/ui-helpers";

async function fetchJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json.error || `Failed: ${res.status}`);
  return json;
}

type ToolId = "icd10" | "triage" | "dose" | "anomaly" | "drug_interactions" | "clinical_summary" | "risk_stratification" | "radiology" | "discharge_gen" | "prescription_check";

interface ToolDef {
  id: ToolId;
  label: string;
  desc: string;
  icon: React.ReactNode;
  gradient: string;
  category: string;
}

const TOOLS: ToolDef[] = [
  { id: "icd10", label: "ICD-10 Suggester", desc: "Code from free text", icon: <Brain className="w-4 h-4" />, gradient: "from-violet-600 to-purple-700", category: "Diagnosis & Coding" },
  { id: "radiology", label: "Radiology Interpreter", desc: "Parse imaging reports", icon: <ScanLine className="w-4 h-4" />, gradient: "from-cyan-600 to-blue-700", category: "Diagnosis & Coding" },
  { id: "triage", label: "Triage Scorer", desc: "SATS acuity scoring", icon: <Stethoscope className="w-4 h-4" />, gradient: "from-blue-600 to-cyan-700", category: "Safety & Risk" },
  { id: "drug_interactions", label: "Drug Interaction Checker", desc: "Check med interactions", icon: <GitCompare className="w-4 h-4" />, gradient: "from-rose-600 to-pink-700", category: "Safety & Risk" },
  { id: "prescription_check", label: "Prescription Error Detector", desc: "Check Rx safety", icon: <ShieldCheck className="w-4 h-4" />, gradient: "from-orange-600 to-red-700", category: "Safety & Risk" },
  { id: "risk_stratification", label: "Patient Risk Stratification", desc: "Predict risk levels", icon: <Activity className="w-4 h-4" />, gradient: "from-amber-600 to-orange-700", category: "Safety & Risk" },
  { id: "dose", label: "Pediatric Dose Check", desc: "Weight-based safety", icon: <Pill className="w-4 h-4" />, gradient: "from-emerald-600 to-teal-700", category: "Safety & Risk" },
  { id: "anomaly", label: "Lab Anomaly Detection", desc: "Pattern detection", icon: <FlaskConical className="w-4 h-4" />, gradient: "from-fuchsia-600 to-pink-700", category: "Safety & Risk" },
  { id: "clinical_summary", label: "Clinical Summary Generator", desc: "Handover & referral", icon: <ClipboardList className="w-4 h-4" />, gradient: "from-indigo-600 to-blue-700", category: "Documentation" },
  { id: "discharge_gen", label: "Discharge Summary Generator", desc: "Auto-generate discharge", icon: <FileText className="w-4 h-4" />, gradient: "from-slate-600 to-slate-800", category: "Documentation" },
];

// =====================================================================
// CATEGORY DEFINITIONS — drives the tab strip + dropdown selector
// Each category has its own gradient, icon, accent colour, and short
// label (for compact mobile tabs). Tool count is computed at runtime.
// =====================================================================
interface CategoryDef {
  id: string;
  label: string;           // full label (desktop)
  shortLabel: string;      // abbreviated label (mobile)
  icon: LucideIcon;
  gradient: string;        // tailwind gradient (e.g. "from-violet-600 to-purple-700")
  ringClass: string;       // tailwind ring/border accent class
  textClass: string;       // tailwind text colour for active state
  bgClass: string;         // tailwind bg tint for inactive hover
}

const CATEGORIES: CategoryDef[] = [
  {
    id: "Diagnosis & Coding",
    label: "Diagnosis & Coding",
    shortLabel: "Diagnose",
    icon: Brain,
    gradient: "from-violet-600 to-purple-700",
    ringClass: "ring-violet-400/60",
    textClass: "text-violet-700",
    bgClass: "bg-violet-50",
  },
  {
    id: "Safety & Risk",
    label: "Safety & Risk",
    shortLabel: "Safety",
    icon: ShieldCheck,
    gradient: "from-rose-600 to-pink-700",
    ringClass: "ring-rose-400/60",
    textClass: "text-rose-700",
    bgClass: "bg-rose-50",
  },
  {
    id: "Documentation",
    label: "Documentation",
    shortLabel: "Docs",
    icon: FileText,
    gradient: "from-indigo-600 to-blue-700",
    ringClass: "ring-indigo-400/60",
    textClass: "text-indigo-700",
    bgClass: "bg-indigo-50",
  },
];

export function AIAssistantView() {
  const [tool, setTool] = useState<ToolId>("icd10");
  const [activeCategory, setActiveCategory] = useState<string>("Diagnosis & Coding");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const activeTool = TOOLS.find(t => t.id === tool)!;
  const activeCat = CATEGORIES.find(c => c.id === activeCategory)!;
  const toolsInCat = TOOLS.filter(t => t.category === activeCategory);

  // When category changes, switch to the first tool in that category.
  // (Each tool belongs to exactly one category, so a tool selected under
  //  one tab never exists under another — auto-switch is the cleanest UX.)
  const handleCategoryChange = (catId: string) => {
    setActiveCategory(catId);
    const first = TOOLS.find(t => t.category === catId);
    if (first) setTool(first.id);
  };

  return (
    <div
      className={`space-y-4 sm:space-y-5 transition-all duration-500 ${
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      {/* ───────────────────────────────────────────────────────────────
          ANIMATED GRADIENT HEADER
          - Per-tool gradient (changes colour as you switch tools)
          - Subtle grid pattern + shimmer overlay (desktop only)
          - Floating blur orbs (desktop only — hidden on mobile to save GPU)
          - Compact on mobile (p-4) / roomier on desktop (sm:p-7)
      ─────────────────────────────────────────────────────────────── */}
      <div
        className={`rounded-2xl bg-gradient-to-r ${activeTool.gradient} text-white p-4 sm:p-7 shadow-xl sm:shadow-2xl relative overflow-hidden transition-all duration-500`}
      >
        {/* Decorative blur orbs — desktop only (mobile-disable via ai-desktop-blur) */}
        <div
          className="ai-desktop-blur absolute top-0 right-0 w-64 h-64 bg-white opacity-10 blur-3xl rounded-full pointer-events-none ai-float-slow"
        />
        <div
          className="ai-desktop-blur absolute bottom-0 left-1/3 w-48 h-48 bg-white opacity-5 blur-3xl rounded-full pointer-events-none ai-float-slower"
        />
        {/* Subtle grid pattern — pure CSS, no GPU cost */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Shimmer sweep — desktop only */}
        <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
            {/* AI icon with pulse rings (desktop) / plain icon (mobile) */}
            <div className="relative shrink-0">
              {/* Rotating gradient ring — desktop only */}
              <div
                className="hidden sm:block absolute inset-0 rounded-xl bg-gradient-to-tr from-white/40 via-transparent to-white/30 ai-spin-slow"
                style={{ animationDuration: "4s" }}
              />
              <div
                className="relative w-11 h-11 sm:w-12 sm:h-12 bg-white/15 backdrop-blur rounded-xl ring-1 ring-white/30 shadow-lg flex items-center justify-center"
              >
                <Wand2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                  AI Clinical Assistant
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-white/15 ring-1 ring-white/30 rounded-full px-2 py-0.5">
                  <Sparkles className="w-3 h-3" /> {TOOLS.length} tools
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/80 mt-0.5">
                <span className="sm:hidden">{activeCat.shortLabel} · </span>
                <span className="font-medium">{activeTool.label}</span>
              </p>
            </div>
          </div>
          <p className="text-[11px] sm:text-xs text-white/65 max-w-lg leading-relaxed">
            All AI suggestions are advisory. The clinician always makes the final clinical decision.
          </p>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────
          CATEGORY TAB STRIP
          - Horizontal scroll on mobile (snap + hidden scrollbar)
          - Active tab: gradient bg, white text, lift + glow
          - Inactive tab: subtle tint, dark text, hover lift
          - Each tab shows: icon chip + label (full on desktop, short on
            mobile) + tool-count badge
      ─────────────────────────────────────────────────────────────── */}
      <div className="ai-tabs-scroll overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex gap-2 min-w-max">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            const count = TOOLS.filter((t) => t.category === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                aria-pressed={isActive}
                className={`
                  group relative flex items-center gap-2 sm:gap-2.5 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5
                  transition-all duration-300 ease-out
                  ring-1 touch-manipulation select-none
                  ${isActive
                    ? `bg-gradient-to-r ${cat.gradient} text-white ring-white/30 shadow-md sm:shadow-lg sm:-translate-y-0.5`
                    : `bg-white text-slate-700 ring-slate-200 hover:${cat.bgClass} hover:ring-slate-300 hover:-translate-y-0.5 shadow-sm`
                  }
                `}
              >
                {/* Icon chip */}
                <span
                  className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-lg transition-all duration-300 ${
                    isActive
                      ? "bg-white/20 ring-1 ring-white/30"
                      : `${cat.bgClass} ${cat.textClass} ring-1 ring-slate-200 group-hover:scale-110`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
                {/* Label: full on sm+, short on mobile */}
                <span className="flex flex-col leading-tight text-left">
                  <span className="font-semibold text-sm sm:text-[15px]">
                    <span className="sm:hidden">{cat.shortLabel}</span>
                    <span className="hidden sm:inline">{cat.label}</span>
                  </span>
                  <span
                    className={`text-[10px] font-medium ${
                      isActive ? "text-white/70" : "text-slate-400"
                    }`}
                  >
                    {count} {count === 1 ? "tool" : "tools"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────
          TOOL DROPDOWN SELECTOR
          - Beautiful gradient-tinted trigger (per active category)
          - Animated chevron that rotates on open
          - Only shows tools in the currently active category
          - Each option: icon chip + label + description
          - Full-width on mobile, larger touch targets
      ─────────────────────────────────────────────────────────────── */}
      <Card
        className={`shadow-md overflow-hidden ring-1 ${activeCat.ringClass} transition-all duration-300`}
      >
        <CardContent className="p-3 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Search className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Select AI Tool in </span>
              <span className="sm:hidden">Tool in </span>
              <span className={`${activeCat.textClass}`}>{activeCat.shortLabel}</span>
            </Label>
            <Badge
              variant="secondary"
              className={`text-[10px] font-medium ${activeCat.bgClass} ${activeCat.textClass} border-0`}
            >
              {toolsInCat.length} available
            </Badge>
          </div>
          <Select value={tool} onValueChange={(v) => setTool(v as ToolId)}>
            <SelectTrigger
              className={`
                h-12 sm:h-14 text-sm sm:text-base font-medium rounded-xl
                bg-gradient-to-r ${activeCat.gradient} bg-clip-text text-transparent
                border-2 border-slate-200 hover:border-slate-300
                data-[state=open]:border-slate-400
                transition-all duration-300
                [&>svg:last-child]:text-slate-400 [&>svg:last-child]:transition-transform
                [&>svg:last-child]:data-[state=open]:rotate-180
              `}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br ${activeTool.gradient} text-white shadow-sm shrink-0`}
                >
                  {activeTool.icon}
                </span>
                <span className="flex flex-col items-start leading-tight min-w-0">
                  <span className="text-slate-900 font-semibold truncate w-full text-left text-sm sm:text-base">
                    {activeTool.label}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate w-full text-left sm:text-xs">
                    {activeTool.desc}
                  </span>
                </span>
              </div>
              <SelectValue aria-hidden className="sr-only" />
            </SelectTrigger>
            <SelectContent
              className="rounded-xl p-1 ai-dropdown-enter max-h-[min(60vh,420px)]"
              position="popper"
              sideOffset={6}
            >
              {toolsInCat.map((t) => {
                const isActive = t.id === tool;
                return (
                  <SelectItem
                    key={t.id}
                    value={t.id}
                    className={`
                      relative rounded-lg cursor-pointer py-2.5 pr-9
                      transition-all duration-200
                      ${isActive ? "bg-slate-50" : "hover:bg-slate-50"}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${t.gradient} text-white shadow-sm shrink-0`}
                      >
                        {t.icon}
                      </span>
                      <span className="flex flex-col leading-tight">
                        <span className="font-semibold text-slate-900 text-sm">
                          {t.label}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {t.desc}
                        </span>
                      </span>
                      {isActive && (
                        <Check
                          className={`w-4 h-4 ml-auto ${activeCat.textClass}`}
                        />
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* ───────────────────────────────────────────────────────────────
          TOOL CONTENT
          - Re-mounts on tool switch (key={tool}) so animations replay
          - Staggered entrance via ai-enter-up
      ─────────────────────────────────────────────────────────────── */}
      <div key={tool} className="ai-enter-up" style={{ animationDuration: "0.45s" }}>
        {tool === "icd10" && <ICD10Tab />}
        {tool === "triage" && <TriageTab />}
        {tool === "dose" && <DoseTab />}
        {tool === "anomaly" && <AnomalyTab />}
        {tool === "drug_interactions" && <DrugInteractionsTab />}
        {tool === "clinical_summary" && <ClinicalSummaryTab />}
        {tool === "risk_stratification" && <RiskStratificationTab />}
        {tool === "radiology" && <RadiologyTab />}
        {tool === "discharge_gen" && <DischargeGenTab />}
        {tool === "prescription_check" && <PrescriptionCheckTab />}
      </div>
    </div>
  );
}

// =====================================================================
// SHARED COMPONENTS — premium look + mobile-optimised
// =====================================================================
function LoadingCard({ text = "Analyzing..." }: { text?: string }) {
  return (
    <Card className="border-violet-200 shadow-md sm:shadow-lg sm:shadow-violet-500/10 overflow-hidden">
      <CardContent className="p-6 sm:p-8 text-center">
        {/* Concentric spinner — two rings rotating in opposite directions (desktop)
            On mobile the rings still rotate but use the cheaper ai-ring-spin CSS
            instead of the spinning gradient circle */}
        <div className="relative inline-flex items-center justify-center mb-4 w-16 h-16 sm:w-20 sm:h-20">
          {/* Outer ring — desktop only */}
          <div
            className="hidden sm:block absolute inset-0 rounded-full border-4 border-violet-200 border-t-violet-600 ai-ring-spin"
            aria-hidden
          />
          {/* Inner ring (reverse) — desktop only */}
          <div
            className="hidden sm:block absolute inset-2 rounded-full border-4 border-purple-100 border-b-purple-500 ai-ring-spin-reverse"
            aria-hidden
          />
          {/* Mobile fallback — simple single ring */}
          <div
            className="sm:hidden absolute inset-0 rounded-full border-4 border-violet-200 border-t-violet-600 ai-ring-spin"
            aria-hidden
          />
          {/* Center sparkle */}
          <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-md">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        </div>
        <p className="text-sm font-medium text-violet-700 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {text}
        </p>
      </CardContent>
    </Card>
  );
}

function ResultCard({ children }: { children: React.ReactNode }) {
  return (
    <Card
      className="shadow-md sm:shadow-lg ai-enter-up border-slate-200 overflow-hidden"
      style={{ animationDuration: "0.5s" }}
    >
      <CardContent className="p-4 sm:p-5 space-y-4">{children}</CardContent>
    </Card>
  );
}

function AIButton({ onClick, disabled, loading, icon, label, loadingText, gradient }: {
  onClick: () => void; disabled: boolean; loading: boolean; icon: React.ReactNode; label: string; loadingText: string; gradient: string;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        bg-gradient-to-r ${gradient} hover:opacity-90 gap-2
        h-11 sm:h-12 font-semibold shadow-md
        transition-all duration-200
        hover:scale-[1.02] active:scale-[0.98]
        touch-manipulation relative overflow-hidden
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      {/* Subtle inner shimmer on hover — desktop only */}
      <span className="ai-shimmer-bg absolute inset-0 pointer-events-none opacity-0 hover:opacity-100" />
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> {loadingText}
        </>
      ) : (
        <>
          {icon} {label}
        </>
      )}
    </Button>
  );
}

function ReasoningBlock({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="rounded-lg bg-amber-50/60 border border-amber-100 p-3 text-xs text-slate-600 transition-all hover:bg-amber-50">
      <div className="flex items-start gap-2">
        <div className="shrink-0 w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center">
          <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <div>
          <span className="font-bold text-amber-700 uppercase text-[10px] tracking-wider block mb-1">
            AI Reasoning
          </span>
          {text}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${color} relative`}
      >
        {icon}
      </div>
      <h3 className="text-sm font-bold text-slate-900 tracking-tight">{title}</h3>
    </div>
  );
}

// =====================================================================
// TOOL 1: ICD-10 SUGGESTER (existing — preserved)
// =====================================================================
function ICD10Tab() {
  const [freeText, setFreeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!freeText.trim()) { toast.error("Please enter a diagnosis description"); return; }
    setLoading(true); setResult(null);
    try { setResult(await fetchJson("/api/ai/icd10-suggest", { freeText })); } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <Card className="border-violet-200 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<Brain className="w-4 h-4 text-white" />} title="Free-text Diagnosis" color="bg-gradient-to-br from-violet-500 to-purple-700" />
        <Textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={3} placeholder="e.g., Patient presents with fever, headache, and neck stiffness for 2 days..." className="resize-none text-sm" />
        <AIButton onClick={handle} disabled={!freeText.trim()} loading={loading} icon={<Brain className="w-4 h-4" />} label="Suggest ICD-10 Codes" loadingText="Analyzing..." gradient="from-violet-600 to-purple-700" />
      </CardContent></Card>
      {loading && <LoadingCard text="Suggesting ICD-10 codes..." />}
      {result?.suggestions && !loading && (
        <ResultCard>
          <SectionHeader icon={<Lightbulb className="w-4 h-4 text-violet-600" />} title="Suggested ICD-10 Codes" color="bg-violet-100" />
          <div className="space-y-2">
            {result.suggestions.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 hover:bg-violet-50/50 transition-all" style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.08}s both` }}>
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 shrink-0">
                    <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="16" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                      <circle cx="18" cy="18" r="16" fill="none" stroke={s.confidence > 0.8 ? "#10b981" : s.confidence > 0.5 ? "#f59e0b" : "#94a3b8"} strokeWidth="3" strokeDasharray={`${s.confidence * 100} 100`} strokeLinecap="round" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{Math.round(s.confidence * 100)}</span>
                  </div>
                  <div>
                    <code className="text-sm font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded">{s.code}</code>
                    <p className="text-sm text-slate-700 mt-1">{s.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <ReasoningBlock text={result.reasoning} />
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TOOL 2: TRIAGE SCORER (existing — preserved)
// =====================================================================
function TriageTab() {
  const [input, setInput] = useState({ chiefComplaint: "", temperature: "", pulse: "", respiratoryRate: "", systolicBp: "", diastolicBp: "", oxygenSaturation: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!input.chiefComplaint.trim()) { toast.error("Please enter a chief complaint"); return; }
    setLoading(true); setResult(null);
    try {
      const vitals = Object.fromEntries(Object.entries(input).map(([k, v]) => k === "chiefComplaint" ? [k, v || undefined] : [k, v ? Number(v) : undefined]));
      setResult(await fetchJson("/api/ai/triage-score", vitals));
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  const colorMap: Record<string, string> = { red: "from-red-500 to-rose-700", orange: "from-orange-400 to-amber-600", yellow: "from-yellow-400 to-amber-500", green: "from-green-400 to-emerald-600", blue: "from-blue-400 to-cyan-600" };
  return (
    <div className="space-y-4">
      <Card className="border-blue-200 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<Stethoscope className="w-4 h-4 text-white" />} title="Patient Assessment" color="bg-gradient-to-br from-blue-500 to-cyan-700" />
        <div><Label className="text-xs font-medium text-slate-600">Chief Complaint</Label>
          <Input value={input.chiefComplaint} onChange={(e) => setInput({ ...input, chiefComplaint: e.target.value })} placeholder="e.g., Chest pain and shortness of breath" className="mt-1" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[{ k: "temperature", l: "Temp (°C)", p: "37.0" }, { k: "pulse", l: "Pulse (bpm)", p: "80" }, { k: "respiratoryRate", l: "Resp Rate", p: "16" }, { k: "systolicBp", l: "Systolic BP", p: "120" }, { k: "diastolicBp", l: "Diastolic BP", p: "80" }, { k: "oxygenSaturation", l: "O2 Sat (%)", p: "98" }].map(f => (
            <div key={f.k}><Label className="text-[10px] text-slate-500">{f.l}</Label>
              <Input type="number" value={(input as any)[f.k]} onChange={(e) => setInput({ ...input, [f.k]: e.target.value })} placeholder={f.p} className="mt-0.5 h-9 text-sm" /></div>
          ))}
        </div>
        <AIButton onClick={handle} disabled={!input.chiefComplaint.trim()} loading={loading} icon={<Stethoscope className="w-4 h-4" />} label="Score Triage" loadingText="Scoring..." gradient="from-blue-600 to-cyan-700" />
      </CardContent></Card>
      {loading && <LoadingCard text="Assessing triage acuity..." />}
      {result?.category && !loading && (
        <ResultCard>
          <div className="flex items-center gap-4">
            <div className={`relative w-16 h-16 rounded-full bg-gradient-to-br ${colorMap[result.color] || colorMap.blue} flex items-center justify-center text-3xl font-black text-white shadow-lg`} style={{ animation: "fadeInUp 0.5s ease-out" }}>
              {result.category}
              <div className="absolute inset-0 rounded-full bg-white/20 animate-ping" style={{ animationDuration: "2s" }} />
            </div>
            <div><p className="text-lg font-bold text-slate-900">Category {result.category} — {result.categoryLabel}</p><p className="text-sm text-slate-600 mt-0.5">{result.reasoning}</p></div>
          </div>
          {result.redFlags?.length > 0 && (<div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
            <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Red Flags</h4>
            <div className="space-y-1.5">{result.redFlags.map((f: string, i: number) => (<div key={i} className="text-sm text-rose-700 flex items-start gap-2" style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}><span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" /> {f}</div>))}</div>
          </div>)}
          {result.recommendations?.length > 0 && (<div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Recommendations</h4>
            <div className="space-y-1.5">{result.recommendations.map((r: string, i: number) => (<div key={i} className="text-sm text-emerald-700 flex items-start gap-2" style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {r}</div>))}</div>
          </div>)}
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TOOL 3: PEDIATRIC DOSE CHECK (existing — preserved)
// =====================================================================
function DoseTab() {
  const [input, setInput] = useState({ medicationName: "", prescribedDose: "", prescribedFrequency: "", patientWeightKg: "", patientAgeYears: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!input.medicationName.trim()) { toast.error("Please enter a medication name"); return; }
    setLoading(true); setResult(null);
    try { setResult(await fetchJson("/api/ai/dose-check", { ...input, patientWeightKg: input.patientWeightKg ? Number(input.patientWeightKg) : undefined, patientAgeYears: input.patientAgeYears ? Number(input.patientAgeYears) : undefined })); } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <Card className="border-emerald-200 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<Pill className="w-4 h-4 text-white" />} title="Prescription Details" color="bg-gradient-to-br from-emerald-500 to-teal-700" />
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs font-medium text-slate-600">Medication Name</Label><Input value={input.medicationName} onChange={(e) => setInput({ ...input, medicationName: e.target.value })} placeholder="e.g., Amoxicillin" className="mt-1" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Prescribed Dose</Label><Input value={input.prescribedDose} onChange={(e) => setInput({ ...input, prescribedDose: e.target.value })} placeholder="e.g., 5 mL (250mg)" className="mt-1" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Frequency</Label><Input value={input.prescribedFrequency} onChange={(e) => setInput({ ...input, prescribedFrequency: e.target.value })} placeholder="e.g., 3 times daily" className="mt-1" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Patient Weight (kg)</Label><Input type="number" value={input.patientWeightKg} onChange={(e) => setInput({ ...input, patientWeightKg: e.target.value })} placeholder="e.g., 12" className="mt-1" /></div>
        </div>
        <AIButton onClick={handle} disabled={!input.medicationName.trim()} loading={loading} icon={<Pill className="w-4 h-4" />} label="Check Dose Safety" loadingText="Checking..." gradient="from-emerald-600 to-teal-700" />
      </CardContent></Card>
      {loading && <LoadingCard text="Verifying dose safety..." />}
      {result?.isSafe !== undefined && !loading && (
        <ResultCard>
          <div className={`flex items-center gap-3 p-4 rounded-xl ${result.isSafe ? "bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200" : "bg-gradient-to-r from-rose-50 to-red-50 border border-rose-200"}`} style={{ animation: "fadeInUp 0.5s ease-out" }}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${result.isSafe ? "bg-emerald-500" : "bg-rose-500"} shadow-md`}>{result.isSafe ? <CheckCircle2 className="w-6 h-6 text-white" /> : <AlertTriangle className="w-6 h-6 text-white" />}</div>
            <div><p className={`text-lg font-bold ${result.isSafe ? "text-emerald-700" : "text-rose-700"}`}>{result.isSafe ? "Dose Appears Safe" : "Dose May Be Unsafe"}</p><p className="text-xs text-slate-500 mt-0.5">{result.isSafe ? "Within recommended dosing range" : "Outside recommended range — review needed"}</p></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.recommendedDoseRange && <div className="rounded-lg bg-slate-50 border border-slate-100 p-3"><Label className="text-[10px] font-bold text-slate-500 uppercase">Recommended Range</Label><p className="text-sm text-slate-700 mt-1">{result.recommendedDoseRange}</p></div>}
            {result.calculatedDosePerKg && <div className="rounded-lg bg-slate-50 border border-slate-100 p-3"><Label className="text-[10px] font-bold text-slate-500 uppercase">Calculated Per Kg</Label><p className="text-sm text-slate-700 mt-1">{result.calculatedDosePerKg}</p></div>}
          </div>
          {result.warnings?.length > 0 && (<div className="rounded-lg bg-amber-50 border border-amber-200 p-3"><h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Warnings</h4><div className="space-y-1.5">{result.warnings.map((w: string, i: number) => (<div key={i} className="text-sm text-amber-700 flex items-start gap-2" style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}</div>))}</div></div>)}
          <ReasoningBlock text={result.reasoning} />
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TOOL 4: LAB ANOMALY DETECTION (existing — preserved)
// =====================================================================
function AnomalyTab() {
  const [resultsText, setResultsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!resultsText.trim()) { toast.error("Please enter lab results"); return; }
    setLoading(true); setResult(null);
    try {
      const lines = resultsText.trim().split("\n").filter(Boolean);
      const results = lines.map((line) => { const parts = line.split(/[,:]/).map((s) => s.trim()); return { testName: parts[0], resultValue: parts[1] || "", referenceRange: parts[2] || "" }; });
      setResult(await fetchJson("/api/ai/lab-anomaly", { results }));
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  const typeConfig: Record<string, { bg: string; border: string; badge: string; icon: string }> = {
    critical: { bg: "bg-rose-50", border: "border-rose-200", badge: "bg-rose-600 text-white", icon: "text-rose-600" },
    abnormal: { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-500 text-white", icon: "text-amber-600" },
    trend: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-500 text-white", icon: "text-blue-600" },
    potential_error: { bg: "bg-slate-50", border: "border-slate-200", badge: "bg-slate-500 text-white", icon: "text-slate-600" },
  };
  return (
    <div className="space-y-4">
      <Card className="border-fuchsia-200 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<FlaskConical className="w-4 h-4 text-white" />} title="Lab Results" color="bg-gradient-to-br from-fuchsia-500 to-pink-700" />
        <p className="text-xs text-slate-500">Enter one result per line: <code className="bg-slate-100 px-1.5 py-0.5 rounded">Test, Value, Reference Range</code></p>
        <Textarea value={resultsText} onChange={(e) => setResultsText(e.target.value)} rows={6} placeholder={"Hemoglobin, 4.5 g/dL, 13.5-17.5\nWBC, 25.0 x10^9/L, 4.0-11.0\nPlatelets, 45 x10^9/L, 150-400"} className="resize-none text-sm font-mono" />
        <AIButton onClick={handle} disabled={!resultsText.trim()} loading={loading} icon={<FlaskConical className="w-4 h-4" />} label="Detect Anomalies" loadingText="Analyzing..." gradient="from-fuchsia-600 to-pink-700" />
      </CardContent></Card>
      {loading && <LoadingCard text="Detecting anomalies..." />}
      {result?.anomalies && !loading && (
        <ResultCard>
          <SectionHeader icon={<Activity className="w-4 h-4 text-fuchsia-600" />} title="Analysis Results" color="bg-fuchsia-100" />
          {result.anomalies.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200" style={{ animation: "fadeInUp 0.4s ease-out" }}>
              <CheckCircle2 className="w-6 h-6 text-emerald-600" /><div><p className="text-sm font-bold text-emerald-700">All results within normal limits</p><p className="text-xs text-emerald-600">No anomalies detected</p></div>
            </div>
          ) : (<div className="space-y-2">
            {result.anomalies.map((a: any, i: number) => {
              const tc = typeConfig[a.type] || typeConfig.abnormal;
              return (<div key={i} className={`p-3 rounded-lg border ${tc.border} ${tc.bg} group`} style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.1}s both` }}>
                <div className="flex items-center justify-between mb-1.5"><span className="font-medium text-slate-900 flex items-center gap-2"><AlertTriangle className={`w-4 h-4 ${tc.icon}`} /> {a.testName}</span><Badge className={`text-[10px] ${tc.badge}`}>{a.type.replace(/_/g, " ")}</Badge></div>
                <p className="text-sm text-slate-700">{a.description}</p>
                <div className="mt-2 flex items-start gap-2 text-xs text-slate-500"><ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span><span className="font-medium text-slate-600">Recommendation:</span> {a.recommendation}</span></div>
              </div>);
            })}
          </div>)}
          {result.patterns?.length > 0 && (<div className="rounded-lg bg-violet-50 border border-violet-200 p-3"><h4 className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-2 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Cross-Test Patterns</h4><div className="space-y-1.5">{result.patterns.map((p: string, i: number) => (<div key={i} className="text-sm text-violet-700 flex items-start gap-2" style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}><Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {p}</div>))}</div></div>)}
          {result.overallAssessment && (<div className="rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 p-3"><div className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-slate-600" /><p className="text-sm text-slate-700"><span className="font-bold">Assessment:</span> {result.overallAssessment}</p></div></div>)}
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TOOL 5: DRUG INTERACTION CHECKER (NEW)
// =====================================================================
function DrugInteractionsTab() {
  const [meds, setMeds] = useState("");
  const [allergies, setAllergies] = useState("");
  const [conditions, setConditions] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!meds.trim()) { toast.error("Please enter medications"); return; }
    setLoading(true); setResult(null);
    try {
      const medications = meds.split("\n").filter(Boolean).map(l => { const p = l.split(",").map(s => s.trim()); return { name: p[0], dose: p[1], frequency: p[2] }; });
      setResult(await fetchJson("/api/ai/drug-interactions", { medications, allergies: allergies.split(",").map(s => s.trim()).filter(Boolean), conditions: conditions.split(",").map(s => s.trim()).filter(Boolean) }));
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  const sevColors: Record<string, string> = { mild: "bg-blue-50 border-blue-200 text-blue-700", moderate: "bg-amber-50 border-amber-200 text-amber-700", severe: "bg-rose-50 border-rose-200 text-rose-700", contraindicated: "bg-red-900 text-white" };
  return (
    <div className="space-y-4">
      <Card className="border-rose-200 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<GitCompare className="w-4 h-4 text-white" />} title="Drug Interaction Checker" color="bg-gradient-to-br from-rose-500 to-pink-700" />
        <div><Label className="text-xs font-medium text-slate-600">Medications (one per line: Name, Dose, Frequency)</Label>
          <Textarea value={meds} onChange={(e) => setMeds(e.target.value)} rows={4} placeholder={"Amoxicillin, 500mg, 3x daily\nIbuprofen, 400mg, 2x daily\nMetformin, 1000mg, 2x daily"} className="resize-none text-sm mt-1" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs font-medium text-slate-600">Allergies (comma-separated)</Label><Input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Penicillin, Sulfa" className="mt-1" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Conditions (comma-separated)</Label><Input value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Diabetes, Hypertension" className="mt-1" /></div>
        </div>
        <AIButton onClick={handle} disabled={!meds.trim()} loading={loading} icon={<GitCompare className="w-4 h-4" />} label="Check Interactions" loadingText="Checking..." gradient="from-rose-600 to-pink-700" />
      </CardContent></Card>
      {loading && <LoadingCard text="Checking drug interactions..." />}
      {result?.interactions && !loading && (
        <ResultCard>
          <SectionHeader icon={<AlertTriangle className="w-4 h-4 text-rose-600" />} title="Interaction Results" color="bg-rose-100" />
          {result.interactions.length === 0 ? (<div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200"><CheckCircle2 className="w-6 h-6 text-emerald-600" /><p className="text-sm font-bold text-emerald-700">No significant drug interactions found</p></div>) : (
            <div className="space-y-2">
              {result.interactions.map((ix: any, i: number) => (
                <div key={i} className={`p-3 rounded-lg border ${sevColors[ix.severity] || sevColors.moderate}`} style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.1}s both` }}>
                  <div className="flex items-center justify-between mb-1"><span className="font-medium text-slate-900">{ix.drug1} + {ix.drug2}</span><Badge className={`text-[10px] ${ix.severity === "contraindicated" ? "bg-red-900 text-white" : ix.severity === "severe" ? "bg-rose-600 text-white" : ix.severity === "moderate" ? "bg-amber-500 text-white" : "bg-blue-500 text-white"}`}>{ix.severity}</Badge></div>
                  <p className="text-sm text-slate-700">{ix.clinicalEffect}</p>
                  {ix.management && <p className="text-xs text-slate-500 mt-1"><strong>Management:</strong> {ix.management}</p>}
                </div>
              ))}
            </div>
          )}
          {result.allergyWarnings?.length > 0 && (<div className="rounded-lg bg-rose-50 border border-rose-200 p-3"><h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2">Allergy Warnings</h4><div className="space-y-1.5">{result.allergyWarnings.map((w: any, i: number) => (<div key={i} className="text-sm text-rose-700 flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span><strong>{w.drug}</strong> conflicts with allergy <strong>{w.allergen}</strong> — {w.recommendation}</span></div>))}</div></div>)}
          <ReasoningBlock text={result.reasoning} />
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TOOL 6: CLINICAL SUMMARY GENERATOR (NEW)
// =====================================================================
function ClinicalSummaryTab() {
  const [input, setInput] = useState({ diagnoses: "", medications: "", labResults: "", vitals: "", procedures: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!input.diagnoses.trim()) { toast.error("Please enter at least diagnoses"); return; }
    setLoading(true); setResult(null);
    try { setResult(await fetchJson("/api/ai/clinical-summary", input)); } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <Card className="border-indigo-200 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<ClipboardList className="w-4 h-4 text-white" />} title="Clinical Data" color="bg-gradient-to-br from-indigo-500 to-blue-700" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><Label className="text-xs font-medium text-slate-600">Diagnoses</Label><Textarea value={input.diagnoses} onChange={(e) => setInput({ ...input, diagnoses: e.target.value })} rows={2} placeholder="Type 2 Diabetes, Hypertension" className="mt-1 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Medications</Label><Textarea value={input.medications} onChange={(e) => setInput({ ...input, medications: e.target.value })} rows={2} placeholder="Metformin 1000mg BD, Lisinopril 10mg OD" className="mt-1 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Lab Results</Label><Textarea value={input.labResults} onChange={(e) => setInput({ ...input, labResults: e.target.value })} rows={2} placeholder="HbA1c 8.5%, Creatinine 120" className="mt-1 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Vitals</Label><Textarea value={input.vitals} onChange={(e) => setInput({ ...input, vitals: e.target.value })} rows={2} placeholder="BP 150/90, HR 82, T 36.8" className="mt-1 text-sm" /></div>
        </div>
        <AIButton onClick={handle} disabled={!input.diagnoses.trim()} loading={loading} icon={<ClipboardList className="w-4 h-4" />} label="Generate Summary" loadingText="Generating..." gradient="from-indigo-600 to-blue-700" />
      </CardContent></Card>
      {loading && <LoadingCard text="Generating clinical summary..." />}
      {result?.summary && !loading && (
        <ResultCard>
          <SectionHeader icon={<FileText className="w-4 h-4 text-indigo-600" />} title="Clinical Summary" color="bg-indigo-100" />
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap">{result.summary}</div>
          {result.keyFindings?.length > 0 && <div><Label className="text-xs font-bold text-slate-500 uppercase">Key Findings</Label><div className="mt-1 space-y-1">{result.keyFindings.map((f: string, i: number) => <div key={i} className="text-sm text-slate-700 flex items-start gap-2" style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-600" /> {f}</div>)}</div></div>}
          {result.recommendations?.length > 0 && <div><Label className="text-xs font-bold text-slate-500 uppercase">Recommendations</Label><div className="mt-1 space-y-1">{result.recommendations.map((r: string, i: number) => <div key={i} className="text-sm text-slate-700 flex items-start gap-2" style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}><ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" /> {r}</div>)}</div></div>}
          {result.handoverNote && <div className="rounded-lg bg-blue-50 border border-blue-200 p-3"><Label className="text-xs font-bold text-blue-700 uppercase">Handover Note</Label><p className="text-sm text-slate-700 mt-1">{result.handoverNote}</p></div>}
          <ReasoningBlock text={result.referralLetter} />
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TOOL 7: PATIENT RISK STRATIFICATION (NEW)
// =====================================================================
function RiskStratificationTab() {
  const [comorbidities, setComorbidities] = useState("");
  const [medications, setMedications] = useState("");
  const [diagnoses, setDiagnoses] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!comorbidities.trim()) { toast.error("Please enter comorbidities"); return; }
    setLoading(true); setResult(null);
    try { setResult(await fetchJson("/api/ai/risk-stratification", { comorbidities: comorbidities.split(",").map(s => s.trim()).filter(Boolean), currentMedications: medications.split(",").map(s => s.trim()).filter(Boolean), recentDiagnoses: diagnoses.split(",").map(s => s.trim()).filter(Boolean) })); } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  const riskColors: Record<string, string> = { low: "bg-emerald-500", moderate: "bg-amber-500", high: "bg-rose-500", very_high: "bg-red-700" };
  return (
    <div className="space-y-4">
      <Card className="border-amber-200 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<Activity className="w-4 h-4 text-white" />} title="Patient Risk Assessment" color="bg-gradient-to-br from-amber-500 to-orange-700" />
        <div className="space-y-2">
          <div><Label className="text-xs font-medium text-slate-600">Comorbidities (comma-separated)</Label><Input value={comorbidities} onChange={(e) => setComorbidities(e.target.value)} placeholder="Diabetes, Hypertension, CKD" className="mt-1" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Current Medications</Label><Input value={medications} onChange={(e) => setMedications(e.target.value)} placeholder="Metformin, Insulin, Lisinopril" className="mt-1" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Recent Diagnoses</Label><Input value={diagnoses} onChange={(e) => setDiagnoses(e.target.value)} placeholder="Pneumonia, UTI" className="mt-1" /></div>
        </div>
        <AIButton onClick={handle} disabled={!comorbidities.trim()} loading={loading} icon={<Activity className="w-4 h-4" />} label="Assess Risk" loadingText="Assessing..." gradient="from-amber-600 to-orange-700" />
      </CardContent></Card>
      {loading && <LoadingCard text="Stratifying patient risk..." />}
      {result?.overallRisk && !loading && (
        <ResultCard>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200"><div className={`w-12 h-12 rounded-full ${riskColors[result.overallRisk] || riskColors.moderate} flex items-center justify-center shadow-md`}><AlertTriangle className="w-6 h-6 text-white" /></div><div><p className="text-lg font-bold text-slate-900 capitalize">{result.overallRisk.replace(/_/g, " ")} Risk</p><p className="text-xs text-slate-500">Overall patient risk assessment</p></div></div>
          {result.riskScores?.length > 0 && (<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{result.riskScores.map((r: any, i: number) => (<div key={i} className={`p-3 rounded-lg border ${r.level === "high" || r.level === "very_high" ? "border-rose-200 bg-rose-50" : r.level === "moderate" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`} style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-900 capitalize">{r.category}</span><Badge className={`text-[10px] ${riskColors[r.level] || riskColors.moderate} text-white`}>{r.level}</Badge></div><div className="mt-1 flex items-center gap-2"><div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full ${riskColors[r.level] || riskColors.moderate}`} style={{ width: `${Math.min(100, r.score * 10)}%` }} /></div><span className="text-xs font-bold text-slate-700">{r.score}</span></div>{r.factors?.length > 0 && <p className="text-[10px] text-slate-500 mt-1">{r.factors.join(", ")}</p>}</div>))}</div>)}
          <ReasoningBlock text={result.reasoning} />
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TOOL 8: RADIOLOGY REPORT INTERPRETER (NEW)
// =====================================================================
function RadiologyTab() {
  const [reportText, setReportText] = useState("");
  const [modality, setModality] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!reportText.trim()) { toast.error("Please enter the radiology report text"); return; }
    setLoading(true); setResult(null);
    try { setResult(await fetchJson("/api/ai/radiology-interpret", { reportText, modality })); } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <Card className="border-cyan-200 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<ScanLine className="w-4 h-4 text-white" />} title="Radiology Report" color="bg-gradient-to-br from-cyan-500 to-blue-700" />
        <div><Label className="text-xs font-medium text-slate-600">Modality (optional)</Label><Input value={modality} onChange={(e) => setModality(e.target.value)} placeholder="X-ray, CT, MRI, Ultrasound" className="mt-1" /></div>
        <div><Label className="text-xs font-medium text-slate-600">Report Text</Label><Textarea value={reportText} onChange={(e) => setReportText(e.target.value)} rows={6} placeholder="Paste the full radiology report text here..." className="resize-none text-sm mt-1" /></div>
        <AIButton onClick={handle} disabled={!reportText.trim()} loading={loading} icon={<ScanLine className="w-4 h-4" />} label="Interpret Report" loadingText="Interpreting..." gradient="from-cyan-600 to-blue-700" />
      </CardContent></Card>
      {loading && <LoadingCard text="Interpreting radiology report..." />}
      {result?.findings && !loading && (
        <ResultCard>
          <SectionHeader icon={<ScanLine className="w-4 h-4 text-cyan-600" />} title="Structured Findings" color="bg-cyan-100" />
          {result.criticalFindings?.length > 0 && (<div className="rounded-lg bg-rose-50 border border-rose-200 p-3"><h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Critical Findings</h4><div className="space-y-1">{result.criticalFindings.map((f: string, i: number) => <div key={i} className="text-sm text-rose-700 flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {f}</div>)}</div></div>)}
          {result.findings.length > 0 && (<div className="space-y-2">{result.findings.map((f: any, i: number) => (<div key={i} className="p-3 rounded-lg border border-slate-200 bg-slate-50" style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}><div className="flex items-center justify-between"><span className="font-medium text-slate-900">{f.finding}</span>{f.severity && <Badge className={`text-[10px] ${f.severity === "critical" ? "bg-rose-600 text-white" : f.severity === "moderate" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"}`}>{f.severity}</Badge>}</div><p className="text-sm text-slate-600 mt-1">{f.description}</p>{f.location && <p className="text-xs text-slate-500 mt-0.5">Location: {f.location}</p>}</div>))}</div>)}
          {result.impression && <div className="rounded-lg bg-blue-50 border border-blue-200 p-3"><Label className="text-xs font-bold text-blue-700 uppercase">Impression</Label><p className="text-sm text-slate-700 mt-1">{result.impression}</p></div>}
          {result.differentialDiagnosis?.length > 0 && <div><Label className="text-xs font-bold text-slate-500 uppercase">Differential Diagnosis</Label><div className="flex flex-wrap gap-1.5 mt-1">{result.differentialDiagnosis.map((d: string, i: number) => <Badge key={i} variant="outline" className="text-xs">{d}</Badge>)}</div></div>}
          {result.recommendedActions?.length > 0 && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3"><h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Recommended Actions</h4><div className="space-y-1">{result.recommendedActions.map((a: string, i: number) => <div key={i} className="text-sm text-emerald-700 flex items-start gap-2"><ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {a}</div>)}</div></div>}
          <ReasoningBlock text={result.reasoning} />
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TOOL 9: DISCHARGE SUMMARY GENERATOR (NEW)
// =====================================================================
function DischargeGenTab() {
  const [input, setInput] = useState({ diagnoses: "", labResults: "", medications: "", consultations: "", procedures: "", vitals: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!input.diagnoses.trim()) { toast.error("Please enter at least diagnoses"); return; }
    setLoading(true); setResult(null);
    try { setResult(await fetchJson("/api/ai/discharge-generate", input)); } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <Card className="border-slate-300 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<FileText className="w-4 h-4 text-white" />} title="Encounter Data" color="bg-gradient-to-br from-slate-600 to-slate-800" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><Label className="text-xs font-medium text-slate-600">Diagnoses</Label><Textarea value={input.diagnoses} onChange={(e) => setInput({ ...input, diagnoses: e.target.value })} rows={2} placeholder="Community-acquired pneumonia" className="mt-1 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Lab Results</Label><Textarea value={input.labResults} onChange={(e) => setInput({ ...input, labResults: e.target.value })} rows={2} placeholder="WBC 14.5, CRP 85, CXR: RLL infiltrate" className="mt-1 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Medications</Label><Textarea value={input.medications} onChange={(e) => setInput({ ...input, medications: e.target.value })} rows={2} placeholder="Ceftriaxone 2g IV, Azithromycin 500mg" className="mt-1 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Consultations</Label><Textarea value={input.consultations} onChange={(e) => setInput({ ...input, consultations: e.target.value })} rows={2} placeholder="ID consult for antibiotic stewardship" className="mt-1 text-sm" /></div>
        </div>
        <AIButton onClick={handle} disabled={!input.diagnoses.trim()} loading={loading} icon={<FileText className="w-4 h-4" />} label="Generate Discharge Summary" loadingText="Generating..." gradient="from-slate-600 to-slate-800" />
      </CardContent></Card>
      {loading && <LoadingCard text="Generating discharge summary..." />}
      {result?.summary && !loading && (
        <ResultCard>
          <SectionHeader icon={<FileText className="w-4 h-4 text-slate-600" />} title="Generated Discharge Summary" color="bg-slate-100" />
          <div className="space-y-3">
            {result.admissionDiagnosis && <div><Label className="text-xs font-bold text-slate-500 uppercase">Admission Diagnosis</Label><p className="text-sm text-slate-700 mt-0.5">{result.admissionDiagnosis}</p></div>}
            {result.dischargeDiagnosis && <div><Label className="text-xs font-bold text-slate-500 uppercase">Discharge Diagnosis</Label><p className="text-sm text-slate-700 mt-0.5">{result.dischargeDiagnosis}</p></div>}
            {result.clinicalCourse && <div><Label className="text-xs font-bold text-slate-500 uppercase">Clinical Course</Label><p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{result.clinicalCourse}</p></div>}
            {result.investigationsSummary && <div><Label className="text-xs font-bold text-slate-500 uppercase">Investigations Summary</Label><p className="text-sm text-slate-700 mt-0.5">{result.investigationsSummary}</p></div>}
            {result.treatmentSummary && <div><Label className="text-xs font-bold text-slate-500 uppercase">Treatment Summary</Label><p className="text-sm text-slate-700 mt-0.5">{result.treatmentSummary}</p></div>}
            {result.dischargeMedications?.length > 0 && <div><Label className="text-xs font-bold text-slate-500 uppercase">Discharge Medications</Label><div className="flex flex-wrap gap-1.5 mt-1">{result.dischargeMedications.map((m: string, i: number) => <Badge key={i} variant="outline" className="text-xs">{m}</Badge>)}</div></div>}
            {result.followUpPlan && <div><Label className="text-xs font-bold text-slate-500 uppercase">Follow-Up Plan</Label><p className="text-sm text-slate-700 mt-0.5">{result.followUpPlan}</p></div>}
            {result.patientInstructions && <div><Label className="text-xs font-bold text-slate-500 uppercase">Patient Instructions</Label><p className="text-sm text-slate-700 mt-0.5">{result.patientInstructions}</p></div>}
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3"><Label className="text-xs font-bold text-slate-500 uppercase">Full Summary</Label><p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{result.summary}</p></div>
          </div>
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TOOL 10: PRESCRIPTION ERROR DETECTOR (NEW)
// =====================================================================
function PrescriptionCheckTab() {
  const [prescriptions, setPrescriptions] = useState("");
  const [allergies, setAllergies] = useState("");
  const [currentMeds, setCurrentMeds] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handle = async () => {
    if (!prescriptions.trim()) { toast.error("Please enter prescriptions"); return; }
    setLoading(true); setResult(null);
    try {
      const rx = prescriptions.split("\n").filter(Boolean).map(l => { const p = l.split(",").map(s => s.trim()); return { medication: p[0], dose: p[1], route: p[2], frequency: p[3] }; });
      setResult(await fetchJson("/api/ai/prescription-check", { prescriptions: rx, allergies: allergies.split(",").map(s => s.trim()).filter(Boolean), currentMedications: currentMeds.split(",").map(s => s.trim()).filter(Boolean) }));
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  const typeIcons: Record<string, React.ReactNode> = { dose_error: <AlertTriangle className="w-4 h-4 text-amber-600" />, drug_interaction: <GitCompare className="w-4 h-4 text-rose-600" />, allergy_conflict: <ShieldCheck className="w-4 h-4 text-rose-600" />, duplicate_therapy: <Copy className="w-4 h-4 text-amber-600" />, contraindication: <XCircle className="w-4 h-4 text-rose-600" />, inappropriate_route: <Pill className="w-4 h-4 text-amber-600" />, monitoring_required: <Activity className="w-4 h-4 text-blue-600" /> };
  return (
    <div className="space-y-4">
      <Card className="border-orange-200 shadow-md"><CardContent className="p-5 space-y-3">
        <SectionHeader icon={<ShieldCheck className="w-4 h-4 text-white" />} title="Prescription Safety Check" color="bg-gradient-to-br from-orange-500 to-red-700" />
        <div><Label className="text-xs font-medium text-slate-600">Prescriptions (one per line: Medication, Dose, Route, Frequency)</Label>
          <Textarea value={prescriptions} onChange={(e) => setPrescriptions(e.target.value)} rows={4} placeholder={"Amoxicillin, 500mg, oral, 3x daily\nIbuprofen, 400mg, oral, 2x daily"} className="resize-none text-sm mt-1" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs font-medium text-slate-600">Allergies</Label><Input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Penicillin" className="mt-1" /></div>
          <div><Label className="text-xs font-medium text-slate-600">Current Medications</Label><Input value={currentMeds} onChange={(e) => setCurrentMeds(e.target.value)} placeholder="Warfarin, Metformin" className="mt-1" /></div>
        </div>
        <AIButton onClick={handle} disabled={!prescriptions.trim()} loading={loading} icon={<ShieldCheck className="w-4 h-4" />} label="Check Prescription Safety" loadingText="Checking..." gradient="from-orange-600 to-red-700" />
      </CardContent></Card>
      {loading && <LoadingCard text="Checking prescription safety..." />}
      {result?.errors !== undefined && !loading && (
        <ResultCard>
          <div className={`flex items-center gap-3 p-4 rounded-xl ${result.overallSafety === "safe" ? "bg-emerald-50 border border-emerald-200" : result.overallSafety === "caution" ? "bg-amber-50 border border-amber-200" : "bg-rose-50 border border-rose-200"}`} style={{ animation: "fadeInUp 0.5s ease-out" }}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md ${result.overallSafety === "safe" ? "bg-emerald-500" : result.overallSafety === "caution" ? "bg-amber-500" : "bg-rose-500"}`}>{result.overallSafety === "safe" ? <CheckCircle2 className="w-6 h-6 text-white" /> : <AlertTriangle className="w-6 h-6 text-white" />}</div>
            <div><p className={`text-lg font-bold capitalize ${result.overallSafety === "safe" ? "text-emerald-700" : result.overallSafety === "caution" ? "text-amber-700" : "text-rose-700"}`}>{result.overallSafety}</p><p className="text-xs text-slate-500">{result.errors.length} issue(s) found</p></div>
          </div>
          {result.errors.length === 0 ? (<p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> No prescription errors detected</p>) : (
            <div className="space-y-2">{result.errors.map((e: any, i: number) => (
              <div key={i} className={`p-3 rounded-lg border ${e.severity === "contraindicated" || e.severity === "severe" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`} style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}>
                <div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2">{typeIcons[e.type] || <AlertTriangle className="w-4 h-4 text-amber-600" />}<span className="font-medium text-slate-900 capitalize">{e.type.replace(/_/g, " ")}</span></div><Badge className={`text-[10px] ${e.severity === "contraindicated" ? "bg-red-900 text-white" : e.severity === "severe" ? "bg-rose-600 text-white" : "bg-amber-500 text-white"}`}>{e.severity}</Badge></div>
                <p className="text-sm text-slate-700">{e.description}</p>
                <div className="mt-1 flex items-start gap-2 text-xs text-slate-500"><ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span><strong>{e.medication}:</strong> {e.recommendation}</span></div>
              </div>
            ))}</div>
          )}
          {result.safePrescriptions?.length > 0 && (<div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3"><h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Safe Prescriptions</h4><div className="flex flex-wrap gap-1.5">{result.safePrescriptions.map((s: string, i: number) => <Badge key={i} className="text-xs bg-emerald-100 text-emerald-700">{s}</Badge>)}</div></div>)}
          <ReasoningBlock text={result.reasoning} />
        </ResultCard>
      )}
    </div>
  );
}
