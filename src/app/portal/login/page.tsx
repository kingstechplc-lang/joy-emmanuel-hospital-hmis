"use client";

// =====================================================================
// PATIENT PORTAL — Login page (2-step OTP flow)
// =====================================================================
// Step 1: Patient enters phone number → POST /api/portal/auth/request-otp
// Step 2: Patient enters 6-digit code → POST /api/portal/auth/verify-otp
//
// On success: stores the JWT in localStorage + redirects to /portal/dashboard
// On 404 (phone not registered): shows a helpful message directing them
//   to the Records Desk to register their phone number.
// On 429 (rate limited): shows the wait message.
// On 401 (wrong code): increments failed attempt display, after 5 wrong
//   attempts the underlying OTP is invalidated by the server.
// =====================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Step = "phone" | "code" | "success";

export default function PortalLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [devModeOtp, setDevModeOtp] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const canonicalizePhone = (raw: string): string => {
    // Same logic as server-side canonicalization, for client preview only
    const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (/^0\d{9}$/.test(digits)) return "+233" + digits.slice(1);
    if (/^233\d{9}$/.test(digits)) return "+" + digits;
    if (/^\d{9}$/.test(digits)) return "+233" + digits;
    return digits;
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }
    setSubmitting(true);
    setDevModeOtp(null);
    try {
      const res = await fetch("/api/portal/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (res.ok && json.sent) {
        setStep("code");
        toast.success("Code sent — check your phone");
        // Dev mode surfaces the OTP for testing convenience
        if (json.devModeOtp) {
          setDevModeOtp(json.devModeOtp);
        }
      } else if (res.status === 404) {
        toast.error(json.error || "Phone not registered");
      } else if (res.status === 429) {
        toast.error(json.error || "Too many attempts — please wait");
      } else {
        toast.error(json.error || "Failed to send code");
      }
    } catch (e: any) {
      toast.error(e.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error("Please enter the 6-digit code");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const json = await res.json();
      if (res.ok && json.token) {
        localStorage.setItem("patientPortalToken", json.token);
        localStorage.setItem("patientPortalPhone", phone);
        toast.success("Welcome back!");
        setStep("success");
        // Small delay for visual feedback, then redirect
        setTimeout(() => router.push("/portal/dashboard"), 600);
      } else if (res.status === 401) {
        setFailedAttempts((n) => n + 1);
        toast.error(json.error || "Invalid code");
        setCode("");
      } else if (res.status === 404) {
        toast.error(json.error || "Phone not registered");
        setStep("phone");
      } else {
        toast.error(json.error || "Verification failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep("phone");
    setCode("");
    setDevModeOtp(null);
    setFailedAttempts(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-teal-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-sky-600 mb-3 shadow-lg">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Joy Emmanuel Hospital</h1>
          <p className="text-sm text-slate-500 mt-1">Patient Portal</p>
        </div>

        <Card className="shadow-xl border-slate-200">
          <CardContent className="p-6">
            {step === "phone" && (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div className="text-center mb-4">
                  <h2 className="text-xl font-semibold text-slate-900">Log in</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Enter the phone number you registered with the hospital.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium text-slate-700">
                    Phone Number
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="024 123 4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-10 h-12 text-base"
                      disabled={submitting}
                      autoFocus
                    />
                  </div>
                  {phone && (
                    <p className="text-xs text-slate-500">
                      We'll send a code to <span className="font-medium">{canonicalizePhone(phone)}</span>
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 text-base bg-gradient-to-r from-teal-600 to-sky-600 hover:from-teal-700 hover:to-sky-700"
                  disabled={submitting || !phone.trim()}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending code...</>
                  ) : (
                    <>Send Code <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </form>
            )}

            {step === "code" && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <button
                  type="button"
                  onClick={resetFlow}
                  className="inline-flex items-center text-xs text-slate-500 hover:text-slate-700 mb-2"
                >
                  <ArrowLeft className="w-3 h-3 mr-1" /> Use a different phone
                </button>
                <div className="text-center mb-4">
                  <h2 className="text-xl font-semibold text-slate-900">Enter your code</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    We sent a 6-digit code to <span className="font-medium">{phone}</span>
                  </p>
                </div>

                {/* Dev-mode convenience: show the OTP inline so devs can copy-paste */}
                {devModeOtp && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-center">
                    <p className="text-xs text-amber-800 font-semibold mb-1">
                      🔧 Dev mode — your code:
                    </p>
                    <p className="text-2xl font-mono font-bold text-amber-900 tracking-widest">
                      {devModeOtp}
                    </p>
                    <p className="text-[10px] text-amber-700 mt-1">
                      (In production, this would arrive via SMS)
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="code" className="text-sm font-medium text-slate-700">
                    6-digit code
                  </Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="h-14 text-center text-2xl font-mono tracking-[0.5em]"
                    disabled={submitting}
                    autoFocus
                  />
                  {failedAttempts > 0 && (
                    <p className="text-xs text-rose-600">
                      {failedAttempts} wrong {failedAttempts === 1 ? "attempt" : "attempts"}. {5 - failedAttempts} left before the code is reset.
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 text-base bg-gradient-to-r from-teal-600 to-sky-600 hover:from-teal-700 hover:to-sky-700"
                  disabled={submitting || code.length !== 6}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                  ) : (
                    <>Log In <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
                <p className="text-xs text-center text-slate-400">
                  Code expires in 5 minutes. Request a new one if it didn't arrive.
                </p>
              </form>
            )}

            {step === "success" && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-3">
                  <ShieldCheck className="w-9 h-9 text-emerald-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">Logged in</h2>
                <p className="text-sm text-slate-500 mt-1">Redirecting to your dashboard...</p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6 px-4">
          By logging in, you agree to access only your own health records. Unauthorized access is prohibited under Ghana's Data Protection Act, 2012 (Act 843).
        </p>
      </div>
    </div>
  );
}
