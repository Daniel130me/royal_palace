"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { complaintService } from "@/lib/services";
import { resource } from "@/lib/api-client";
import type { Complaint } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, LoadingState, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import {
  MessageSquareWarning, Search, ShieldAlert, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_FLOW = ["open", "investigating", "resolved", "closed"];

type FilterKey = "open" | "resolved" | "all";

const PRIORITY_TONES: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-border",
  normal: "bg-sky-50 text-sky-700 border-sky-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  urgent: "bg-rose-50 text-rose-700 border-rose-200",
};

export function AdminComplaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("open");
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

  const counts = useMemo(() => ({
    open: complaints.filter((c) => ["open", "investigating"].includes(c.status)).length,
    resolved: complaints.filter((c) => ["resolved", "closed"].includes(c.status)).length,
    all: complaints.length,
  }), [complaints]);

  const urgentCount = complaints.filter((c) => c.priority === "urgent").length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return complaints
      .filter((c) => {
        if (filter === "open" && !["open", "investigating"].includes(c.status)) return false;
        if (filter === "resolved" && !["resolved", "closed"].includes(c.status)) return false;
        if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
        if (!q) return true;
        return `${c.subject} ${c.description} ${c.complainantId} ${c.complainantType}`.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [complaints, search, filter, priorityFilter]);

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

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Complaints"
        description="Triage and resolve complaints raised by patients and partners."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Complaints" }]}
      />

      {/* StatTiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Open" value={counts.open} icon={ShieldAlert} tone="warning" />
        <StatTile label="Resolved" value={counts.resolved} icon={CheckCircle2} tone="success" />
        <StatTile label="Urgent" value={urgentCount} icon={AlertTriangle} tone={urgentCount > 0 ? "danger" : "default"} />
        <StatTile label="Total" value={counts.all} icon={MessageSquareWarning} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Subject, description, complainant…" className="pl-9" />
      </div>

      {/* SegmentedControl filter */}
      <SegmentedControl
        options={[
          { value: "open" as FilterKey, label: "Open", badge: counts.open },
          { value: "resolved" as FilterKey, label: "Resolved", badge: counts.resolved },
          { value: "all" as FilterKey, label: "All", badge: counts.all },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {/* Priority filter chips */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 lg:mx-0 lg:px-0">
        {["all", "urgent", "high", "normal", "low"].map((p) => {
          const active = priorityFilter === p;
          const count = p === "all" ? complaints.length : complaints.filter((c) => c.priority === p).length;
          return (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-all tap-highlight-none",
                active ? "bg-primary text-primary-foreground shadow-soft" : "bg-card border border-border/60 text-muted-foreground hover:bg-accent"
              )}
            >
              {p === "all" ? "All priorities" : p}
              <span className={cn("text-[10px] rounded-full px-1", active ? "bg-primary-foreground/20" : "bg-muted")}>{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title="No complaints" description="No complaints match your filters." compact />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {visible.map((c) => (
            <CompactListItem
              key={c.id}
              leading={
                <div className={cn("rounded-lg p-2 border", PRIORITY_TONES[c.priority] ?? PRIORITY_TONES.normal)}>
                  <MessageSquareWarning className="h-4 w-4" />
                </div>
              }
              title={c.subject}
              subtitle={`${c.complainantType} · ${c.complainantId} · ${formatDateTime(c.createdAt)}`}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={c.status} size="sm" />
                  <span className={cn("text-[10px] font-medium uppercase tracking-wider rounded-md px-1.5 py-0.5 border", PRIORITY_TONES[c.priority] ?? PRIORITY_TONES.normal)}>
                    {c.priority}
                  </span>
                </div>
              }
              onClick={() => openDetail(c)}
              chevron
            />
          ))}
        </div>
      )}

      {/* Detail / status update dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.subject}</DialogTitle>
            <DialogDescription>
              {selected?.complainantType} · {selected?.complainantId} · {selected ? formatDateTime(selected.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={selected.status} size="sm" />
                <span className={cn("text-xs font-medium uppercase tracking-wider rounded-md px-2 py-0.5 border", PRIORITY_TONES[selected.priority] ?? PRIORITY_TONES.normal)}>
                  Priority: {selected.priority}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Description</p>
                <p className="text-sm leading-relaxed">{selected.description}</p>
              </div>
              <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Update status</p>
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
                <Button onClick={() => void update()} disabled={submitting || newStatus === selected.status} className="w-full">
                  {submitting ? "Saving…" : "Update status"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
