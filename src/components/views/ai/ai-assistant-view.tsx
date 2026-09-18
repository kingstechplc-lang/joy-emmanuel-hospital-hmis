"use client";

// =====================================================================
// AI ASSISTANT — Beautiful, animated, powerful clinical AI tools
// =====================================================================
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Stethoscope, Pill, FlaskConical, Loader2, Sparkles,
  AlertTriangle, CheckCircle2, Lightbulb, Activity, TrendingUp,
  Zap, ShieldCheck, ArrowRight, Wand2,
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

type Tab = "icd10" | "triage" | "dose" | "anomaly";

// Each tab has its own accent gradient
const TAB_CONFIG = {
  icd10: { gradient: "from-violet-600 to-purple-700", glow: "shadow-violet-500/20", ring: "ring-violet-200", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  triage: { gradient: "from-blue-600 to-cyan-700", glow: "shadow-blue-500/20", ring: "ring-blue-200", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  dose: { gradient: "from-emerald-600 to-teal-700", glow: "shadow-emerald-500/20", ring: "ring-emerald-200", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  anomaly: { gradient: "from-fuchsia-600 to-pink-700", glow: "shadow-fuchsia-500/20", ring: "ring-fuchsia-200", badge: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
} as const;

export function AIAssistantView() {
  const [tab, setTab] = useState<Tab>("icd10");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cfg = TAB_CONFIG[tab];

  return (
    <div className={`space-y-5 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      {/* ── Animated gradient header ──────────────────────────────── */}
      <div className={`rounded-2xl bg-gradient-to-r ${cfg.gradient} text-white p-6 md:p-8 shadow-2xl ${cfg.glow} relative overflow-hidden transition-all duration-500`}>
        {/* Animated background blobs */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-white opacity-10 blur-3xl rounded-full pointer-events-none animate-pulse" style={{ animationDuration: "6s" }} />
        <div className="absolute bottom-0 left-1/3 w-56 h-56 bg-white opacity-5 blur-3xl rounded-full pointer-events-none animate-pulse" style={{ animationDuration: "8s", animationDelay: "1s" }} />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              {/* Rotating gradient ring around the icon */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/40 via-transparent to-white/30 animate-spin" style={{ animationDuration: "4s" }} />
              <div className="relative w-12 h-12 bg-white/15 backdrop-blur rounded-xl ring-1 ring-white/30 shadow-lg flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">AI Clinical Assistant</h2>
              <p className="text-sm text-white/80 mt-0.5">AI-powered clinical decision support</p>
            </div>
          </div>
          <p className="text-xs text-white/60 max-w-lg leading-relaxed">
            All AI suggestions are advisory. The clinician always makes the final clinical decision.
            Powered by the configured AI provider and model.
          </p>
        </div>
      </div>

      {/* ── Tab selector — glassmorphism cards ────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TabCard active={tab === "icd10"} onClick={() => setTab("icd10")} icon={<Brain className="w-5 h-5" />}
          label="ICD-10 Suggester" desc="Code from free text" gradient="from-violet-500 to-purple-600" />
        <TabCard active={tab === "triage"} onClick={() => setTab("triage")} icon={<Stethoscope className="w-5 h-5" />}
          label="Triage Scorer" desc="SATS acuity scoring" gradient="from-blue-500 to-cyan-600" />
        <TabCard active={tab === "dose"} onClick={() => setTab("dose")} icon={<Pill className="w-5 h-5" />}
          label="Pediatric Dose" desc="Weight-based safety" gradient="from-emerald-500 to-teal-600" />
        <TabCard active={tab === "anomaly"} onClick={() => setTab("anomaly")} icon={<FlaskConical className="w-5 h-5" />}
          label="Lab Anomaly" desc="Pattern detection" gradient="from-fuchsia-500 to-pink-600" />
      </div>

      {/* ── Tab content with smooth transition ────────────────────── */}
      <div key={tab} className="fade-in-up" style={{ animationDuration: "0.4s" }}>
        {tab === "icd10" && <ICD10Tab />}
        {tab === "triage" && <TriageTab />}
        {tab === "dose" && <DoseTab />}
        {tab === "anomaly" && <AnomalyTab />}
      </div>
    </div>
  );
}

// =====================================================================
// TAB CARD — glassmorphism card with hover lift
// =====================================================================
function TabCard({ active, onClick, icon, label, desc, gradient }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; desc: string; gradient: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl p-4 text-left transition-all duration-300 ${
        active
          ? `bg-gradient-to-br ${gradient} text-white shadow-lg scale-[1.02]`
          : "bg-white border border-slate-200 text-slate-700 hover:shadow-md hover:scale-[1.01] hover:border-slate-300"
      }`}
    >
      {active && (
        <>
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 blur-2xl rounded-full" />
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 blur-xl rounded-full" />
        </>
      )}
      <div className="relative z-10">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 transition-all ${
          active ? "bg-white/20 backdrop-blur" : "bg-slate-100 group-hover:bg-slate-200"
        }`}>
          {icon}
        </div>
        <p className="text-sm font-bold">{label}</p>
        <p className={`text-xs mt-0.5 ${active ? "text-white/70" : "text-slate-500"}`}>{desc}</p>
      </div>
    </button>
  );
}

// =====================================================================
// SHARED COMPONENTS
// =====================================================================
function LoadingCard({ text = "Analyzing..." }: { text?: string }) {
  return (
    <Card className="border-violet-200 shadow-lg shadow-violet-500/10">
      <CardContent className="p-8 text-center">
        <div className="relative inline-flex items-center justify-center mb-4">
          {/* Pulsing rings */}
          <div className="absolute w-16 h-16 rounded-full bg-violet-200 opacity-60 animate-ping" />
          <div className="absolute w-12 h-12 rounded-full bg-violet-300 opacity-50 animate-pulse" />
          <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
        </div>
        <p className="text-sm font-medium text-violet-700 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {text}
        </p>
        <p className="text-xs text-slate-400 mt-1">AI is processing your request...</p>
      </CardContent>
    </Card>
  );
}

function ResultCard({ children, accent = "violet" }: { children: React.ReactNode; accent?: string }) {
  const colors: Record<string, string> = {
    violet: "border-violet-200 shadow-violet-500/10",
    blue: "border-blue-200 shadow-blue-500/10",
    emerald: "border-emerald-200 shadow-emerald-500/10",
    fuchsia: "border-fuchsia-200 shadow-fuchsia-500/10",
  };
  return (
    <Card className={`${colors[accent] || colors.violet} shadow-lg fade-in-up`} style={{ animationDuration: "0.5s" }}>
      <CardContent className="p-5 space-y-4">
        {children}
      </CardContent>
    </Card>
  );
}

function AIButton({ onClick, disabled, loading, icon, label, loadingText, gradient }: {
  onClick: () => void; disabled: boolean; loading: boolean; icon: React.ReactNode; label: string; loadingText: string; gradient: string;
}) {
  return (
    <Button onClick={onClick} disabled={disabled || loading}
      className={`bg-gradient-to-r ${gradient} hover:opacity-90 gap-2 h-11 font-semibold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]`}>
      {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {loadingText}</> : <>{icon} {label}</>}
    </Button>
  );
}

function ReasoningBlock({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600">
      <div className="flex items-start gap-2">
        <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
        <div><span className="font-bold text-slate-700">AI Reasoning:</span> {text}</div>
      </div>
    </div>
  );
}

// =====================================================================
// TAB 1: ICD-10 SUGGESTER
// =====================================================================
function ICD10Tab() {
  const [freeText, setFreeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSuggest = async () => {
    if (!freeText.trim()) { toast.error("Please enter a diagnosis description"); return; }
    setLoading(true); setResult(null);
    try {
      const data = await fetchJson("/api/ai/icd10-suggest", { freeText });
      setResult(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="border-violet-200 shadow-md">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <Label className="text-sm font-bold text-slate-900">Free-text Diagnosis</Label>
          </div>
          <Textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={3}
            placeholder="e.g., Patient presents with fever, headache, and neck stiffness for 2 days..."
            className="resize-none text-sm" />
          <AIButton onClick={handleSuggest} disabled={!freeText.trim()} loading={loading}
            icon={<Brain className="w-4 h-4" />} label="Suggest ICD-10 Codes" loadingText="Analyzing..."
            gradient="from-violet-600 to-purple-700" />
        </CardContent>
      </Card>

      {loading && <LoadingCard text="Suggesting ICD-10 codes..." />}

      {result?.suggestions && !loading && (
        <ResultCard accent="violet">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-violet-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Suggested ICD-10 Codes</h3>
          </div>
          <div className="space-y-2">
            {result.suggestions.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 hover:bg-violet-50/50 transition-all hover:border-violet-200 hover:shadow-sm group"
                style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.08}s both` }}>
                <div className="flex items-center gap-3">
                  {/* Confidence ring */}
                  <div className="relative w-10 h-10 shrink-0">
                    <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="16" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                      <circle cx="18" cy="18" r="16" fill="none" stroke={s.confidence > 0.8 ? "#10b981" : s.confidence > 0.5 ? "#f59e0b" : "#94a3b8"}
                        strokeWidth="3" strokeDasharray={`${s.confidence * 100} 100`} strokeLinecap="round" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">{Math.round(s.confidence * 100)}</span>
                  </div>
                  <div>
                    <code className="text-sm font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded group-hover:bg-violet-100 transition">{s.code}</code>
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
// TAB 2: TRIAGE SCORER
// =====================================================================
function TriageTab() {
  const [input, setInput] = useState({ chiefComplaint: "", temperature: "", pulse: "", respiratoryRate: "", systolicBp: "", diastolicBp: "", oxygenSaturation: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleScore = async () => {
    if (!input.chiefComplaint.trim()) { toast.error("Please enter a chief complaint"); return; }
    setLoading(true); setResult(null);
    try {
      const vitals = Object.fromEntries(
        Object.entries(input).map(([k, v]) => {
          if (k === "chiefComplaint") return [k, v || undefined];
          return [k, v ? Number(v) : undefined];
        })
      );
      const data = await fetchJson("/api/ai/triage-score", vitals);
      setResult(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const colorMap: Record<string, string> = {
    red: "from-red-500 to-rose-700",
    orange: "from-orange-400 to-amber-600",
    yellow: "from-yellow-400 to-amber-500",
    green: "from-green-400 to-emerald-600",
    blue: "from-blue-400 to-cyan-600",
  };

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 shadow-md">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-700 flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
            <Label className="text-sm font-bold text-slate-900">Patient Assessment</Label>
          </div>
          <div><Label className="text-xs font-medium text-slate-600">Chief Complaint</Label>
            <Input value={input.chiefComplaint} onChange={(e) => setInput({ ...input, chiefComplaint: e.target.value })}
              placeholder="e.g., Chest pain and shortness of breath" className="mt-1" /></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { k: "temperature", l: "Temp (°C)", p: "37.0" },
              { k: "pulse", l: "Pulse (bpm)", p: "80" },
              { k: "respiratoryRate", l: "Resp Rate", p: "16" },
              { k: "systolicBp", l: "Systolic BP", p: "120" },
              { k: "diastolicBp", l: "Diastolic BP", p: "80" },
              { k: "oxygenSaturation", l: "O2 Sat (%)", p: "98" },
            ].map((f) => (
              <div key={f.k}><Label className="text-[10px] text-slate-500">{f.l}</Label>
                <Input type="number" value={(input as any)[f.k]} onChange={(e) => setInput({ ...input, [f.k]: e.target.value })}
                  placeholder={f.p} className="mt-0.5 h-9 text-sm" /></div>
            ))}
          </div>
          <AIButton onClick={handleScore} disabled={!input.chiefComplaint.trim()} loading={loading}
            icon={<Stethoscope className="w-4 h-4" />} label="Score Triage" loadingText="Scoring..."
            gradient="from-blue-600 to-cyan-700" />
        </CardContent>
      </Card>

      {loading && <LoadingCard text="Assessing triage acuity..." />}

      {result?.category && !loading && (
        <ResultCard accent="blue">
          {/* Animated category badge */}
          <div className="flex items-center gap-4">
            <div className={`relative w-16 h-16 rounded-full bg-gradient-to-br ${colorMap[result.color] || colorMap.blue} flex items-center justify-center text-3xl font-black text-white shadow-lg`}
              style={{ animation: "fadeInUp 0.5s ease-out" }}>
              {result.category}
              <div className="absolute inset-0 rounded-full bg-white/20 animate-ping" style={{ animationDuration: "2s" }} />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-slate-900">Category {result.category} — {result.categoryLabel}</p>
              <p className="text-sm text-slate-600 mt-0.5">{result.reasoning}</p>
            </div>
          </div>

          {result.redFlags?.length > 0 && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
              <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Red Flags
              </h4>
              <div className="space-y-1.5">
                {result.redFlags.map((f: string, i: number) => (
                  <div key={i} className="text-sm text-rose-700 flex items-start gap-2"
                    style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" /> {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.recommendations?.length > 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
              <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Recommendations
              </h4>
              <div className="space-y-1.5">
                {result.recommendations.map((r: string, i: number) => (
                  <div key={i} className="text-sm text-emerald-700 flex items-start gap-2"
                    style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}>
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TAB 3: PEDIATRIC DOSE CHECKER
// =====================================================================
function DoseTab() {
  const [input, setInput] = useState({ medicationName: "", prescribedDose: "", prescribedFrequency: "", patientWeightKg: "", patientAgeYears: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCheck = async () => {
    if (!input.medicationName.trim()) { toast.error("Please enter a medication name"); return; }
    setLoading(true); setResult(null);
    try {
      const data = await fetchJson("/api/ai/dose-check", {
        ...input,
        patientWeightKg: input.patientWeightKg ? Number(input.patientWeightKg) : undefined,
        patientAgeYears: input.patientAgeYears ? Number(input.patientAgeYears) : undefined,
      });
      setResult(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="border-emerald-200 shadow-md">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <Pill className="w-4 h-4 text-white" />
            </div>
            <Label className="text-sm font-bold text-slate-900">Prescription Details</Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-medium text-slate-600">Medication Name</Label>
              <Input value={input.medicationName} onChange={(e) => setInput({ ...input, medicationName: e.target.value })} placeholder="e.g., Amoxicillin" className="mt-1" /></div>
            <div><Label className="text-xs font-medium text-slate-600">Prescribed Dose</Label>
              <Input value={input.prescribedDose} onChange={(e) => setInput({ ...input, prescribedDose: e.target.value })} placeholder="e.g., 5 mL (250mg)" className="mt-1" /></div>
            <div><Label className="text-xs font-medium text-slate-600">Frequency</Label>
              <Input value={input.prescribedFrequency} onChange={(e) => setInput({ ...input, prescribedFrequency: e.target.value })} placeholder="e.g., 3 times daily" className="mt-1" /></div>
            <div><Label className="text-xs font-medium text-slate-600">Patient Weight (kg)</Label>
              <Input type="number" value={input.patientWeightKg} onChange={(e) => setInput({ ...input, patientWeightKg: e.target.value })} placeholder="e.g., 12" className="mt-1" /></div>
          </div>
          <AIButton onClick={handleCheck} disabled={!input.medicationName.trim()} loading={loading}
            icon={<Pill className="w-4 h-4" />} label="Check Dose Safety" loadingText="Checking..."
            gradient="from-emerald-600 to-teal-700" />
        </CardContent>
      </Card>

      {loading && <LoadingCard text="Verifying dose safety..." />}

      {result?.isSafe !== undefined && !loading && (
        <ResultCard accent="emerald">
          {/* Animated safe/unsafe verdict */}
          <div className={`flex items-center gap-3 p-4 rounded-xl ${result.isSafe ? "bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200" : "bg-gradient-to-r from-rose-50 to-red-50 border border-rose-200"}`}
            style={{ animation: "fadeInUp 0.5s ease-out" }}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${result.isSafe ? "bg-emerald-500" : "bg-rose-500"} shadow-md`}>
              {result.isSafe ? <CheckCircle2 className="w-6 h-6 text-white" /> : <AlertTriangle className="w-6 h-6 text-white" />}
            </div>
            <div>
              <p className={`text-lg font-bold ${result.isSafe ? "text-emerald-700" : "text-rose-700"}`}>
                {result.isSafe ? "Dose Appears Safe" : "Dose May Be Unsafe"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{result.isSafe ? "Within recommended dosing range" : "Outside recommended range — review needed"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.recommendedDoseRange && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Recommended Range</Label>
                <p className="text-sm text-slate-700 mt-1">{result.recommendedDoseRange}</p>
              </div>
            )}
            {result.calculatedDosePerKg && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Calculated Per Kg</Label>
                <p className="text-sm text-slate-700 mt-1">{result.calculatedDosePerKg}</p>
              </div>
            )}
          </div>

          {result.warnings?.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Warnings
              </h4>
              <div className="space-y-1.5">
                {result.warnings.map((w: string, i: number) => (
                  <div key={i} className="text-sm text-amber-700 flex items-start gap-2"
                    style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}>
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
                  </div>
                ))}
              </div>
            </div>
          )}

          <ReasoningBlock text={result.reasoning} />
        </ResultCard>
      )}
    </div>
  );
}

// =====================================================================
// TAB 4: LAB ANOMALY DETECTION
// =====================================================================
function AnomalyTab() {
  const [resultsText, setResultsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAnalyze = async () => {
    if (!resultsText.trim()) { toast.error("Please enter lab results"); return; }
    setLoading(true); setResult(null);
    try {
      const lines = resultsText.trim().split("\n").filter(Boolean);
      const results = lines.map((line) => {
        const parts = line.split(/[,:]/).map((s) => s.trim());
        return { testName: parts[0], resultValue: parts[1] || "", referenceRange: parts[2] || "" };
      });
      const data = await fetchJson("/api/ai/lab-anomaly", { results });
      setResult(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const typeConfig: Record<string, { bg: string; border: string; badge: string; icon: string }> = {
    critical: { bg: "bg-rose-50", border: "border-rose-200", badge: "bg-rose-600 text-white", icon: "text-rose-600" },
    abnormal: { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-500 text-white", icon: "text-amber-600" },
    trend: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-500 text-white", icon: "text-blue-600" },
    potential_error: { bg: "bg-slate-50", border: "border-slate-200", badge: "bg-slate-500 text-white", icon: "text-slate-600" },
  };

  return (
    <div className="space-y-4">
      <Card className="border-fuchsia-200 shadow-md">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-700 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-white" />
            </div>
            <Label className="text-sm font-bold text-slate-900">Lab Results</Label>
          </div>
          <p className="text-xs text-slate-500">Enter one result per line: <code className="bg-slate-100 px-1.5 py-0.5 rounded">Test, Value, Reference Range</code></p>
          <Textarea value={resultsText} onChange={(e) => setResultsText(e.target.value)} rows={6}
            placeholder={"Hemoglobin, 4.5 g/dL, 13.5-17.5\nWBC, 25.0 x10^9/L, 4.0-11.0\nPlatelets, 45 x10^9/L, 150-400"}
            className="resize-none text-sm font-mono" />
          <AIButton onClick={handleAnalyze} disabled={!resultsText.trim()} loading={loading}
            icon={<FlaskConical className="w-4 h-4" />} label="Detect Anomalies" loadingText="Analyzing..."
            gradient="from-fuchsia-600 to-pink-700" />
        </CardContent>
      </Card>

      {loading && <LoadingCard text="Detecting anomalies..." />}

      {result?.anomalies && !loading && (
        <ResultCard accent="fuchsia">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-100 flex items-center justify-center">
              <Activity className="w-4 h-4 text-fuchsia-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Analysis Results</h3>
          </div>

          {result.anomalies.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200"
              style={{ animation: "fadeInUp 0.4s ease-out" }}>
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-emerald-700">All results within normal limits</p>
                <p className="text-xs text-emerald-600">No anomalies detected</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {result.anomalies.map((a: any, i: number) => {
                const tc = typeConfig[a.type] || typeConfig.abnormal;
                return (
                  <div key={i} className={`p-3 rounded-lg border ${tc.border} ${tc.bg} group`}
                    style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.1}s both` }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-slate-900 flex items-center gap-2">
                        <AlertTriangle className={`w-4 h-4 ${tc.icon}`} /> {a.testName}
                      </span>
                      <Badge className={`text-[10px] ${tc.badge}`}>{a.type.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-sm text-slate-700">{a.description}</p>
                    <div className="mt-2 flex items-start gap-2 text-xs text-slate-500">
                      <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span><span className="font-medium text-slate-600">Recommendation:</span> {a.recommendation}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {result.patterns?.length > 0 && (
            <div className="rounded-lg bg-violet-50 border border-violet-200 p-3">
              <h4 className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> Cross-Test Patterns
              </h4>
              <div className="space-y-1.5">
                {result.patterns.map((p: string, i: number) => (
                  <div key={i} className="text-sm text-violet-700 flex items-start gap-2"
                    style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.1}s both` }}>
                    <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {p}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.overallAssessment && (
            <div className="rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-slate-600" />
                <p className="text-sm text-slate-700"><span className="font-bold">Assessment:</span> {result.overallAssessment}</p>
              </div>
            </div>
          )}
        </ResultCard>
      )}
    </div>
  );
}
