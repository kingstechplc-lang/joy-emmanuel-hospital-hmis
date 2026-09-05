"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Server, Plus, Search, RefreshCcw, Eye, Pencil, Trash2, AlertCircle,
  BookOpen, Monitor, Clock, CheckCircle2, XCircle, TrendingUp,
  MessageSquare, ThumbsUp, Cpu, Printer, Wifi, Mail, Lock, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  safeJson, PageHeader, MiniStatCard, ClearableSearch} from "@/components/ui-helpers"
import { DataTable } from "@/components/ui/data-table";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res);
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

const TICKET_TYPES = [
  { value: "hardware", label: "Hardware", icon: Cpu },
  { value: "software", label: "Software", icon: Server },
  { value: "network", label: "Network", icon: Wifi },
  { value: "access", label: "Access Request", icon: Lock },
  { value: "email", label: "Email", icon: Mail },
  { value: "other", label: "Other", icon: AlertCircle },
];

const KB_CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "login", label: "Login & Password" },
  { value: "printing", label: "Printing" },
  { value: "network", label: "Network" },
  { value: "hmis", label: "HMIS Usage" },
  { value: "email", label: "Email" },
  { value: "security", label: "Security" },
  { value: "general", label: "General" },
];

const ASSET_TYPES = [
  { value: "all", label: "All Types" },
  { value: "desktop", label: "Desktop" },
  { value: "laptop", label: "Laptop" },
  { value: "printer", label: "Printer" },
  { value: "scanner", label: "Scanner" },
  { value: "router", label: "Router" },
  { value: "switch", label: "Switch" },
  { value: "server", label: "Server" },
  { value: "ups", label: "UPS" },
  { value: "projector", label: "Projector" },
  { value: "other", label: "Other" },
];

