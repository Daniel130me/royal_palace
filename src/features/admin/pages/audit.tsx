"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { auditService } from "@/lib/services";
import type { AuditLog } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatDateTime } from "@/lib/format";
import { ScrollText, Search, Filter, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const ROLE_OPTIONS = ["all", "patient", "doctor", "dentist", "pharmacy", "laboratory", "logistics", "admin"];

export function AdminAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const load = () => {
    setLoading(true);
    setError(null);
    auditService.list()
      .then(setLogs)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load audit log"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const actions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (roleFilter !== "all" && l.actorRole !== roleFilter) return false;
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (!q) return true;
      return `${l.description} ${l.actorId} ${l.action} ${l.entityType} ${l.entityId}`.toLowerCase().includes(q);
    });
  }, [logs, search, roleFilter, actionFilter]);

  if (loading) return <LoadingState label="Loading audit trail…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const exportCsv = () => {
    const rows = [
      ["Timestamp", "Actor ID", "Actor Role", "Action", "Entity Type", "Entity ID", "Description"],
      ...filtered.map((l) => [l.timestamp, l.actorId, l.actorRole, l.action, l.entityType, l.entityId, `"${l.description.replace(/"/g, '""')}"`]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Immutable record of every action across the platform — who did what, when, and on which entity. This is a key compliance view."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Audit Trail" }]}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_240px]">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Search className="h-3 w-3" /> Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Description, actor ID, entity…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Actor role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r === "all" ? "All roles" : r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Action</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total events</p>
          <p className="text-2xl font-bold mt-1">{logs.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Filtered</p>
          <p className="text-2xl font-bold mt-1">{filtered.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Admin actions</p>
          <p className="text-2xl font-bold mt-1 text-emerald-700">{logs.filter((l) => l.actorRole === "admin").length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Latest event</p>
          <p className="text-sm font-medium mt-1">{logs[0] ? formatDateTime(logs[0].timestamp) : "—"}</p>
        </CardContent></Card>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit events" description="No events match your filters." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-y-auto divide-y">
              {filtered.map((l) => (
                <div key={l.id} className="flex items-start gap-3 p-4 hover:bg-accent/30">
                  <div className="rounded-md bg-muted p-2 shrink-0">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{l.description}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span>By <span className="font-medium text-foreground">{l.actorId}</span></span>
                      <StatusBadge status={l.actorRole === "admin" ? "approved" : l.actorRole === "patient" ? "scheduled" : "in_progress"} />
                      <span>Action: <span className="font-mono">{l.action}</span></span>
                      <span>Entity: <span className="font-mono">{l.entityType}/{l.entityId}</span></span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(l.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
