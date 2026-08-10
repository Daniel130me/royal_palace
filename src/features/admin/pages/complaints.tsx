"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { complaintService } from "@/lib/services";
import { resource } from "@/lib/api-client";
import type { Complaint } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import {
  MessageSquareWarning, Search, Filter, ShieldAlert, CheckCircle2, Clock,
  AlertTriangle, ArrowRightCircle,
} from "lucide-react";

const STATUS_FLOW = ["open", "investigating", "resolved", "closed"];

const PRIORITY_TONES: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-border",
  normal: "bg-sky-100 text-sky-700 border-sky-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  urgent: "bg-rose-100 text-rose-700 border-rose-200",
};

export function AdminComplaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    complaintService.list()
      .then(setComplaints)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load complaints"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return complaints
      .filter((c) => {
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
        if (!q) return true;
        return `${c.subject} ${c.description} ${c.complainantId} ${c.complainantType}`.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [complaints, search, statusFilter, priorityFilter]);

  const openCount = complaints.filter((c) => ["open", "investigating"].includes(c.status)).length;
  const resolvedCount = complaints.filter((c) => ["resolved", "closed"].includes(c.status)).length;
  const urgentCount = complaints.filter((c) => c.priority === "urgent").length;

  const openDetail = (c: Complaint) => {
    setSelected(c);
    setNewStatus(c.status);
    setNote("");
  };

  const update = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await resource.update<Complaint>("complaint", selected.id, { status: newStatus });
      toast.success(`Complaint status updated to ${newStatus}.`);
      setSelected(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update complaint.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading complaints…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Complaints"
        description="Triage and resolve complaints raised by patients and partners across the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Complaints" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Open" value={openCount} icon={ShieldAlert} tone={openCount > 0 ? "warning" : "default"} />
        <MetricCard label="Resolved / Closed" value={resolvedCount} icon={CheckCircle2} tone="success" />
        <MetricCard label="Urgent" value={urgentCount} icon={AlertTriangle} tone={urgentCount > 0 ? "danger" : "default"} />
        <MetricCard label="Total" value={complaints.length} icon={MessageSquareWarning} />
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Search className="h-3 w-3" /> Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Subject, description, complainant…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_FLOW.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Priority</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title="No complaints" description="No complaints match your filters." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((c) => (
                <button key={c.id} onClick={() => openDetail(c)} className="w-full text-left p-4 hover:bg-accent/40 flex items-start gap-3">
                  <div className={`rounded-md p-2 shrink-0 ${PRIORITY_TONES[c.priority] ?? PRIORITY_TONES.normal}`}>
                    <MessageSquareWarning className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{c.subject}</p>
                      <StatusBadge status={c.status} />
                      <span className={`text-[10px] font-medium uppercase rounded-full px-1.5 py-0.5 border ${PRIORITY_TONES[c.priority] ?? PRIORITY_TONES.normal}`}>{c.priority}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.complainantType} · {c.complainantId} · {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                  <ArrowRightCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail / status update dialog */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelected(null)}>
          <Card className="w-full sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">{selected.subject}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{selected.complainantType} · {selected.complainantId} · {formatDateTime(selected.createdAt)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </CardHeader>
            <CardContent className="overflow-y-auto space-y-4">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={selected.status} />
                <span className={`text-xs font-medium uppercase rounded-full px-2 py-0.5 border ${PRIORITY_TONES[selected.priority] ?? PRIORITY_TONES.normal}`}>
                  Priority: {selected.priority}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm leading-relaxed">{selected.description}</p>
              </div>
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Update status</p>
                <div className="space-y-1.5">
                  <Label htmlFor="status" className="text-xs">New status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_FLOW.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="note" className="text-xs">Internal note (optional)</Label>
                  <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" rows={3} />
                </div>
                <Button onClick={() => void update()} disabled={submitting || newStatus === selected.status} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {submitting ? "Saving…" : "Update status"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
