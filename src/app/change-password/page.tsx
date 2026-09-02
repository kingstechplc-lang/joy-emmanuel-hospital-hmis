"use client";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function ChangePasswordPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("New password must be different from the current password.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");

      toast.success("Password changed successfully. Please log in again.");

      // Update the session to remove mustChangePassword flag
      await update({ mustChangePassword: false });

      // Sign out and redirect to login
      await signOut({ redirect: false });
      router.push("/");
    } catch (e: any) {
      toast.error(e.message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  const isForced = (session?.user as any)?.mustChangePassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-red-600 rounded-lg flex items-center justify-center text-white shadow-lg">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-xl">Change Password</CardTitle>
              <CardDescription className="text-sm">
                {isForced
                  ? "You must change your password before continuing."
                  : "Update your account password."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        {isForced && (
          <div className="mx-6 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Your account requires a password change. You cannot access the system until you set a new password.</span>
          </div>
        )}

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                disabled={saving}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={saving}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-amber-600">Password must be at least 8 characters.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type={showNew ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              disabled={saving}
            />
            {confirmPassword && newPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-rose-600">Passwords do not match.</p>
            )}
            {confirmPassword && newPassword && confirmPassword === newPassword && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Passwords match.
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          {!isForced && (
            <Button
              variant="outline"
              onClick={() => router.back()}
              disabled={saving}
              className="flex-1"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleChange}
            disabled={saving || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 8}
            className="flex-1 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
            Change Password
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
