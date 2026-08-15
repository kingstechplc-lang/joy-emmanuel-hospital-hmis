"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldPlus, Loader2 } from "lucide-react";

export function LoginView() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Brand Panel */}
      <div className="md:w-1/2 bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="w-96 h-96 bg-white rounded-full blur-3xl absolute -top-20 -right-20" />
          <div className="w-72 h-72 bg-emerald-300 rounded-full blur-3xl absolute bottom-10 -left-20" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center">
              <ShieldPlus className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Joy Emmanuel Hospital</h1>
              <p className="text-emerald-100 text-sm">Hospital Management Information System</p>
            </div>
          </div>
        </div>
        <div className="relative space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold leading-tight">
            One patient.<br />One record.<br />Every facility.
          </h2>
          <p className="text-emerald-100/80 max-w-md">
            A centralized, multi-facility HMIS that maintains a longitudinal medical record across
            every Joy Emmanuel Hospital location — Accra, Kasoa, Tema and beyond.
          </p>
          <ul className="text-sm space-y-2 text-emerald-50">
            <li>✓ Patient Master Index with duplicate detection</li>
            <li>✓ Cross-facility continuity of care</li>
            <li>✓ Role-based access control with audit trails</li>
            <li>✓ Full clinical, pharmacy, lab, and billing workflows</li>
          </ul>
        </div>
        <div className="relative text-xs text-emerald-200/70">
          © {new Date().getFullYear()} Joy Emmanuel Hospital. All rights reserved.
        </div>
      </div>

      {/* Login Panel */}
      <div className="md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-slate-50">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>
              Enter your hospital credentials to access the HMIS
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="e.g. doctor"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <div className="w-full pt-2 mt-2 border-t border-slate-200">
                <p className="text-xs text-slate-500 mb-2 text-center">Demo accounts (password: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">Password@2026</code>)</p>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  {[
                    { u: "superadmin", l: "Super Admin", c: "bg-purple-100 text-purple-700" },
                    { u: "orgadmin", l: "Org Admin", c: "bg-emerald-100 text-emerald-700" },
                    { u: "facadmin", l: "Fac. Admin", c: "bg-blue-100 text-blue-700" },
                    { u: "doctor", l: "Doctor", c: "bg-rose-100 text-rose-700" },
                    { u: "nurse", l: "Nurse", c: "bg-amber-100 text-amber-700" },
                    { u: "pharmacist", l: "Pharmacist", c: "bg-teal-100 text-teal-700" },
                    { u: "labscientist", l: "Lab", c: "bg-indigo-100 text-indigo-700" },
                    { u: "cashier", l: "Cashier", c: "bg-pink-100 text-pink-700" },
                    { u: "receptionist", l: "Reception", c: "bg-cyan-100 text-cyan-700" },
                  ].map((acc) => (
                    <button
                      key={acc.u}
                      type="button"
                      onClick={() => quickFill(acc.u)}
                      className={`px-2 py-1.5 rounded-md hover:scale-105 transition text-center font-medium ${acc.c}`}
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