export function ITSupportView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can("it.manage");
  const canView = can("it.view");
  const [activeTab, setActiveTab] = useState("tickets");

  if (!canView) {
    return (
      <Card><CardContent className="p-12 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <p className="text-sm text-slate-500">You don&apos;t have permission to access IT Support.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4 fade-in-up">
      <PageHeader
        title="IT Service Desk"
        description="Hospital IT support — tickets, knowledge base, asset management, and service status"
        icon={Server}
        gradient="from-indigo-500 to-blue-600"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1 bg-slate-100 rounded-lg">
          <TabsTrigger value="tickets" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Tickets</TabsTrigger>
          <TabsTrigger value="knowledge" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Knowledge</TabsTrigger>
          <TabsTrigger value="assets" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Assets</TabsTrigger>
          <TabsTrigger value="dashboard" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="mt-4">
          <TicketTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="knowledge" className="mt-4">
          <KnowledgeBaseTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="assets" className="mt-4">
          <AssetsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// TICKET TAB
// =====================================================================
function TicketTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewTicket, setViewTicket] = useState<any>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);
  if (typeFilter !== "all") params.set("ticketType", typeFilter);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    staleTime: 0,
    queryKey: ["it-tickets", params.toString()],
    queryFn: () => fetchJson(`/api/it-tickets?${params.toString()}`),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/it-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Ticket created successfully");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["it-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  // Compute stats
  const stats = {
    total: items.length,
    open: items.filter((i) => i.status === "open").length,
    inProgress: items.filter((i) => i.status === "in_progress" || i.status === "assigned").length,
    resolved: items.filter((i) => i.status === "resolved" || i.status === "closed").length,
    escalated: items.filter((i) => i.status === "escalated").length,
  };

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStatCard label="Total Tickets" value={stats.total} icon={Server} gradient="from-indigo-500 to-blue-600" />
        <MiniStatCard label="Open" value={stats.open} icon={AlertCircle} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="In Progress" value={stats.inProgress} icon={Clock} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Resolved" value={stats.resolved} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Escalated" value={stats.escalated} icon={TrendingUp} gradient="from-purple-500 to-purple-600" />
      </div>

      {/* Filters */}
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by subject, description..." className="pl-0" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TICKET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} disabled={isFetching} variant="outline"><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> New Ticket
          </Button>
        </CardContent>
      </Card>

      {/* Ticket list */}
      <Card className="shadow-sm border-slate-200 overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="w-2 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-blue-600" />
            Tickets ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <LoadingState rows={5} /> :
           isError ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> :
           items.length === 0 ? <EmptyState title="No tickets" description="Create a new ticket to get IT support." icon={Server} /> :
           <DataTable
             headers={["Ticket #", "Subject", "Type", "Priority", "Status", "Created", "Actions"]}
             rows={items.map((item) => {
               const typeInfo = TICKET_TYPES.find((t) => t.value === item.ticketType) || TICKET_TYPES[5];
               const TypeIcon = typeInfo.icon;
               return {
                 cells: [
                   <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-slate-600 to-slate-700 px-2 py-0.5 rounded-md font-semibold">{item.ticketNumber}</span>,
                   <span key="s" className="text-sm font-medium text-slate-900 max-w-xs truncate inline-block">{item.subject}</span>,
                   <span key="t" className="inline-flex items-center gap-1 text-xs text-slate-600"><TypeIcon className="w-3 h-3" />{typeInfo.label}</span>,
                   <StatusBadge key="p" status={item.priority} />,
                   <StatusBadge key="st" status={item.status} />,
                   <span key="c" className="text-xs text-slate-500">{formatRelative(item.createdAt)}</span>,
                   <Button key="a" variant="ghost" size="sm" onClick={() => setViewTicket(item)}><Eye className="w-4 h-4" /></Button>,
                 ],
                 sortValues: [item.ticketNumber, item.subject, typeInfo.label, item.priority, item.status, item.createdAt, ""],
                 onClick: () => setViewTicket(item),
               };
             })}
             gradient="from-indigo-500 to-blue-600"
             pageSize={10}
           />}
        </CardContent>
      </Card>

      {/* Create ticket dialog */}
      {showForm && <TicketForm open={showForm} onOpenChange={setShowForm} onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />}

      {/* Ticket detail dialog */}
      {viewTicket && <TicketDetail ticket={viewTicket} canManage={canManage} onClose={() => setViewTicket(null)} />}
    </div>
  );
}

