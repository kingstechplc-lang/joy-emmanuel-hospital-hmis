"use client";
// =====================================================================
// FINANCE & PAYROLL — Advanced hospital-grade payroll management
// =====================================================================
import { useState, type ReactElement } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, CalendarDays, Users, Settings, ChevronDown, DollarSign,
  Plus, Lock, Check, Play, TrendingUp, Award, Ban, RefreshCcw, Wallet, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { ModuleHelp } from "@/components/ui-helpers";
import {
  fetchJson, usePermissions, ColoredBadge, PERIOD_STATUSES, PAYMENT_STATUSES, LOAN_STATUSES,
  formatDate, formatCurrency,
} from "./payroll-helpers";
import { StaffSearchableSelect } from "@/components/ui/staff-searchable-select";
import { EmptyState, LoadingState, ErrorState, ClearableSearch, usePagination, Pagination } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// MAIN VIEW
// =====================================================================
export function PayrollView() {
  const [section, setSection] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sections = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "main" },
    { id: "periods", label: "Payroll Periods", icon: CalendarDays, group: "main" },
    { id: "profiles", label: "Staff Compensation", icon: Users, group: "main" },
    { id: "structures", label: "Salary Structures", icon: Award, group: "config" },
    { id: "allowances", label: "Allowances", icon: DollarSign, group: "config" },
    { id: "deductions", label: "Deductions", icon: DollarSign, group: "config" },
    { id: "loans", label: "Loans & Advances", icon: Wallet, group: "config" },
    { id: "statutory", label: "Statutory Rules", icon: Settings, group: "config" },
    { id: "settings", label: "Settings", icon: Settings, group: "config" },
  ];

  const current = sections.find((s) => s.id === section) || sections[0];
  const groups: Record<string, any[]> = { main: [], config: [] };
  for (const s of sections) groups[s.group].push(s);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white p-5 shadow-lg fade-in-up relative overflow-hidden">
        <div className="absolute top-2 right-4 text-white/15"><DollarSign className="w-20 h-20" strokeWidth={1.5} /></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="w-5 h-5 text-white/90" /><h2 className="text-xl font-bold">Finance &amp; Payroll</h2></div>
          <p className="text-sm text-white/80">Manage payroll periods, salary structures, allowances, deductions, statutory rules, loans, and payroll processing.</p>
        </div>
      </div>

      <div className="hidden md:block">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {groups.main.map((s) => <NavButton key={s.id} section={s} active={current.id === s.id} onClick={() => setSection(s.id)} />)}
          <span className="border-l border-slate-300 mx-1" />
          {groups.config.map((s) => <NavButton key={s.id} section={s} active={current.id === s.id} onClick={() => setSection(s.id)} />)}
        </div>
      </div>

      <div className="md:hidden">
        <Button variant="outline" className="w-full justify-between" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
          <span className="flex items-center gap-2"><current.icon className="w-4 h-4" />{current.label}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${mobileNavOpen ? "rotate-180" : ""}`} />
        </Button>
        {mobileNavOpen && (
          <div className="mt-2 p-2 border rounded-lg bg-white shadow-sm space-y-1">
            {Object.entries(groups).map(([gk, gs]) => (
              <div key={gk}>
                <div className="text-xs font-semibold text-slate-500 uppercase px-2 py-1">{gk}</div>
                {gs.map((s) => <button key={s.id} onClick={() => { setSection(s.id); setMobileNavOpen(false); }} className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${current.id === s.id ? "bg-emerald-50 text-emerald-700 font-medium" : "hover:bg-slate-50"}`}><s.icon className="w-4 h-4" />{s.label}</button>)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        {section === "dashboard" && <PayrollDashboard />}
        {section === "periods" && <PeriodsTab />}
        {section === "profiles" && <ProfilesTab />}
        {section === "structures" && <SimpleListTab entity="salary-structures" title="Salary Structures" fields={["name", "code", "basicSalary", "currency"]} />}
        {section === "allowances" && <SimpleListTab entity="allowances" title="Allowances" fields={["name", "code", "allowanceType", "amount", "isTaxable"]} />}
        {section === "deductions" && <SimpleListTab entity="deductions" title="Deductions" fields={["name", "code", "deductionType", "amount", "isStatutory"]} />}
        {section === "loans" && <LoansTab />}
        {section === "statutory" && <SimpleListTab entity="statutory-rules" title="Statutory Rules" fields={["name", "code", "ruleType", "rate", "borneBy"]} />}
        {section === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

function NavButton({ section, active, onClick }: { section: any; active: boolean; onClick: () => void }) {
  const Icon = section.icon;
  return <button onClick={onClick} className={`px-3 py-1.5 rounded-t-md text-sm flex items-center gap-1.5 transition-colors ${active ? "bg-emerald-600 text-white font-medium shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="w-4 h-4" />{section.label}</button>;
}

// =====================================================================
// DASHBOARD
// =====================================================================
function PayrollDashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payroll-dashboard"],
    queryFn: () => fetchJson(`/api/payroll-dashboard`),
  });
  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load dashboard" onRetry={() => refetch()} />;
  const s = data?.stats || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard label="Total Periods" value={s.totalPeriods ?? 0} icon={CalendarDays} color="from-blue-500 to-blue-600" />
        <StatCard label="Employees on Payroll" value={s.activeProfiles ?? 0} icon={Users} color="from-purple-500 to-purple-600" />
        <StatCard label="Pending Approval" value={s.pendingApproval ?? 0} icon={Clock} color="from-amber-500 to-amber-600" />
        <StatCard label="Paid Runs" value={s.paidRuns ?? 0} icon={Check} color="from-emerald-500 to-emerald-600" />
        <StatCard label="Unpaid Runs" value={s.unpaidRuns ?? 0} icon={Ban} color="from-rose-500 to-rose-600" />
        <StatCard label="Gross Payroll" value={formatCurrency(s.grossPayroll ?? 0)} icon={DollarSign} color="from-emerald-500 to-emerald-600" />
        <StatCard label="Total Deductions" value={formatCurrency(s.totalDeductions ?? 0)} icon={DollarSign} color="from-rose-500 to-rose-600" />
        <StatCard label="Net Payroll" value={formatCurrency(s.netPayroll ?? 0)} icon={DollarSign} color="from-teal-500 to-teal-600" />
      </div>
      {data?.recentPeriods?.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Recent Payroll Periods</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentPeriods.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                  <div><span className="font-medium">{p.name}</span><span className="text-slate-500 ml-2">{formatDate(p.startDate)} → {formatDate(p.endDate)}</span></div>
                  <div className="flex gap-3"><span className="text-xs text-slate-500">{p.totalEmployees} staff</span><span className="text-xs font-medium">{formatCurrency(p.netPayroll)}</span><ColoredBadge status={p.status} list={PERIOD_STATUSES} /></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${color} text-white p-3 shadow-sm`}><div className="absolute top-1 right-1 text-white/20"><Icon className="w-8 h-8" strokeWidth={1.5} /></div><div className="relative"><div className="text-xl font-bold truncate">{value}</div><div className="text-xs text-white/80 mt-0.5">{label}</div></div></div>;
}

// =====================================================================
// PERIODS TAB
// =====================================================================
function PeriodsTab() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["payroll-periods"], queryFn: () => fetchJson(`/api/payroll-periods`) });
  const items = data?.items || [];
  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await fetch(`/api/payroll-periods/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      return d;
    },
    onSuccess: (_d, v) => { toast.success(`Payroll ${v.action}d`); qc.invalidateQueries({ queryKey: ["payroll-periods"] }); qc.invalidateQueries({ queryKey: ["payroll-dashboard"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">{can(["payroll.create", "shift.manage"]) && <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Period</Button>}</div>
      {isLoading ? <LoadingState rows={4} /> : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No payroll periods" description="Create a payroll period to begin processing." icon={CalendarDays} /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div><h4 className="font-semibold">{p.name}</h4><div className="text-xs text-slate-500 mt-1">{formatDate(p.startDate)} → {formatDate(p.endDate)}</div></div>
                  <ColoredBadge status={p.status} list={PERIOD_STATUSES} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div>Employees: <span className="font-medium">{p.totalEmployees}</span></div>
                  <div>Gross: <span className="font-medium">{formatCurrency(p.grossPayroll)}</span></div>
                  <div>Deductions: <span className="font-medium">{formatCurrency(p.totalDeductions)}</span></div>
                  <div>Net: <span className="font-medium text-emerald-700">{formatCurrency(p.netPayroll)}</span></div>
                </div>
                <div className="flex gap-1">
                  {can(["payroll.process", "shift.manage"]) && p.status === "draft" && <Button size="sm" onClick={() => actionMutation.mutate({ id: p.id, action: "process" })} className="bg-blue-600 hover:bg-blue-700"><Play className="w-3 h-3 mr-1" /> Process</Button>}
                  {can(["payroll.process", "shift.manage"]) && p.status === "processing" && <Button size="sm" onClick={() => actionMutation.mutate({ id: p.id, action: "process" })} variant="outline"><RefreshCcw className="w-3 h-3 mr-1" /> Reprocess</Button>}
                  {can(["payroll.approve", "shift.manage"]) && p.status === "processing" && <Button size="sm" onClick={() => actionMutation.mutate({ id: p.id, action: "approve" })} className="bg-emerald-600 hover:bg-emerald-700"><Check className="w-3 h-3 mr-1" /> Approve</Button>}
                  {can(["payroll.lock", "shift.manage"]) && p.status === "approved" && <Button size="sm" onClick={() => actionMutation.mutate({ id: p.id, action: "lock" })} className="bg-slate-600 hover:bg-slate-700"><Lock className="w-3 h-3 mr-1" /> Lock</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {showNew && <NewPeriodDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewPeriodDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [periodType, setPeriodType] = useState("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payroll-periods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, periodType, startDate, endDate, paymentDate: paymentDate || undefined }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Period created"); qc.invalidateQueries({ queryKey: ["payroll-periods"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Create Payroll Period</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5"><FieldLabel required>Name</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., August 2026 Payroll" /></div>
        <div className="space-y-1.5"><Label>Period Type</Label><Select value={periodType} onValueChange={setPeriodType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="biweekly">Biweekly</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><FieldLabel required>Start Date</FieldLabel><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div><div className="space-y-1.5"><FieldLabel required>End Date</FieldLabel><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div></div>
        <div className="space-y-1.5"><Label>Payment Date</Label><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !startDate || !endDate} className="bg-emerald-600 hover:bg-emerald-700">Create Period</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// =====================================================================
// PROFILES TAB
// =====================================================================
function ProfilesTab() {
  const { can } = usePermissions();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["payroll-profiles"], queryFn: () => fetchJson(`/api/staff-payroll-profiles`) });
  const items = data?.items || [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">{can(["compensation.manage", "shift.manage"]) && <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Profile</Button>}</div>
      {isLoading ? <LoadingState rows={4} /> : items.length === 0 ? <Card><CardContent className="p-6"><EmptyState title="No payroll profiles" description="Create staff compensation profiles to enable payroll processing." icon={Users} /></CardContent></Card> : (
        <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-slate-50"><tr><th className="text-left p-3 font-semibold">Staff</th><th className="text-left p-3 font-semibold">Basic Salary</th><th className="text-left p-3 font-semibold">Pay Frequency</th><th className="text-left p-3 font-semibold">Payment Method</th><th className="text-left p-3 font-semibold">Status</th></tr></thead><tbody>
          {items.map((p: any) => (<tr key={p.id} className="border-b hover:bg-slate-50"><td className="p-3"><div className="font-medium">{p.staff?.firstName} {p.staff?.lastName}</div><div className="text-xs text-slate-500">{p.staff?.staffNumber}</div></td><td className="p-3 font-medium">{formatCurrency(p.basicSalary, p.currency)}</td><td className="p-3 capitalize">{p.payFrequency}</td><td className="p-3 text-xs capitalize">{p.paymentMethod?.replace(/_/g, " ")}</td><td className="p-3"><Badge variant="outline" className="capitalize">{p.payrollStatus}</Badge></td></tr>))}
        </tbody></table></div></CardContent></Card>
      )}
      {showNew && <NewProfileDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewProfileDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [basicSalary, setBasicSalary] = useState("");
  const [payFrequency, setPayFrequency] = useState("monthly");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [taxIdNumber, setTaxIdNumber] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff-payroll-profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId, basicSalary: parseFloat(basicSalary), payFrequency, paymentMethod, bankName, bankAccountNumber, bankAccountName, taxIdNumber }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Profile created"); qc.invalidateQueries({ queryKey: ["payroll-profiles"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Staff Payroll Profile</DialogTitle><DialogDescription>Set up compensation and payment details for a staff member.</DialogDescription></DialogHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
        <div className="md:col-span-2"><StaffSearchableSelect value={staffId} onValueChange={setStaffId} label="Staff Member" required /></div>
        <div className="space-y-1.5"><FieldLabel required>Basic Salary (GHS)</FieldLabel><Input type="number" step="0.01" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} placeholder="e.g., 3000" /></div>
        <div className="space-y-1.5"><Label>Pay Frequency</Label><Select value={payFrequency} onValueChange={setPayFrequency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="biweekly">Biweekly</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Payment Method</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank_transfer">Bank Transfer</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Tax ID (TIN)</Label><Input value={taxIdNumber} onChange={(e) => setTaxIdNumber(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Bank Name</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Account Number</Label><Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} /></div>
        <div className="space-y-1.5 md:col-span-2"><Label>Account Name</Label><Input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId || !basicSalary} className="bg-emerald-600 hover:bg-emerald-700">Create Profile</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// =====================================================================
// LOANS TAB
// =====================================================================
function LoansTab() {
  const { can } = usePermissions();
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState("loans");
  const { data, isLoading } = useQuery({ queryKey: ["staff-loans"], queryFn: () => fetchJson(`/api/staff-loans`) });
  const { data: advancesData } = useQuery({ queryKey: ["salary-advances"], queryFn: () => fetchJson(`/api/salary-advances`) });
  const items = data?.items || [];
  const advances = advancesData?.items || [];
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={tab === "loans" ? "default" : "outline"} onClick={() => setTab("loans")}>Loans</Button>
        <Button size="sm" variant={tab === "advances" ? "default" : "outline"} onClick={() => setTab("advances")}>Salary Advances</Button>
        {can(["loan.manage", "shift.manage"]) && <Button size="sm" onClick={() => setShowNew(true)} className="ml-auto bg-emerald-600 hover:bg-emerald-700"><Plus className="w-3 h-3 mr-1" /> New</Button>}
      </div>
      {isLoading ? <LoadingState rows={4} /> : tab === "loans" ? (
        items.length === 0 ? <Card><CardContent className="p-6"><EmptyState title="No staff loans" icon={Wallet} /></CardContent></Card> : (
          <Card><CardContent className="p-0"><table className="w-full text-sm"><thead className="border-b bg-slate-50"><tr><th className="text-left p-3 font-semibold">Staff</th><th className="text-left p-3 font-semibold">Loan Amount</th><th className="text-left p-3 font-semibold">Balance</th><th className="text-left p-3 font-semibold">Installment</th><th className="text-left p-3 font-semibold">Term</th><th className="text-left p-3 font-semibold">Status</th></tr></thead><tbody>
            {items.map((l: any) => (<tr key={l.id} className="border-b hover:bg-slate-50"><td className="p-3"><div className="font-medium">{l.staff?.firstName} {l.staff?.lastName}</div></td><td className="p-3">{formatCurrency(l.loanAmount)}</td><td className="p-3 font-medium text-rose-700">{formatCurrency(l.balance)}</td><td className="p-3">{formatCurrency(l.installment)}</td><td className="p-3">{l.term} months</td><td className="p-3"><ColoredBadge status={l.status} list={LOAN_STATUSES} /></td></tr>))}
          </tbody></table></CardContent></Card>
        )
      ) : (
        advances.length === 0 ? <Card><CardContent className="p-6"><EmptyState title="No salary advances" icon={Wallet} /></CardContent></Card> : (
          <Card><CardContent className="p-0"><table className="w-full text-sm"><thead className="border-b bg-slate-50"><tr><th className="text-left p-3 font-semibold">Staff</th><th className="text-left p-3 font-semibold">Amount</th><th className="text-left p-3 font-semibold">Balance</th><th className="text-left p-3 font-semibold">Installment</th><th className="text-left p-3 font-semibold">Status</th></tr></thead><tbody>
            {advances.map((a: any) => (<tr key={a.id} className="border-b hover:bg-slate-50"><td className="p-3"><div className="font-medium">{a.staff?.firstName} {a.staff?.lastName}</div></td><td className="p-3">{formatCurrency(a.amount)}</td><td className="p-3 font-medium text-rose-700">{formatCurrency(a.balance)}</td><td className="p-3">{formatCurrency(a.installment)}</td><td className="p-3"><ColoredBadge status={a.status} list={LOAN_STATUSES} /></td></tr>))}
          </tbody></table></CardContent></Card>
        )
      )}
      {showNew && <NewLoanDialog onClose={() => setShowNew(false)} tab={tab} />}
    </div>
  );
}

function NewLoanDialog({ onClose, tab }: { onClose: () => void; tab: string }) {
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("12");
  const [interestRate, setInterestRate] = useState("0");
  const [reason, setReason] = useState("");
  const endpoint = tab === "loans" ? "/api/staff-loans" : "/api/salary-advances";
  const mutation = useMutation({
    mutationFn: async () => {
      const body = tab === "loans" ? { staffId, loanAmount: parseFloat(amount), term: parseInt(term), interestRate: parseFloat(interestRate), startDate: new Date().toISOString(), notes: reason } : { staffId, amount: parseFloat(amount), repaymentMonths: parseInt(term), reason };
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Created"); qc.invalidateQueries({ queryKey: ["staff-loans"] }); qc.invalidateQueries({ queryKey: ["salary-advances"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{tab === "loans" ? "New Staff Loan" : "New Salary Advance"}</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <StaffSearchableSelect value={staffId} onValueChange={setStaffId} label="Staff Member" required />
        <div className="space-y-1.5"><FieldLabel required>{tab === "loans" ? "Loan Amount (GHS)" : "Advance Amount (GHS)"}</FieldLabel><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><FieldLabel required>{tab === "loans" ? "Term (months)" : "Repayment Months"}</FieldLabel><Input type="number" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
          {tab === "loans" && <div className="space-y-1.5"><Label>Interest Rate (%)</Label><Input type="number" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} /></div>}
        </div>
        <div className="space-y-1.5"><Label>Reason / Notes</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId || !amount} className="bg-emerald-600 hover:bg-emerald-700">Create</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// =====================================================================
// SIMPLE LIST TAB (for structures, allowances, deductions, statutory)
// =====================================================================
function SimpleListTab({ entity, title, fields }: { entity: string; title: string; fields: string[] }) {
  const { can } = usePermissions();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: [entity], queryFn: () => fetchJson(`/api/${entity}`) });
  const items = data?.items || [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New</Button></div>
      {isLoading ? <LoadingState rows={4} /> : items.length === 0 ? <Card><CardContent className="p-6"><EmptyState title={`No ${title.toLowerCase()} configured`} description={`Create ${title.toLowerCase()} to use in payroll processing.`} icon={Settings} /></CardContent></Card> : (
        <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-slate-50"><tr>{fields.map((f) => <th key={f} className="text-left p-3 font-semibold capitalize">{f.replace(/([A-Z])/g, " $1").trim()}</th>)}</tr></thead><tbody>
          {items.map((item: any) => (<tr key={item.id} className="border-b hover:bg-slate-50">{fields.map((f) => <td key={f} className="p-3">{typeof item[f] === "boolean" ? (item[f] ? "Yes" : "No") : String(item[f] ?? "—")}</td>)}</tr>))}
        </tbody></table></div></CardContent></Card>
      )}
      {showNew && <SimpleNewDialog entity={entity} title={title} fields={fields} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function SimpleNewDialog({ entity, title, fields, onClose }: { entity: string; title: string; fields: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${entity}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Created"); qc.invalidateQueries({ queryKey: [entity] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>New {title.slice(0, -1)}</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        {fields.map((f) => (
          <div key={f} className="space-y-1.5">
            <Label className="capitalize">{f.replace(/([A-Z])/g, " $1").trim()}</Label>
            <Input value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
          </div>
        ))}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">Create</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// =====================================================================
// SETTINGS TAB
// =====================================================================
function SettingsTab() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const seed = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seed-payroll-defaults", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Failed");
      toast.success(`Seeded: ${d.results?.statutoryRulesCreated || 0} statutory rules, ${d.results?.allowancesCreated || 0} allowances, ${d.results?.deductionsCreated || 0} deductions`);
      qc.invalidateQueries({ queryKey: ["statutory-rules"] });
      qc.invalidateQueries({ queryKey: ["allowances"] });
      qc.invalidateQueries({ queryKey: ["deductions"] });
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Payroll Configuration</CardTitle></CardHeader>
      <CardContent>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-900 mb-2">Seed default statutory rules (PAYE, SSNIT), allowances (Housing, Transport), and deductions (Union Dues, Welfare).</div>
          <Button size="sm" onClick={seed} disabled={loading} className="bg-blue-600 hover:bg-blue-700"><Settings className="w-3 h-3 mr-1" /> {loading ? "Seeding..." : "Seed Defaults"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
