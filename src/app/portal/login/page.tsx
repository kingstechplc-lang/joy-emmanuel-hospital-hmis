"use client";

// =====================================================================
// PATIENT PORTAL — Login page (two-panel split, matching staff LoginView)
// =====================================================================
// LEFT panel: emerald/teal gradient with decorative blobs + feature list
// RIGHT panel: Ghana Card 3-factor form in a polished card
// =====================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldPlus, Loader2, CreditCard, Calendar, Hash, AlertCircle, HeartPulse, Lock } from "lucide-react";
import { toast } from "sonner";

export default function PortalLoginPage() {
  const router = useRouter();
  const [ghanaCard, setGhanaCard] = useState("");
  const [dob, setDob] = useState("");
  const [patientNumber, setPatientNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPatientNumberPreview = (raw: string): string => {
    if (!raw) return "";
    let s = raw.trim().toUpperCase();
    if (s.startsWith("JEM-")) s = s.slice(4);
    else if (s.startsWith("JEM")) s = s.slice(3);
    s = s.replace(/[\s-]/g, "");
    if (!s) return "";
    if (/^\d+$/.test(s)) return `JEM-${s.padStart(7, "0")}`;
    return `JEM-${s}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!ghanaCard.trim() || !dob || !patientNumber.trim()) {
      setError("Please fill in all three fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/auth/login-with-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ghanaCardNumber: ghanaCard, dateOfBirth: dob, patientNumber }),
      });
      let json: any = null;
      try {
        const text = await res.text();
        if (text && text.trim()) json = JSON.parse(text);
      } catch { /* parse error */ }

      if (res.ok && json?.token) {
        localStorage.setItem("patientPortalToken", json.token);
        toast.success("Welcome back!");
        setSubmitting(false);
        setTimeout(() => { window.location.href = "/portal/dashboard"; }, 400);
      } else if (res.status === 429) {
        setError(json?.error || "Too many attempts. Please try again in an hour.");
      } else if (res.status === 403) {
        setError(json?.error || "Your account has been suspended.");
      } else if (res.status === 400) {
        setError(json?.error || "Please check your input and try again.");
      } else if (res.status === 500) {
        setError(json?.error || "A server error occurred. Please try again.");
      } else {
        setError(json?.error || "The credentials you entered don't match our records. Please verify your Ghana Card number, date of birth, and patient number, then try again.");
      }
    } catch (e: any) {
      setError(e.message || "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-dvh flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
      {/* LEFT panel — brand + features */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 text-white p-8 md:p-12 flex-col justify-between relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white opacity-20 blur-3xl rounded-full pointer-events-none animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-300 opacity-20 blur-3xl rounded-full pointer-events-none animate-pulse" style={{ animationDuration: "10s", animationDelay: "1s" }} />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        {/* Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 bg-white/15 backdrop-blur rounded-xl ring-1 ring-white/30 shadow-lg flex items-center justify-center">
            <ShieldPlus className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Joy Emmanuel Hospital</h2>
            <p className="text-emerald-100 text-sm">Patient Portal</p>
          </div>
        </div>

        {/* Hero */}
        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/20 text-xs font-medium mb-6">
            <HeartPulse className="w-3.5 h-3.5" />
            Your Health, In Your Hands
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight tracking-tight mb-4">
            Access your <span className="text-emerald-200">health records</span> anytime.
          </h1>
          <p className="text-emerald-100/90 max-w-md leading-relaxed mb-6">
            View lab results, appointments, and invoices from the comfort of your home. Securely authenticated via your Ghana Card.
          </p>
          <div className="space-y-2.5">
            {[
              "Lab results released by your doctor",
              "Upcoming appointment reminders",
              "Invoice history and outstanding balances",
              "Secure 3-factor authentication",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2.5 text-sm text-emerald-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-emerald-200/70">
          <span>© 2026 Joy Emmanuel Hospital</span>
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3" /> Audit-logged access
          </span>
        </div>
      </div>

      {/* RIGHT panel — form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md shadow-xl ring-1 ring-slate-200/50 mt-8 md:mt-0">
          <CardHeader className="space-y-1">
            <div className="w-11 h-11 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg shadow-md flex items-center justify-center mb-2">
              <ShieldPlus className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-2xl tracking-tight">Welcome back</CardTitle>
            <CardDescription className="text-slate-600">
              Enter your Ghana Card details to access your health records.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ghanaCard" className="text-sm font-medium text-slate-700">Ghana Card Number</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="ghanaCard" type="text" inputMode="text" autoComplete="off"
                    placeholder="GHA-123456789-1" value={ghanaCard}
                    onChange={(e) => setGhanaCard(e.target.value)}
                    className="pl-10 h-11" disabled={submitting} autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500">On the front of your card. Dashes optional.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dob" className="text-sm font-medium text-slate-700">Date of Birth</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="pl-10 h-11" disabled={submitting} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="patientNumber" className="text-sm font-medium text-slate-700">Patient Number</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="patientNumber" type="text" inputMode="text" placeholder="JEM-00000001"
                    value={patientNumber} onChange={(e) => setPatientNumber(e.target.value)}
                    className="pl-10 h-11 font-mono" disabled={submitting}
                  />
                </div>
                {patientNumber && (
                  <p className="text-xs text-slate-500">
                    Matched as <span className="font-mono font-medium text-slate-700">{formatPatientNumberPreview(patientNumber)}</span>
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700" disabled={submitting || !ghanaCard.trim() || !dob || !patientNumber.trim()}>
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</> : "Log In"}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col items-center gap-2 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-600 text-center">
              Don't have these details? Visit our <strong>Records Desk</strong> with your Ghana Card.
            </p>
            <p className="text-[10px] text-slate-400 text-center">
              By logging in, you agree to access only your own health records. Unauthorized access is prohibited under Ghana's Data Protection Act, 2012 (Act 843).
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
