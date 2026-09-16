"use client";

// =====================================================================
// AI ASSISTANT VIEW — 4 AI-powered clinical tools
// =====================================================================
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Stethoscope, Pill, FlaskConical, Loader2, Sparkles,
  AlertTriangle, CheckCircle2, Lightbulb,
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

export function AIAssistantView() {
  const [tab, setTab] = useState<Tab>("icd10");

  return (
    <div className="space-y-4 fade-in-up">
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Brain className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> AI Clinical Assistant
        </h2>
        <p className="text-sm text-white/80 mt-1">
          AI-powered clinical decision support. All suggestions are advisory — the clinician always makes the final decision.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === "icd10"} onClick={() => setTab("icd10")} icon={<Brain className="w-4 h-4" />} label="ICD-10 Suggester" />
        <TabBtn active={tab === "triage"} onClick={() => setTab("triage")} icon={<Stethoscope className="w-4 h-4" />} label="Triage Scorer" />
        <TabBtn active={tab === "dose"} onClick={() => setTab("dose")} icon={<Pill className="w-4 h-4" />} label="Pediatric Dose Check" />
        <TabBtn active={tab === "anomaly"} onClick={() => setTab("anomaly")} icon={<FlaskConical className="w-4 h-4" />} label="Lab Anomaly Detection" />
      </div>

      {tab === "icd10" && <ICD10Tab />}
      {tab === "triage" && <TriageTab />}
      {tab === "dose" && <DoseTab />}
      {tab === "anomaly" && <AnomalyTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        active ? "bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ─── ICD-10 SUGGESTER ────────────────────────────────────────────
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
      <Card><CardContent className="p-4 space-y-3">
        <Label className="text-sm font-medium">Free-text Diagnosis</Label>
        <Textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={3}
          placeholder="e.g., Patient presents with fever, headache, and neck stiffness for 2 days..." />
        <Button onClick={handleSuggest} disabled={loading} className="bg-violet-600 hover:bg-violet-700 gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Brain className="w-4 h-4" /> Suggest ICD-10 Codes</>}
        </Button>
      </CardContent></Card>

      {result?.suggestions && (
        <Card><CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><Lightbulb className="w-4 h-4 text-violet-600" /> Suggested ICD-10 Codes</h3>
          {result.suggestions.map((s: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
              <div>
                <code className="text-sm font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded">{s.code}</code>
                <p className="text-sm text-slate-700 mt-1">{s.description}</p>
              </div>
              <Badge className={`text-xs ${s.confidence > 0.8 ? "bg-emerald-100 text-emerald-700" : s.confidence > 0.5 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                {Math.round(s.confidence * 100)}%
              </Badge>
            </div>
          ))}
          {result.reasoning && <div className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-600"><strong>Reasoning:</strong> {result.reasoning}</div>}
        </CardContent></Card>
      )}
    </div>
  );
}

// ─── TRIAGE SCORER ───────────────────────────────────────────────
function TriageTab() {
  const [input, setInput] = useState({ chiefComplaint: "", temperature: "", pulse: "", respiratoryRate: "", systolicBp: "", diastolicBp: "", oxygenSaturation: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleScore = async () => {
    if (!input.chiefComplaint.trim()) { toast.error("Please enter a chief complaint"); return; }
    setLoading(true); setResult(null);
    try {
      const vitals = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v ? Number(v) : undefined]));
      const data = await fetchJson("/api/ai/triage-score", vitals);
      setResult(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-3">
        <div><Label className="text-sm font-medium">Chief Complaint</Label>
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
            <div key={f.k}><Label className="text-xs">{f.l}</Label>
              <Input type="number" value={(input as any)[f.k]} onChange={(e) => setInput({ ...input, [f.k]: e.target.value })}
                placeholder={f.p} className="mt-0.5 h-9 text-sm" /></div>
          ))}
        </div>
        <Button onClick={handleScore} disabled={loading} className="bg-violet-600 hover:bg-violet-700 gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Stethoscope className="w-4 h-4" /> Score Triage</>}
        </Button>
      </CardContent></Card>

      {result?.category && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold text-white ${
              result.color === "red" ? "bg-red-600" : result.color === "orange" ? "bg-orange-500" : result.color === "yellow" ? "bg-yellow-500" : result.color === "green" ? "bg-green-500" : "bg-blue-500"
            }`}>{result.category}</div>
            <div>
              <p className="text-lg font-bold text-slate-900">Category {result.category} — {result.categoryLabel}</p>
              <p className="text-sm text-slate-600">{result.reasoning}</p>
            </div>
          </div>
          {result.redFlags?.length > 0 && (
            <div><h4 className="text-xs font-bold text-rose-700 uppercase mb-1">Red Flags</h4>
              <ul className="space-y-1">{result.redFlags.map((f: string, i: number) => (
                <li key={i} className="text-sm text-rose-700 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {f}</li>
              ))}</ul></div>
          )}
          {result.recommendations?.length > 0 && (
            <div><h4 className="text-xs font-bold text-slate-700 uppercase mb-1">Recommendations</h4>
              <ul className="space-y-1">{result.recommendations.map((r: string, i: number) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" /> {r}</li>
              ))}</ul></div>
          )}
        </CardContent></Card>
      )}
    </div>
  );
}

// ─── PEDIATRIC DOSE CHECKER ──────────────────────────────────────
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
      <Card><CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-sm font-medium">Medication Name</Label>
            <Input value={input.medicationName} onChange={(e) => setInput({ ...input, medicationName: e.target.value })} placeholder="e.g., Amoxicillin" className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Prescribed Dose</Label>
            <Input value={input.prescribedDose} onChange={(e) => setInput({ ...input, prescribedDose: e.target.value })} placeholder="e.g., 5 mL (250mg)" className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Frequency</Label>
            <Input value={input.prescribedFrequency} onChange={(e) => setInput({ ...input, prescribedFrequency: e.target.value })} placeholder="e.g., 3 times daily" className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Patient Weight (kg)</Label>
            <Input type="number" value={input.patientWeightKg} onChange={(e) => setInput({ ...input, patientWeightKg: e.target.value })} placeholder="e.g., 12" className="mt-1" /></div>
        </div>
        <Button onClick={handleCheck} disabled={loading} className="bg-violet-600 hover:bg-violet-700 gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking...</> : <><Pill className="w-4 h-4" /> Check Dose Safety</>}
        </Button>
      </CardContent></Card>

      {result?.isSafe !== undefined && (
        <Card><CardContent className="p-4 space-y-3">
          <div className={`flex items-center gap-2 p-3 rounded-lg ${result.isSafe ? "bg-emerald-50 border border-emerald-200" : "bg-rose-50 border border-rose-200"}`}>
            {result.isSafe ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
            <span className={`font-bold ${result.isSafe ? "text-emerald-700" : "text-rose-700"}`}>{result.isSafe ? "Dose appears safe" : "Dose may be unsafe"}</span>
          </div>
          {result.recommendedDoseRange && <div><Label className="text-xs">Recommended Range</Label><p className="text-sm text-slate-700 mt-0.5">{result.recommendedDoseRange}</p></div>}
          {result.calculatedDosePerKg && <div><Label className="text-xs">Calculated Per Kg</Label><p className="text-sm text-slate-700 mt-0.5">{result.calculatedDosePerKg}</p></div>}
          {result.warnings?.length > 0 && <div><h4 className="text-xs font-bold text-amber-700 uppercase mb-1">Warnings</h4>
            <ul className="space-y-1">{result.warnings.map((w: string, i: number) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}</li>
            ))}</ul></div>}
          {result.reasoning && <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600"><strong>Reasoning:</strong> {result.reasoning}</div>}
        </CardContent></Card>
      )}
    </div>
  );
}

