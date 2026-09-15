"use client";

// =====================================================================
// PATIENT PORTAL — Login page (SPECIAL design with animations)
// =====================================================================
// Two-panel split with:
// - Animated brand logo (rotating gradient ring)
// - Floating decorative blobs with staggered animations
// - Grid overlay + noise texture for depth
// - Glassmorphism card with backdrop-blur
// - Animated success state before redirect
// - Micro-interactions on input focus
// =====================================================================
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldPlus, Loader2, CreditCard, Calendar, Hash, AlertCircle,
  HeartPulse, Lock, CheckCircle2, ArrowRight, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export default function PortalLoginPage() {
  const router = useRouter();
  const [ghanaCard, setGhanaCard] = useState("");
  const [dob, setDob] = useState("");
  const [patientNumber, setPatientNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
        setSuccess(true);
        setSubmitting(false);
        // 8-second delay so the patient can enjoy the welcome animation
        // (checkmark + bouncing dots) before the redirect
        setTimeout(() => { window.location.href = "/portal/dashboard"; }, 8000);
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
      {/* LEFT panel — brand + features with animated background */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 text-white p-8 md:p-12 flex-col justify-between relative overflow-hidden">
        {/* Animated decorative blobs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white opacity-20 blur-3xl rounded-full pointer-events-none animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-300 opacity-20 blur-3xl rounded-full pointer-events-none animate-pulse" style={{ animationDuration: "10s", animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-teal-400 opacity-10 blur-3xl rounded-full pointer-events-none animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        {/* Header with animated logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="relative w-14 h-14">
            {/* Rotating gradient ring */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-teal-400 via-emerald-300 to-teal-400 animate-spin" style={{ animationDuration: "3s" }} />
            {/* Inner logo tile */}
            <div className="absolute inset-[3px] bg-white/15 backdrop-blur rounded-[10px] ring-1 ring-white/30 shadow-lg flex items-center justify-center">
              <ShieldPlus className="w-7 h-7" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Joy Emmanuel Hospital</h2>
            <p className="text-emerald-100 text-sm flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Patient Portal
            </p>
          </div>
        </div>

        {/* Hero */}
        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/20 text-xs font-medium mb-6">
            <HeartPulse className="w-3.5 h-3.5" />
            Your Health, In Your Hands
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight tracking-tight mb-4">
            Access your <span className="text-emerald-200">health records</span> anytime, anywhere.
          </h1>
          <p className="text-emerald-100/90 max-w-md leading-relaxed mb-6">
            View lab results, appointments, and invoices from the comfort of your home. Securely authenticated via your Ghana Card.
          </p>
          <div className="space-y-2.5">
            {[
              { icon: "🔬", text: "Lab results released by your doctor" },
              { icon: "📅", text: "Upcoming appointment reminders" },
              { icon: "💰", text: "Invoice history and outstanding balances" },
              { icon: "🔐", text: "Secure 3-factor authentication" },
            ].map((feature) => (
              <div key={feature.text} className="flex items-center gap-2.5 text-sm text-emerald-100">
                <span className="text-base">{feature.icon}</span>
                {feature.text}
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

      {/* RIGHT panel — form with glassmorphism */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-100 relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, rgba(20,184,166,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(16,185,129,0.08) 0%, transparent 50%)",
        }} />

        <Card className="w-full max-w-md shadow-2xl ring-1 ring-slate-200/50 mt-8 md:mt-0 backdrop-blur-md bg-white/95 relative z-10">
          {/* Top gradient bar */}
          <div className="h-1.5 rounded-t-xl bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-500" />

          {success ? (
            /* Success animation */
            <CardContent className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 mb-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 animate-in fade-in zoom-in duration-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome back!</h2>
              <p className="text-sm text-slate-500 mb-4">Redirecting to your dashboard...</p>
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-1 pb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl shadow-lg flex items-center justify-center mb-2">
                  <ShieldPlus className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-2xl tracking-tight">Welcome back</CardTitle>
                <CardDescription className="text-slate-600">
                  Enter your Ghana Card details to access your health records.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>{error}</p>
                    </div>
                  )}

                  {/* Ghana Card Number */}
                  <div className="space-y-2">
                    <Label htmlFor="ghanaCard" className="text-sm font-medium text-slate-700 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-teal-600" />
                      Ghana Card Number
                    </Label>
                    <div className="relative">
                      <Input
                        id="ghanaCard"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        placeholder="GHA-123456789-1"
                        value={ghanaCard}
                        onChange={(e) => setGhanaCard(e.target.value)}
                        onFocus={() => setFocusedField("card")}
                        onBlur={() => setFocusedField(null)}
                        className={`pl-10 h-11 transition-all duration-200 ${focusedField === "card" ? "ring-2 ring-teal-500/20 border-teal-400" : ""}`}
                        disabled={submitting}
                        autoFocus
                      />
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-500">On the front of your card. Dashes optional.</p>
                  </div>

                  {/* Date of Birth */}
                  <div className="space-y-2">
                    <Label htmlFor="dob" className="text-sm font-medium text-slate-700 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-teal-600" />
                      Date of Birth
                    </Label>
                    <div className="relative">
                      <Input
                        id="dob"
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        onFocus={() => setFocusedField("dob")}
                        onBlur={() => setFocusedField(null)}
                        className={`pl-10 h-11 transition-all duration-200 ${focusedField === "dob" ? "ring-2 ring-teal-500/20 border-teal-400" : ""}`}
                        disabled={submitting}
                      />
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Patient Number */}
                  <div className="space-y-2">
                    <Label htmlFor="patientNumber" className="text-sm font-medium text-slate-700 flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-teal-600" />
                      Patient Number
                    </Label>
                    <div className="relative">
                      <Input
                        id="patientNumber"
                        type="text"
                        inputMode="text"
                        placeholder="JEM-00000001"
                        value={patientNumber}
                        onChange={(e) => setPatientNumber(e.target.value)}
                        onFocus={() => setFocusedField("pn")}
                        onBlur={() => setFocusedField(null)}
                        className={`pl-10 h-11 font-mono transition-all duration-200 ${focusedField === "pn" ? "ring-2 ring-teal-500/20 border-teal-400" : ""}`}
                        disabled={submitting}
                      />
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                    {patientNumber && (
                      <p className="text-xs text-slate-500">
                        Matched as <span className="font-mono font-medium text-teal-700">{formatPatientNumberPreview(patientNumber)}</span>
                      </p>
                    )}
                  </div>

                  {/* Submit button with gradient + arrow */}
                  <Button
                    type="submit"
                    className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 transition-all duration-200 group"
                    disabled={submitting || !ghanaCard.trim() || !dob || !patientNumber.trim()}
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                    ) : (
                      <>
                        Log In
                        <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>

              <CardFooter className="flex flex-col items-center gap-2 border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-600 text-center">
                  Don't have these details? Visit our <strong className="text-teal-700">Records Desk</strong> with your Ghana Card.
                </p>
                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  By logging in, you agree to access only your own health records. Unauthorized access is prohibited under Ghana's Data Protection Act, 2012 (Act 843).
                </p>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
