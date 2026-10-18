"use client";

import type {
  AdminComplaintListItem,
  AdminComplaintPriority,
  AdminComplaintScope,
  AdminComplaintStatus,
  AdminComplaintSummary,
} from "@royal-palace/contracts";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareWarning,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { administrationService } from "@/lib/services";
import { cn } from "@/lib/utils";

const EMPTY_SUMMARY: AdminComplaintSummary = { all: 0, open: 0, resolved: 0, urgent: 0 };
const PRIORITIES: readonly (AdminComplaintPriority | "ALL")[] = [
  "ALL",
  "URGENT",
  "HIGH",
  "NORMAL",
  "LOW",
];
const STATUSES: readonly AdminComplaintStatus[] = ["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"];
const ALLOWED_TRANSITIONS: Readonly<Record<AdminComplaintStatus, readonly AdminComplaintStatus[]>> =
  {
    OPEN: ["INVESTIGATING", "RESOLVED", "CLOSED"],
    INVESTIGATING: ["OPEN", "RESOLVED", "CLOSED"],
    RESOLVED: ["INVESTIGATING", "CLOSED"],
    CLOSED: ["INVESTIGATING"],
  };
const PRIORITY_TONES: Record<AdminComplaintPriority, string> = {
  LOW: "bg-muted text-muted-foreground border-border",
  NORMAL: "bg-sky-50 text-sky-700 border-sky-200",
  HIGH: "bg-amber-50 text-amber-700 border-amber-200",
  URGENT: "bg-rose-50 text-rose-700 border-rose-200",
};

export function AdminComplaints() {
  const [complaints, setComplaints] = useState<AdminComplaintListItem[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<AdminComplaintScope>("OPEN");
  const [priority, setPriority] = useState<AdminComplaintPriority | "ALL">("ALL");
  const [selected, setSelected] = useState<AdminComplaintListItem | null>(null);
  const [newStatus, setNewStatus] = useState<AdminComplaintStatus>("OPEN");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const availableStatuses =
    selected === null ? STATUSES : [selected.status, ...ALLOWED_TRANSITIONS[selected.status]];

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void administrationService
      .complaints({
        limit: 25,
        ...(priority === "ALL" ? {} : { priority }),
        ...(query ? { query } : {}),
        scope,
      })
      .then((page) => {
        setComplaints([...page.data]);
        setSummary(page.summary);
        setNextCursor(page.pageInfo.endCursor);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Complaints could not be loaded."),
      )
      .finally(() => setLoading(false));
  }, [priority, query, scope]);
  useEffect(load, [load]);

  const loadMore = async () => {
    if (nextCursor === null) return;
    setLoadingMore(true);
    try {
      const page = await administrationService.complaints({
        cursor: nextCursor,
        limit: 25,
        ...(priority === "ALL" ? {} : { priority }),
        ...(query ? { query } : {}),
        scope,
      });
      setComplaints((current) => [...current, ...page.data]);
      setNextCursor(page.pageInfo.endCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Older complaints could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };
  const openDetail = (complaint: AdminComplaintListItem) => {
    setSelected(complaint);
    setNewStatus(complaint.status);
    setNote("");
  };
  const update = async () => {
    if (selected === null || selected.status === newStatus) return;
    setSubmitting(true);
    try {
      await administrationService.transitionComplaint(selected.id, {
        expectedVersion: selected.version,
        ...(note.trim() ? { internalNote: note.trim() } : {}),
        status: newStatus,
      });
      toast.success(`Complaint moved to ${newStatus.toLowerCase()}.`);
      setSelected(null);
      load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Complaint could not be updated.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && complaints.length === 0)
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error !== null && complaints.length === 0)
    return <ErrorState message={error} onRetry={load} />;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Complaints"
        description="Triage and resolve complaints through an auditable workflow."
        breadcrumbs={[
          { label: "Admin", onClick: () => navigate("admin", "dashboard") },
          { label: "Complaints" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Open" value={summary.open} icon={ShieldAlert} tone="warning" />
        <StatTile label="Resolved" value={summary.resolved} icon={CheckCircle2} tone="success" />
        <StatTile
          label="Urgent"
          value={summary.urgent}
          icon={AlertTriangle}
          tone={summary.urgent > 0 ? "danger" : "default"}
        />
        <StatTile label="Total" value={summary.all} icon={MessageSquareWarning} />
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search complaints"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Complaint number, subject, or submitter ID…"
          className="pl-9"
        />
      </div>
      <SegmentedControl
        options={[
          { value: "OPEN" as AdminComplaintScope, label: "Open", badge: summary.open },
          { value: "RESOLVED" as AdminComplaintScope, label: "Resolved", badge: summary.resolved },
          { value: "ALL" as AdminComplaintScope, label: "All", badge: summary.all },
        ]}
        value={scope}
        onChange={setScope}
        size="sm"
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PRIORITIES.map((value) => (
          <button
            key={value}
            onClick={() => setPriority(value)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize",
              priority === value
                ? "bg-primary text-primary-foreground"
                : "border bg-card text-muted-foreground",
            )}
          >
            {value === "ALL" ? "All priorities" : value.toLowerCase()}
          </button>
        ))}
      </div>
      {error !== null && <ErrorState message={error} onRetry={load} />}
      {complaints.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="No complaints"
          description="No complaint matches these server-side filters."
          compact
        />
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card">
          {complaints.map((complaint) => (
            <CompactListItem
              key={complaint.id}
              leading={
                <div className={cn("rounded-lg border p-2", PRIORITY_TONES[complaint.priority])}>
                  <MessageSquareWarning className="h-4 w-4" />
                </div>
              }
              title={complaint.subject}
              subtitle={`${complaint.complaintNumber} · ${complaint.complainantType} · ${formatDateTime(complaint.createdAt)}`}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={complaint.status.toLowerCase()} size="sm" />
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                      PRIORITY_TONES[complaint.priority],
                    )}
                  >
                    {complaint.priority}
                  </span>
                </div>
              }
              onClick={() => openDetail(complaint)}
              chevron
            />
          ))}
        </div>
      )}
      {nextCursor !== null && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more complaints"}
          </Button>
        </div>
      )}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.subject}</DialogTitle>
            <DialogDescription>
              {selected?.complaintNumber} · {selected?.complainantType}
            </DialogDescription>
          </DialogHeader>
          {selected !== null && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed">{selected.description}</p>
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="space-y-1.5">
                  <Label>New status</Label>
                  <Select
                    value={newStatus}
                    onValueChange={(value) => setNewStatus(value as AdminComplaintStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStatuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.toLowerCase().replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="complaint-note">Internal note (optional)</Label>
                  <Textarea
                    id="complaint-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={2000}
                    rows={3}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={submitting || newStatus === selected.status}
                  onClick={() => void update()}
                >
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
