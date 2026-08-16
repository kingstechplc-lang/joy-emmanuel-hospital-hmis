"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/required-label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldPlus, Loader2, Eye, EyeOff, HeartPulse, Lock, User } from "lucide-react";

export function LoginView() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Please enter username and password");
      return;
    }
    setLoading(true);
    const res = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      toast.error("Invalid credentials or account locked");
      return;
    }
    toast.success("Welcome back to Joy Emmanuel Hospital HMIS");
    router.refresh();
  };

  const quickFill = (u: string) => {
    setUsername(u);
    setPassword("Password@2026");
    toast.info(`Credentials filled for "${u}" — click Sign in`);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Brand Panel */}
      <div className="md:w-1/2 bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
        {/* Decorative background blobs */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="w-96 h-96 bg-white rounded-full blur-3xl absolute -top-32 -right-32 animate-pulse" style={{ animationDuration: "8s" }} />
          <div className="w-72 h-72 bg-emerald-300 rounded-full blur-3xl absolute bottom-20 -left-20 animate-pulse" style={{ animationDuration: "10s", animationDelay: "1s" }} />
        </div>
        {/* Decorative grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Header */}
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center ring-1 ring-white/30 shadow-lg">
              <ShieldPlus className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Joy Emmanuel Hospital</h1>
              <p className="text-emerald-100 text-sm">Hospital Management Information System</p>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="relative space-y-5 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/20 text-xs font-medium">
            <HeartPulse className="w-3.5 h-3.5" />
            <span>Multi-facility Healthcare Network</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold leading-tight tracking-tight">
            One patient.
            <br />
            <span className="text-emerald-200">One record.</span>
            <br />
            Every facility.
          </h2>
          <p className="text-emerald-100/90 max-w-md leading-relaxed">
            A centralized, secure HMIS that maintains a longitudinal medical record
            across every Joy Emmanuel Hospital location — Assin Fosu, Accra, Tema and beyond.
          </p>
          <ul className="text-sm space-y-2.5 text-emerald-50">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
              Patient Master Index with duplicate detection
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
              Cross-facility continuity of care
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
              Role-based access control with audit trails
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
              Full clinical, pharmacy, lab, and billing workflows
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="relative text-xs text-emerald-200/70 flex items-center justify-between">
          <span>© {new Date().getFullYear()} Joy Emmanuel Hospital</span>
          <span className="flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            HIPAA-style audit logging
          </span>
        </div>
      </div>

      {/* Login Panel */}
      <div className="md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-gradient-to-br from-slate-50 to-slate-100 relative">
        <Card className="w-full max-w-md shadow-xl ring-1 ring-slate-200/50">
          <CardHeader className="space-y-1.5 pb-2">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-lg flex items-center justify-center mb-2 shadow-md">
              <ShieldPlus className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-2xl tracking-tight">Welcome back</CardTitle>
            <CardDescription className="text-slate-600">
              Sign in to access the Hospital Management Information System
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="username" required>Username</FieldLabel>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="e.g. doctor"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    className="h-11 pl-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="password" required>Password</FieldLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="h-11 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </Button>

              {/* Demo accounts */}
              <div className="w-full mt-2 pt-4 border-t border-slate-200">
                <p className="text-xs text-slate-500 mb-2.5 text-center">
                  Quick demo logins · password{" "}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono text-[11px]">Password@2026</code>
                </p>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  {[
                    { u: "superadmin", l: "Super Admin", c: "bg-purple-50 text-purple-700 hover:bg-purple-100 ring-1 ring-purple-200" },
                    { u: "orgadmin", l: "Org Admin", c: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 ring-1 ring-emerald-200" },
                    { u: "facadmin", l: "Fac. Admin", c: "bg-blue-50 text-blue-700 hover:bg-blue-100 ring-1 ring-blue-200" },
                    { u: "doctor", l: "Doctor", c: "bg-rose-50 text-rose-700 hover:bg-rose-100 ring-1 ring-rose-200" },
                    { u: "nurse", l: "Nurse", c: "bg-amber-50 text-amber-700 hover:bg-amber-100 ring-1 ring-amber-200" },
                    { u: "pharmacist", l: "Pharmacist", c: "bg-teal-50 text-teal-700 hover:bg-teal-100 ring-1 ring-teal-200" },
                    { u: "labscientist", l: "Lab", c: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 ring-1 ring-indigo-200" },
                    { u: "cashier", l: "Cashier", c: "bg-pink-50 text-pink-700 hover:bg-pink-100 ring-1 ring-pink-200" },
                    { u: "receptionist", l: "Reception", c: "bg-cyan-50 text-cyan-700 hover:bg-cyan-100 ring-1 ring-cyan-200" },
                  ].map((acc) => (
                    <button
                      key={acc.u}
                      type="button"
                      onClick={() => quickFill(acc.u)}
                      title={`Login as ${acc.u}`}
                      className={`px-2 py-2 rounded-md transition text-center font-medium ${acc.c}`}
                    >
                      {acc.l}
                    </button>
                  ))}
                </div>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
