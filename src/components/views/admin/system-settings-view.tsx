"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Save, Building, ShieldCheck, Bell, Hash, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { LoadingState, ErrorState } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

// Default setting keys for each tab
const GENERAL_SETTINGS = [
  { key: "general_org_name", label: "Organization Name", type: "string", placeholder: "Joy Emmanuel Hospital" },
  { key: "general_org_code", label: "Organization Code", type: "string", placeholder: "JEM" },
  { key: "general_org_phone", label: "Organization Phone", type: "string", placeholder: "+233 30 123 4567" },
  { key: "general_org_email", label: "Organization Email", type: "string", placeholder: "info@joyemmmanuel.org" },
  { key: "general_org_address", label: "Organization Address", type: "string", placeholder: "123 Health Street, Accra" },
  { key: "general_org_logo_url", label: "Logo URL", type: "string", placeholder: "https://..." },
  { key: "general_currency", label: "Currency", type: "string", placeholder: "GHS" },
  { key: "general_timezone", label: "Timezone", type: "string", placeholder: "Africa/Accra" },
  { key: "general_date_format", label: "Date Format", type: "string", placeholder: "DD/MM/YYYY" },
];

const SECURITY_SETTINGS = [
  { key: "security_session_timeout_min", label: "Session Timeout (minutes)", type: "number", placeholder: "480" },
  { key: "security_max_login_attempts", label: "Max Login Attempts", type: "number", placeholder: "5" },
  { key: "security_lockout_duration_min", label: "Account Lockout Duration (min)", type: "number", placeholder: "15" },
  { key: "security_password_min_length", label: "Minimum Password Length", type: "number", placeholder: "8" },
  { key: "security_password_require_special", label: "Require special characters", type: "boolean" },
  { key: "security_password_require_number", label: "Require numbers", type: "boolean" },
  { key: "security_password_require_uppercase", label: "Require uppercase", type: "boolean" },
  { key: "security_2fa_required", label: "Mandatory 2FA", type: "boolean" },
  { key: "security_audit_log_retention_days", label: "Audit Log Retention (days)", type: "number", placeholder: "365" },
];

const NOTIFICATION_SETTINGS = [
  { key: "notif_email_enabled", label: "Email Notifications", type: "boolean" },
  { key: "notif_sms_enabled", label: "SMS Notifications", type: "boolean" },
  { key: "notif_critical_lab_result", label: "Critical Lab Results", type: "boolean" },
  { key: "notif_low_inventory", label: "Low Inventory Alerts", type: "boolean" },
  { key: "notif_appointment_reminder", label: "Appointment Reminders", type: "boolean" },
  { key: "notif_invoice_overdue", label: "Overdue Invoice Alerts", type: "boolean" },
  { key: "notif_break_glass_event", label: "Break-Glass Alerts", type: "boolean" },
  { key: "notif_new_user_registration", label: "New User Registration", type: "boolean" },
];

const NUMBERING_SETTINGS = [
  { key: "numbering_patient_prefix", label: "Patient Number Prefix", type: "string", placeholder: "JEM-" },
  { key: "numbering_encounter_prefix", label: "Encounter Number Prefix", type: "string", placeholder: "ENC-" },
  { key: "numbering_invoice_prefix", label: "Invoice Number Prefix", type: "string", placeholder: "INV-" },
  { key: "numbering_payment_prefix", label: "Payment Number Prefix", type: "string", placeholder: "PAY-" },
  { key: "numbering_prescription_prefix", label: "Prescription Number Prefix", type: "string", placeholder: "RX-" },
  { key: "numbering_lab_order_prefix", label: "Lab Order Number Prefix", type: "string", placeholder: "LAB-" },
  { key: "numbering_admission_prefix", label: "Admission Number Prefix", type: "string", placeholder: "ADM-" },
  { key: "numbering_appointment_prefix", label: "Appointment Number Prefix", type: "string", placeholder: "APT-" },
  { key: "numbering_purchase_order_prefix", label: "Purchase Order Number Prefix", type: "string", placeholder: "PO-" },
  { key: "numbering_claim_prefix", label: "Insurance Claim Number Prefix", type: "string", placeholder: "CLM-" },
  { key: "numbering_staff_prefix", label: "Staff Number Prefix", type: "string", placeholder: "STF-" },
];