// ─── LAB ANOMALY DETECTION ──────────────────────────────────────
function AnomalyTab() {
  const [resultsText, setResultsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAnalyze = async () => {
    if (!resultsText.trim()) { toast.error("Please enter lab results"); return; }
    setLoading(true); setResult(null);
    try {
      // Parse the free-text results into structured objects
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

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-3">
        <Label className="text-sm font-medium">Lab Results (one per line: Test, Value, Reference Range)</Label>
        <Textarea value={resultsText} onChange={(e) => setResultsText(e.target.value)} rows={6}
          placeholder={"Hemoglobin, 4.5 g/dL, 13.5-17.5\nWBC, 25.0 x10^9/L, 4.0-11.0\nPlatelets, 45 x10^9/L, 150-400"} />
        <Button onClick={handleAnalyze} disabled={loading} className="bg-violet-600 hover:bg-violet-700 gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><FlaskConical className="w-4 h-4" /> Detect Anomalies</>}
        </Button>
      </CardContent></Card>

      {result?.anomalies && (
        <Card><CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-violet-600" /> Detected Anomalies</h3>
          {result.anomalies.length === 0 ? (
            <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> All results within normal limits</p>
          ) : (
            result.anomalies.map((a: any, i: number) => (
              <div key={i} className={`p-3 rounded-lg border ${a.type === "critical" ? "border-rose-200 bg-rose-50" : a.type === "abnormal" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-900">{a.testName}</span>
                  <Badge className={`text-xs ${a.type === "critical" ? "bg-rose-600 text-white" : a.type === "abnormal" ? "bg-amber-200 text-amber-800" : "bg-blue-200 text-blue-800"}`}>{a.type}</Badge>
                </div>
                <p className="text-sm text-slate-700">{a.description}</p>
                <p className="text-xs text-slate-500 mt-1"><strong>Recommendation:</strong> {a.recommendation}</p>
              </div>
            ))
          )}
          {result.patterns?.length > 0 && (
            <div className="mt-2"><h4 className="text-xs font-bold text-slate-700 uppercase mb-1">Cross-Test Patterns</h4>
              <ul className="space-y-1">{result.patterns.map((p: string, i: number) => (
                <li key={i} className="text-sm text-violet-700 flex items-start gap-1.5"><Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {p}</li>
              ))}</ul></div>
          )}
          {result.overallAssessment && <div className="mt-2 p-3 bg-slate-50 rounded-lg text-sm text-slate-700"><strong>Assessment:</strong> {result.overallAssessment}</div>}
        </CardContent></Card>
      )}
    </div>
  );
}
