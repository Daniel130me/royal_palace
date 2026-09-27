"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { userService } from "@/lib/services";
import { resource } from "@/lib/api-client";
import type { User, UserStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, LoadingState, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Users, Search, UserCheck, UserX, ShieldCheck, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = ["all", "patient", "doctor", "dentist", "pharmacy", "laboratory", "logistics", "admin"];

type StatusFilter = "all" | "active" | "pending" | "suspended";

const ROLE_TONE: Record<string, string> = {
  patient: "bg-sky-50 text-sky-700 ring-sky-100",
  doctor: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  dentist: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  pharmacy: "bg-amber-50 text-amber-700 ring-amber-100",
  laboratory: "bg-violet-50 text-violet-700 ring-violet-100",
  logistics: "bg-sky-50 text-sky-700 ring-sky-100",
  admin: "bg-rose-50 text-rose-700 ring-rose-100",
};

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [editing, setEditing] = useState<User | null>(null);
  const [newStatus, setNewStatus] = useState<UserStatus>("active");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    userService.list()
      .then(setUsers)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    all: users.length,
    active: users.filter((u) => u.status === "active").length,
    pending: users.filter((u) => u.status === "pending").length,
    suspended: users.filter((u) => u.status === "suspended").length,
  }), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!q) return true;
      return `${u.name} ${u.email} ${u.id} ${u.profileId ?? ""}`.toLowerCase().includes(q);
    });
  }, [users, search, roleFilter, statusFilter]);

  const openEdit = (u: User) => {
    setEditing(u);
    setNewStatus(u.status);
  };

  const submit = async () => {
    if (!editing) return;
    setSubmitting(true);
    try {
      await resource.update<User>("user", editing.id, { status: newStatus });
      toast.success(`User ${editing.name} status updated to ${newStatus}.`);
      setEditing(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update user.");
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
        title="Users"
        description="Every account on the platform. Status changes are allowed."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Users" }]}
      />

      {/* StatTiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Total" value={counts.all} icon={Users} />
        <StatTile label="Active" value={counts.active} icon={UserCheck} tone="success" />
        <StatTile label="Pending" value={counts.pending} icon={UserX} tone="warning" />
        <StatTile label="Suspended" value={counts.suspended} icon={ShieldCheck} tone={counts.suspended > 0 ? "danger" : "default"} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, user ID, profile ID…" className="pl-9" />
      </div>

      {/* SegmentedControl status filter */}
      <SegmentedControl
        options={[
          { value: "all" as StatusFilter, label: "All", badge: counts.all },
          { value: "active" as StatusFilter, label: "Active", badge: counts.active },
          { value: "pending" as StatusFilter, label: "Pending", badge: counts.pending },
          { value: "suspended" as StatusFilter, label: "Suspended", badge: counts.suspended },
        ]}
        value={statusFilter}
        onChange={setStatusFilter}
        size="sm"
      />

      {/* Role filter chips */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 lg:mx-0 lg:px-0">
        {ROLE_OPTIONS.map((r) => {
          const active = roleFilter === r;
          const count = r === "all" ? users.length : users.filter((u) => u.role === r).length;
          return (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-all tap-highlight-none",
                active ? "bg-primary text-primary-foreground shadow-soft" : "bg-card border border-border/60 text-muted-foreground hover:bg-accent"
              )}
            >
              {r === "all" ? "All roles" : r}
              <span className={cn("text-[10px] rounded-full px-1", active ? "bg-primary-foreground/20" : "bg-muted")}>{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No users found" description="Try adjusting filters." compact />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((u) => (
            <CompactListItem
              key={u.id}
              leading={
                <div className={cn("rounded-lg p-2 ring-1", ROLE_TONE[u.role] ?? "bg-muted text-muted-foreground ring-border")}>
                  <Users className="h-4 w-4" />
                </div>
              }
              title={u.name}
              subtitle={`${u.email} · ${u.role} · ${u.id}`}
              trailing={
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={u.status} size="sm" />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openEdit(u); }} aria-label="Change status">
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                </div>
              }
              onClick={() => openEdit(u)}
              chevron
            />
          ))}
        </div>
      )}

      {/* Status edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update user status</DialogTitle>
            <DialogDescription>
              Change the account status for {editing?.name} ({editing?.email}). Password edits are not available in the prototype.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs">New status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as UserStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              Current status: <span className="font-medium text-foreground">{editing?.status}</span>
              <br />
              Last updated: {editing ? formatDate(new Date().toISOString()) : ""}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={submitting || !editing || newStatus === editing.status}>
              {submitting ? "Saving…" : "Update status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
