"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { userService } from "@/lib/services";
import { resource } from "@/lib/api-client";
import type { User, UserStatus } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { MetricCard } from "@/components/healthcare/metric-card";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Users, Search, Filter, UserCheck, UserX, ShieldCheck, KeyRound } from "lucide-react";

const ROLE_OPTIONS = ["all", "patient", "doctor", "dentist", "pharmacy", "laboratory", "logistics", "admin"];

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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

  if (loading) return <LoadingState label="Loading users…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const activeCount = users.filter((u) => u.status === "active").length;
  const suspendedCount = users.filter((u) => u.status === "suspended").length;
  const pendingCount = users.filter((u) => u.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="Users"
        description="Every account on the platform. Status changes are allowed; password edits are not available in the prototype."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Users" }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Users" value={users.length} icon={Users} />
        <MetricCard label="Active" value={activeCount} icon={UserCheck} tone="success" />
        <MetricCard label="Pending" value={pendingCount} icon={UserX} tone="warning" />
        <MetricCard label="Suspended" value={suspendedCount} icon={ShieldCheck} tone={suspendedCount > 0 ? "danger" : "default"} />
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Search className="h-3 w-3" /> Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, user ID, profile ID…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r === "all" ? "All roles" : r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No users found" description="Try adjusting filters." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Profile ID</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-accent/40">
                    <td className="p-3">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.id}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3 capitalize">{u.role}</td>
                    <td className="p-3 text-xs font-mono text-muted-foreground">{u.profileId ?? "—"}</td>
                    <td className="p-3"><StatusBadge status={u.status} /></td>
                    <td className="p-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                        <KeyRound className="h-3.5 w-3.5 mr-1" /> Status
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
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