export function SystemSettingsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canEdit = user?.roles?.includes("super_admin") || perms.includes("settings.manage");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-emerald-600" />
          System Settings
        </h2>
        <p className="text-sm text-slate-500">Configure organization-wide preferences and defaults</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="w-full md:w-auto overflow-x-auto">
          <TabsTrigger value="general" className="gap-1.5"><Building className="w-4 h-4" /> General</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><ShieldCheck className="w-4 h-4" /> Security</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="w-4 h-4" /> Notifications</TabsTrigger>
          <TabsTrigger value="numbering" className="gap-1.5"><Hash className="w-4 h-4" /> Numbering</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <SettingsTab settings={GENERAL_SETTINGS} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SettingsTab settings={SECURITY_SETTINGS} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <SettingsTab settings={NOTIFICATION_SETTINGS} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="numbering" className="mt-4">
          <SettingsTab settings={NUMBERING_SETTINGS} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingsTab({ settings, canEdit }: { settings: any[]; canEdit: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["system-settings"],
    queryFn: () => fetchJson("/api/system-settings"),
  });

  // Initialize form values from loaded settings
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [lastData, setLastData] = useState<any>(null);

  // Re-derive form values whenever `data` changes (e.g., after first load or after a save refetch).
  // Calling setState during render is the React-recommended pattern for "adjusting state when a prop changes".
  if (data && data !== lastData) {
    setLastData(data);
    const init: Record<string, any> = {};
    settings.forEach((s) => {
      const existing = (data.items || []).find((it: any) => it.settingKey === s.key);
      if (s.type === "boolean") {
        init[s.key] = existing?.settingValue === "true";
      } else if (s.type === "number") {
        init[s.key] = existing?.settingValue ? Number(existing.settingValue) : "";
      } else {
        init[s.key] = existing?.settingValue || "";
      }
    });
    setFormValues(init);
  }

  const saveMutation = useMutation({
    mutationFn: async (key: string) => {
      const config = settings.find((s) => s.key === key);
      if (!config) throw new Error("Unknown setting");
      const value = formValues[key];
      const stringValue = config.type === "boolean" ? String(value) : String(value);
      const res = await fetch("/api/system-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settingKey: key, settingValue: stringValue, settingType: config.type }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Setting saved");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError) return <ErrorState message="Failed to load settings" onRetry={() => refetch()} />;

  const configuredCount = (data?.items || []).filter((it: any) => settings.some((s) => s.key === it.settingKey)).length;

  const saveAll = async () => {
    for (const s of settings) {
      try {
        await saveMutation.mutateAsync(s.key);
      } catch {}
    }
    toast.success("All settings saved");
  };

  const updateValue = (key: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Configuration</CardTitle>
            <CardDescription className="text-xs">{settings.length} settings • {configuredCount} configured</CardDescription>
          </div>
          {canEdit && (
            <Button onClick={saveAll} disabled={saveMutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700" size="sm">
              {saveMutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings.map((s) => (
          <div key={s.key} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center py-2 border-b last:border-b-0">
            <div className="md:col-span-1">
              <Label className="text-sm font-medium text-slate-900">{s.label}</Label>
              <div className="text-xs text-slate-500 font-mono">{s.key}</div>
            </div>
            <div className="md:col-span-2">
              {s.type === "boolean" ? (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!formValues[s.key]}
                    onCheckedChange={(v) => updateValue(s.key, v)}
                    disabled={!canEdit}
                  />
                  <span className="text-xs text-slate-600">{formValues[s.key] ? "Enabled" : "Disabled"}</span>
                </div>
              ) : (
                <Input
                  type={s.type === "number" ? "number" : "text"}
                  value={formValues[s.key] ?? ""}
                  onChange={(e) => updateValue(s.key, s.type === "number" ? Number(e.target.value) : e.target.value)}
                  disabled={!canEdit}
                  placeholder={s.placeholder}
                />
              )}
            </div>
          </div>
        ))}
        {!canEdit && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
            You have view-only access. Settings can be modified by users with <code>settings.manage</code> permission.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
