"use client";

// =====================================================================
// PATIENT PORTAL — Login page (Ghana Card 3-factor verification)
// =====================================================================
// v1 auth: patient enters 3 factors:
//   1. Ghana Card Number (e.g., "GHA-123456789-1" or "1234567891")
//   2. Date of Birth (HTML date picker)
//   3. Patient Number (e.g., "JEM-00000001")
//
// All three must match the same Patient row → mint JWT.
// On any mismatch, show a generic error (don't reveal which factor
// was wrong — security best practice).
//
// Future v2: a "Use SMS instead" tab will appear when SMS_PROVIDER is
// configured to a real gateway, letting patients opt for OTP-via-SMS.
// The OTP endpoint infrastructure is already in place.
// =====================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, CreditCard, Calendar, Hash, AlertCircle } from "lucide-react";
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
        body: JSON.stringify({
          ghanaCardNumber: ghanaCard,
          dateOfBirth: dob,
          patientNumber,
        }),
      });

      // ── Robust JSON parsing ───────────────────────────────────────
      // The server might return:
      //   - valid JSON (the normal case)
      //   - empty body (if something went very wrong in the server runtime)
      //   - HTML (if Next.js returned an error page)
      // We need to handle all three gracefully so the user always sees
      // a helpful message instead of a JavaScript console error.
      let json: any = null;
      try {
        const text = await res.text();
        if (text && text.trim()) {
          json = JSON.parse(text);
        }
      } catch (parseErr) {
        // Body wasn't valid JSON — could be HTML error page or empty
        console.error("[portal login] response parse failed:", parseErr);
      }

      if (res.ok && json?.token) {
        localStorage.setItem("patientPortalToken", json.token);
        toast.success("Welcome back!");
        setSubmitting(false);
        setTimeout(() => router.push("/portal/dashboard"), 400);
      } else if (res.status === 429) {
        setError(json?.error || "Too many attempts. Please try again in an hour.");
      } else if (res.status === 403) {
        setError(json?.error || "Your account has been suspended. Please contact the hospital.");
      } else if (res.status === 400) {
        setError(json?.error || "Please check your input and try again.");
      } else if (res.status === 500) {
        // TEMPORARY DEBUG: show the actual error detail so we can
        // diagnose what's failing without checking Vercel logs.
        const baseMsg = json?.error || "A server error occurred. Please try again in a moment.";
        const detail = json?.detail ? `\n\nDebug detail: ${json.detail}` : "";
        setError(baseMsg + detail);
        if (json?.stack) {
          console.error("[portal login] server stack:", json.stack);
        }
      } else if (res.status === 401) {
        // Generic mismatch error (don't reveal which factor was wrong)
        setError(
          json?.error ||
            "The credentials you entered don't match our records. Please verify your Ghana Card number, date of birth, and patient number, then try again."
        );
      } else {
        // Any other status code
        setError(
          json?.error ||
            `Login failed (${res.status}). Please try again or contact the hospital.`
        );
      }
    } catch (e: any) {
      console.error("[portal login] network error:", e);
      setError(e.message || "Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-teal-50 overflow-y-auto">
      <div className="w-full max-w-md mx-auto px-4 py-6 sm:py-8">
        {/* Brand header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-sky-600 mb-2 shadow-lg">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Joy Emmanuel Hospital</h1>
          <p className="text-xs text-slate-500 mt-0.5">Patient Portal</p>
        </div>

        <Card className="shadow-xl border-slate-200">
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="text-center mb-1">
                <h2 className="text-lg font-semibold text-slate-900">Log in</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter your Ghana Card details to access your health records.
                </p>
              </div>

              {/* Error banner */}
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {/* Ghana Card Number */}
              <div className="space-y-1">
                <Label htmlFor="ghanaCard" className="text-xs font-medium text-slate-700">
                  Ghana Card Number
                </Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="ghanaCard"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    placeholder="GHA-123456789-1"
                    value={ghanaCard}
                    onChange={(e) => setGhanaCard(e.target.value)}
                    className="pl-10 h-11 text-base"
                    disabled={submitting}
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  On the front of your card. Dashes optional.
                </p>
              </div>

              {/* Date of Birth */}
              <div className="space-y-1">
                <Label htmlFor="dob" className="text-xs font-medium text-slate-700">
                  Date of Birth
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <Input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="pl-10 h-11 text-base"
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Patient Number */}
              <div className="space-y-1">
                <Label htmlFor="patientNumber" className="text-xs font-medium text-slate-700">
                  Patient Number
                </Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="patientNumber"
                    type="text"
                    inputMode="text"
                    placeholder="JEM-00000001"
                    value={patientNumber}
                    onChange={(e) => setPatientNumber(e.target.value)}
                    className="pl-10 h-11 text-base font-mono"
                    disabled={submitting}
                  />
                </div>
                {patientNumber && (
                  <p className="text-[10px] text-slate-500">
                    Matched as <span className="font-mono font-medium text-slate-700">{formatPatientNumberPreview(patientNumber)}</span>
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base bg-gradient-to-r from-teal-600 to-sky-600 hover:from-teal-700 hover:to-sky-700 mt-1"
                disabled={submitting || !ghanaCard.trim() || !dob || !patientNumber.trim()}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                ) : (
                  <>Log In</>
                )}
              </Button>
            </form>

            {/* Help section — collapsible to save space on small screens */}
            <details className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600">
              <summary className="font-semibold text-slate-700 cursor-pointer">
                Don't have these details?
              </summary>
              <div className="mt-2 space-y-1.5">
                <p>
                  Please visit our <strong>Records Desk</strong> with your Ghana Card and a valid ID. Our staff will register you and issue your patient number.
                </p>
                <p className="text-slate-500">
                  Lost your Ghana Card? Contact the National Identification Authority (NIA) at <span className="font-medium">0800-100-777</span> (toll-free).
                </p>
              </div>
            </details>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-slate-400 mt-3 px-4">
          By logging in, you agree to access only your own health records. Unauthorized access is prohibited under Ghana's Data Protection Act, 2012 (Act 843).
        </p>

        <p className="text-center text-[10px] text-slate-400 mt-2">
          All login attempts are logged for security.
        </p>
      </div>
    </div>
  );
}