// =====================================================================
// TICKET FORM
// =====================================================================
function TicketForm({ open, onOpenChange, onSubmit, loading }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    ticketType: "hardware",
    subject: "",
    description: "",
    priority: "medium",
    affectedSystem: "",
    reportedByName: "",
    reportedByPhone: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2"><Server className="w-5 h-5 text-indigo-600" /> New IT Support Ticket</DialogTitle>
          <DialogDescription className="text-white/80">Report a technical issue or request IT assistance.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Ticket Type</FieldLabel>
            <Select value={form.ticketType} onValueChange={(v) => set("ticketType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TICKET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Priority</FieldLabel>
            <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <FieldLabel>Subject</FieldLabel>
            <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Brief summary of the issue" />
          </div>
          <div className="col-span-2">
            <FieldLabel>Description</FieldLabel>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Detailed description of the problem..." />
          </div>
          <div>
            <Label>Affected System</Label>
            <Input value={form.affectedSystem} onChange={(e) => set("affectedSystem", e.target.value)} placeholder="e.g., HMIS, Email, Network" />
          </div>
          <div>
            <Label>Reported By</Label>
            <Input value={form.reportedByName} onChange={(e) => set("reportedByName", e.target.value)} placeholder="Your name" />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(form)} disabled={loading || !form.subject || !form.description}>
            {loading ? "Creating..." : "Create Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// TICKET DETAIL — with comments
// =====================================================================
function TicketDetail({ ticket, canManage, onClose }: { ticket: any; canManage: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentType, setCommentType] = useState("public");
  const [loadingComments, setLoadingComments] = useState(true);

  // Fetch comments
  useState(() => {
    fetch(`/api/it-tickets/${ticket.id}/comments`)
      .then((r) => r.json())
      .then((d) => { setComments(d.items || []); setLoadingComments(false); })
      .catch(() => setLoadingComments(false));
  });

  const addComment = async () => {
    if (!newComment) return;
    try {
      const res = await fetch(`/api/it-tickets/${ticket.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment, commentType }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setComments([...comments, data.item]);
      setNewComment("");
      toast.success(commentType === "internal" ? "Internal note added" : "Reply sent");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const updateStatus = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/it-tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Status changed to ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["it-tickets"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const typeInfo = TICKET_TYPES.find((t) => t.value === ticket.ticketType) || TICKET_TYPES[5];
  const TypeIcon = typeInfo.icon;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <TypeIcon className="w-5 h-5 text-indigo-600" />
            {ticket.ticketNumber} — {ticket.subject}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Created {formatDate(ticket.createdAt, true)} by {ticket.reportedByName || "Unknown"}
          </DialogDescription>
        </DialogHeader>

        {/* Ticket info */}
        <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
          <div><Label className="text-slate-500">Type</Label><div className="font-semibold text-slate-800">{typeInfo.label}</div></div>
          <div><Label className="text-slate-500">Priority</Label><div><StatusBadge status={ticket.priority} /></div></div>
          <div><Label className="text-slate-500">Status</Label><div><StatusBadge status={ticket.status} /></div></div>
          <div><Label className="text-slate-500">Affected System</Label><div className="text-slate-700">{ticket.affectedSystem || "—"}</div></div>
          <div><Label className="text-slate-500">Assigned To</Label><div className="text-slate-700">{ticket.assignedToName || "Unassigned"}</div></div>
          <div><Label className="text-slate-500">Resolution Time</Label><div className="text-slate-700">{ticket.resolutionTimeMins ? `${ticket.resolutionTimeMins} mins` : "—"}</div></div>
        </div>

        {/* Description */}
        <div>
          <Label className="text-slate-500">Description</Label>
          <p className="mt-1 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-3">{ticket.description}</p>
        </div>

        {/* Resolution (if resolved) */}
        {ticket.resolution && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <Label className="text-emerald-700">Resolution</Label>
            <p className="mt-1 text-sm text-emerald-800">{ticket.resolution}</p>
          </div>
        )}

        {/* Status actions */}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {ticket.status !== "assigned" && <Button size="sm" variant="outline" onClick={() => updateStatus("assigned")}>Assign</Button>}
            {ticket.status !== "in_progress" && <Button size="sm" variant="outline" onClick={() => updateStatus("in_progress")}>Start Work</Button>}
            {ticket.status !== "escalated" && <Button size="sm" variant="outline" className="text-purple-600" onClick={() => updateStatus("escalated")}>Escalate</Button>}
            {ticket.status !== "resolved" && <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => updateStatus("resolved")}>Resolve</Button>}
            {ticket.status !== "closed" && <Button size="sm" variant="outline" onClick={() => updateStatus("closed")}>Close</Button>}
          </div>
        )}

        {/* Comments / Conversation */}
        <div className="border-t pt-3">
          <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Conversation ({comments.length})
          </h4>
          {loadingComments ? <LoadingState rows={2} /> : (
            <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
              {comments.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">No comments yet</p> :
              comments.map((c) => (
                <div key={c.id} className={`p-2 rounded-lg text-xs ${c.commentType === "internal" ? "bg-amber-50 border border-amber-200" : "bg-blue-50 border border-blue-200"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-800">{c.authorName || "Unknown"}</span>
                    {c.commentType === "internal" && <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-bold">INTERNAL</span>}
                    <span className="text-slate-400">{formatRelative(c.createdAt)}</span>
                  </div>
                  <p className="text-slate-700">{c.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          <div className="flex gap-2">
            {canManage && (
              <Select value={commentType} onValueChange={setCommentType}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public Reply</SelectItem>
                  <SelectItem value="internal">Internal Note</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder={commentType === "internal" ? "Add internal note (IT staff only)..." : "Type a reply..."} className="flex-1" />
            <Button size="sm" onClick={addComment} disabled={!newComment}>Send</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// KNOWLEDGE BASE TAB
// =====================================================================
function KnowledgeBaseTab({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewArticle, setViewArticle] = useState<any>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category !== "all") params.set("category", category);

  const { data, isLoading, refetch, isFetching } = useQuery({
    staleTime: 0,
    queryKey: ["kb-articles", params.toString()],
    queryFn: () => fetchJson(`/api/knowledge-base?${params.toString()}`),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/knowledge-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Article published");
      setShowForm(false);
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const articles: any[] = data?.items || [];
  const categoryIcons: Record<string, any> = { login: Lock, printing: Printer, network: Wifi, hmis: Server, email: Mail, security: ShieldCheck, general: BookOpen };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search knowledge base..." className="pl-0" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{KB_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          {canManage && <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white"><Plus className="w-4 h-4 mr-1" /> New Article</Button>}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       articles.length === 0 ? <EmptyState title="No articles found" description="Search for solutions or create a new knowledge base article." icon={BookOpen} /> :
       <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
         {articles.map((a) => {
           const CatIcon = categoryIcons[a.category] || BookOpen;
           return (
             <Card key={a.id} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer rounded-xl card-hover-lift" onClick={() => setViewArticle(a)}>
               <CardContent className="p-4">
                 <div className="flex items-start gap-3">
                   <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shrink-0">
                     <CatIcon className="w-5 h-5" />
                   </div>
                   <div className="flex-1 min-w-0">
                     <h3 className="font-bold text-slate-900 text-sm truncate">{a.title}</h3>
                     <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.content.replace(/[#*`]/g, "").slice(0, 120)}</p>
                     <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                       <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium">{a.category}</span>
                       <span>{a.viewCount} views</span>
                       <span>Updated {formatRelative(a.updatedAt)}</span>
                     </div>
                   </div>
                 </div>
               </CardContent>
             </Card>
           );
         })}
       </div>}

      {showForm && canManage && (
        <Dialog open onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white"><DialogTitle className="text-white flex items-center gap-2"><BookOpen className="w-5 h-5" /> New Knowledge Base Article</DialogTitle></DialogHeader>
            <KBForm onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}

      {viewArticle && (
        <Dialog open onOpenChange={() => setViewArticle(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white"><DialogTitle className="text-white">{viewArticle.title}</DialogTitle></DialogHeader>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{viewArticle.content}</div>
            <div className="flex items-center gap-3 mt-4 pt-3 border-t text-xs text-slate-500">
              <span>Category: <strong>{viewArticle.category}</strong></span>
              <span>Views: {viewArticle.viewCount}</span>
              <span>By: {viewArticle.authorName || "IT Team"}</span>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function KBForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({ title: "", category: "general", content: "", keywords: "" });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-3">
      <div><FieldLabel>Title</FieldLabel><Input value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
      <div>
        <FieldLabel>Category</FieldLabel>
        <Select value={form.category} onValueChange={(v) => set("category", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{KB_CATEGORIES.filter((c) => c.value !== "all").map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><FieldLabel>Content</FieldLabel><Textarea value={form.content} onChange={(e) => set("content", e.target.value)} rows={8} placeholder="Write the article content..." /></div>
      <div><Label>Keywords (comma-separated)</Label><Input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="password, login, reset" /></div>
      <DialogFooter className="p-6 pt-4 shrink-0 border-t"><Button variant="outline" onClick={() => {}}>Cancel</Button><Button onClick={() => onSubmit(form)} disabled={loading || !form.title || !form.content}>{loading ? "Publishing..." : "Publish Article"}</Button></DialogFooter>
    </div>
  );
}

// =====================================================================
// ASSETS TAB
// =====================================================================
function AssetsTab({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewAsset, setViewAsset] = useState<any>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (typeFilter !== "all") params.set("assetType", typeFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    staleTime: 0,
    queryKey: ["it-assets", params.toString()],
    queryFn: () => fetchJson(`/api/it-assets?${params.toString()}`),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/it-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("IT asset registered");
      setShowForm(false);
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assets: any[] = data?.items || [];
  const assetIcons: Record<string, any> = { desktop: Monitor, laptop: Monitor, printer: Printer, scanner: Printer, router: Wifi, switch: Wifi, server: Server, ups: Server, projector: Monitor, other: Cpu };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by tag, serial, model..." className="pl-0" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{ASSET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="repair">In Repair</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} disabled={isFetching} variant="outline"><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          {canManage && <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white"><Plus className="w-4 h-4 mr-1" /> New Asset</Button>}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       assets.length === 0 ? <EmptyState title="No IT assets" description="Register IT equipment to track maintenance and issues." icon={Monitor} /> :
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
         {assets.map((a) => {
           const AssetIcon = assetIcons[a.assetType] || Cpu;
           return (
             <Card key={a.id} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer rounded-xl card-hover-lift" onClick={() => setViewAsset(a)}>
               <CardContent className="p-4">
                 <div className="flex items-start justify-between mb-2">
                   <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white">
                     <AssetIcon className="w-5 h-5" />
                   </div>
                   <StatusBadge status={a.status} />
                 </div>
                 <h3 className="font-bold text-slate-900 text-sm">{a.assetTag}</h3>
                 <p className="text-xs text-slate-500 mt-1">{a.manufacturer} {a.model}</p>
                 <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                   <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium uppercase">{a.assetType}</span>
                   {a.assignedToName && <span>→ {a.assignedToName}</span>}
                   {a._count?.tickets > 0 && <span className="text-rose-500 font-medium">{a._count.tickets} tickets</span>}
                 </div>
               </CardContent>
             </Card>
           );
         })}
       </div>}

      {showForm && canManage && (
        <Dialog open onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white"><DialogTitle className="text-white flex items-center gap-2"><Monitor className="w-5 h-5" /> Register IT Asset</DialogTitle></DialogHeader>
            <AssetForm onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}

      {viewAsset && (
        <Dialog open onOpenChange={() => setViewAsset(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white"><DialogTitle className="text-white">{viewAsset.assetTag} — {viewAsset.manufacturer} {viewAsset.model}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><Label className="text-slate-500">Type</Label><div className="font-semibold uppercase">{viewAsset.assetType}</div></div>
              <div><Label className="text-slate-500">Status</Label><div><StatusBadge status={viewAsset.status} /></div></div>
              <div><Label className="text-slate-500">Serial Number</Label><div className="font-mono">{viewAsset.serialNumber || "—"}</div></div>
              <div><Label className="text-slate-500">Location</Label><div>{viewAsset.location || "—"}</div></div>
              <div><Label className="text-slate-500">Assigned To</Label><div>{viewAsset.assignedToName || "Unassigned"}</div></div>
              <div><Label className="text-slate-500">Condition</Label><div className="capitalize">{viewAsset.condition || "—"}</div></div>
              {viewAsset.ipAddress && <div><Label className="text-slate-500">IP Address</Label><div className="font-mono">{viewAsset.ipAddress}</div></div>}
              {viewAsset.macAddress && <div><Label className="text-slate-500">MAC Address</Label><div className="font-mono">{viewAsset.macAddress}</div></div>}
              {viewAsset.warrantyExpiry && <div><Label className="text-slate-500">Warranty Expiry</Label><div>{formatDate(viewAsset.warrantyExpiry)}</div></div>}
              {viewAsset.notes && <div className="col-span-2"><Label className="text-slate-500">Notes</Label><div className="text-slate-700">{viewAsset.notes}</div></div>}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AssetForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    assetType: "desktop", manufacturer: "", model: "", serialNumber: "",
    location: "", departmentCode: "", assignedToName: "", operatingSystem: "",
    ipAddress: "", macAddress: "", notes: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>Asset Type</FieldLabel><Select value={form.assetType} onValueChange={(v) => set("assetType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ASSET_TYPES.filter((t) => t.value !== "all").map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} placeholder="Dell, HP, Cisco..." /></div>
        <div><Label>Model</Label><Input value={form.model} onChange={(e) => set("model", e.target.value)} /></div>
        <div><Label>Serial Number</Label><Input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} /></div>
        <div><Label>Location</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Room, floor, area" /></div>
        <div><Label>Assigned To</Label><Input value={form.assignedToName} onChange={(e) => set("assignedToName", e.target.value)} /></div>
        <div><Label>IP Address</Label><Input value={form.ipAddress} onChange={(e) => set("ipAddress", e.target.value)} placeholder="192.168.1.100" /></div>
        <div><Label>MAC Address</Label><Input value={form.macAddress} onChange={(e) => set("macAddress", e.target.value)} /></div>
      </div>
      <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
      <DialogFooter className="p-6 pt-4 shrink-0 border-t"><Button onClick={() => onSubmit(form)} disabled={loading || !form.assetType}>{loading ? "Registering..." : "Register Asset"}</Button></DialogFooter>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["it-tickets-dashboard"],
    queryFn: () => fetchJson("/api/it-tickets?limit=500"),
  });
  const tickets: any[] = data?.items || [];

  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    inProgress: tickets.filter((t) => t.status === "in_progress" || t.status === "assigned").length,
    resolved: tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
    escalated: tickets.filter((t) => t.status === "escalated").length,
    critical: tickets.filter((t) => t.priority === "critical").length,
    avgResolution: tickets.filter((t) => t.resolutionTimeMins).reduce((sum, t) => sum + (t.resolutionTimeMins || 0), 0) / (tickets.filter((t) => t.resolutionTimeMins).length || 1),
  };

  // By type
  const byType = TICKET_TYPES.map((t) => ({
    label: t.label,
    value: tickets.filter((ticket) => ticket.ticketType === t.value).length,
  })).filter((t) => t.value > 0);

  return (
    <div className="space-y-4">
      {isLoading ? <LoadingState rows={4} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <MiniStatCard label="Total" value={stats.total} icon={Server} gradient="from-indigo-500 to-blue-600" />
            <MiniStatCard label="Open" value={stats.open} icon={AlertCircle} gradient="from-rose-500 to-red-600" />
            <MiniStatCard label="In Progress" value={stats.inProgress} icon={Clock} gradient="from-amber-500 to-orange-600" />
            <MiniStatCard label="Resolved" value={stats.resolved} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
            <MiniStatCard label="Escalated" value={stats.escalated} icon={TrendingUp} gradient="from-purple-500 to-purple-600" />
            <MiniStatCard label="Critical" value={stats.critical} icon={AlertCircle} gradient="from-rose-600 to-red-700" />
            <MiniStatCard label="Avg Resolution" value={stats.avgResolution > 0 ? `${Math.round(stats.avgResolution)}m` : "—"} icon={Clock} gradient="from-cyan-500 to-blue-600" />
          </div>

          {/* By type breakdown */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-blue-600" />
                Tickets by Type
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {byType.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">No tickets yet</p> :
              <div className="space-y-2">
                {byType.map((t) => (
                  <div key={t.label} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-700 w-24">{t.label}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 rounded-full flex items-center justify-end pr-2" style={{ width: `${stats.total > 0 ? (t.value / stats.total) * 100 : 0}%` }}>
                        <span className="text-[10px] text-white font-bold">{t.value}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
