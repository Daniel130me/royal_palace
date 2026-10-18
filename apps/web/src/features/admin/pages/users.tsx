"use client";

import type {
  AdminPrincipalListItem,
  AdminPrincipalScope,
  PlatformRole,
} from "@royal-palace/contracts";
import { KeyRound, Search, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useState } from "react";
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
  DialogFooter,
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
import { navigate } from "@/lib/nav";
import { administrationService } from "@/lib/services";
import { cn } from "@/lib/utils";

const ROLES: readonly PlatformRole[] = [
  "PATIENT",
  "PROVIDER",
  "MANAGER",
  "ORGANIZATION_APPLICANT",
  "ORGANIZATION_ADMIN",
  "ORGANIZATION_STAFF",
  "SUPPORT",
  "FINANCE",
  "LOGISTICS",
  "ADMINISTRATOR",
];

export function AdminUsers() {
  const [users, setUsers] = useState<AdminPrincipalListItem[]>([]);
  const [summary, setSummary] = useState({ active: 0, all: 0, disabled: 0 });
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const [role, setRole] = useState<PlatformRole | "ALL">("ALL");
  const [scope, setScope] = useState<AdminPrincipalScope>("ALL");
  const [editing, setEditing] = useState<AdminPrincipalListItem | null>(null);
  const [nextStatus, setNextStatus] = useState<"ACTIVE" | "DISABLED">("ACTIVE");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (nextCursor?: string) => {
      if (nextCursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const page = await administrationService.principals({
          ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
          limit: 25,
          ...(query.length === 0 ? {} : { query }),
          ...(role === "ALL" ? {} : { role }),
          scope,
        });
        setUsers((current) =>
          nextCursor === undefined ? [...page.data] : [...current, ...page.data],
        );
        setSummary(page.summary);
        setCursor(page.pageInfo.endCursor);
        setHasMore(page.pageInfo.hasNextPage);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Accounts could not be loaded.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [query, role, scope],
  );

  useEffect(() => void load(), [load]);

  function openEdit(user: AdminPrincipalListItem) {
    setEditing(user);
    setNextStatus(user.status === "ACTIVE" ? "DISABLED" : "ACTIVE");
    setReason("");
  }

  async function submit() {
    if (editing === null || reason.trim().length < 3) return;
    setSaving(true);
    try {
      const updated = await administrationService.transitionPrincipal(editing.id, {
        expectedVersion: editing.version,
        reason: reason.trim(),
        status: nextStatus,
      });
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      setSummary((current) => ({
        active: current.active + (updated.status === "ACTIVE" ? 1 : -1),
        all: current.all,
        disabled: current.disabled + (updated.status === "DISABLED" ? 1 : -1),
      }));
      setEditing(null);
      toast.success(
        updated.status === "ACTIVE"
          ? "Account activated."
          : "Account disabled and sessions revoked.",
      );
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Account status could not be changed.",
      );
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error !== null && users.length === 0)
    return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Review platform accounts and control access without handling passwords."
        breadcrumbs={[
          { label: "Admin", onClick: () => navigate("admin", "dashboard") },
          { label: "Users" },
        ]}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label="Total" value={summary.all} icon={Users} />
        <StatTile label="Active" value={summary.active} icon={UserCheck} tone="success" />
        <StatTile
          label="Disabled"
          value={summary.disabled}
          icon={UserX}
          tone={summary.disabled > 0 ? "danger" : "default"}
        />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, verified email, or account ID…"
          className="pl-9"
        />
      </div>

      <SegmentedControl
        options={[
          { value: "ALL" as AdminPrincipalScope, label: "All", badge: summary.all },
          { value: "ACTIVE" as AdminPrincipalScope, label: "Active", badge: summary.active },
          { value: "DISABLED" as AdminPrincipalScope, label: "Disabled", badge: summary.disabled },
        ]}
        value={scope}
        onChange={setScope}
        size="sm"
      />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        <RoleChip active={role === "ALL"} label="All roles" onClick={() => setRole("ALL")} />
        {ROLES.map((item) => (
          <RoleChip
            key={item}
            active={role === item}
            label={formatRole(item)}
            onClick={() => setRole(item)}
          />
        ))}
      </div>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}
      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No accounts found"
          description="Try adjusting the server-side filters."
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {users.map((user) => (
            <CompactListItem
              key={user.id}
              leading={
                <div className="rounded-lg bg-primary/10 p-2 text-primary ring-1 ring-primary/10">
                  <Users className="h-4 w-4" />
                </div>
              }
              title={user.displayName}
              subtitle={`${user.email ?? "No verified email"} · ${user.roles.map(formatRole).join(", ") || "No active role"} · ${user.id}`}
              trailing={
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={user.status.toLowerCase()} size="sm" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(user);
                    }}
                    aria-label="Change account status"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                </div>
              }
              onClick={() => openEdit(user)}
              chevron
            />
          ))}
        </div>
      )}
      {hasMore && cursor !== null && (
        <Button
          variant="outline"
          className="w-full"
          disabled={loadingMore}
          onClick={() => void load(cursor)}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change account access</DialogTitle>
            <DialogDescription>
              {editing?.displayName}. Disabling access revokes every active session; passwords
              remain with the identity provider.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="principal-status">New status</Label>
              <Select
                value={nextStatus}
                onValueChange={(value) => setNextStatus(value as "ACTIVE" | "DISABLED")}
              >
                <SelectTrigger id="principal-status" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="DISABLED">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="principal-reason">Audit reason</Label>
              <Textarea
                id="principal-reason"
                className="mt-1.5"
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why access is changing…"
              />
            </div>
            <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0" /> The platform prevents self-disable and
              disabling the final active administrator.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={saving || reason.trim().length < 3 || editing?.status === nextStatus}
              onClick={() => void submit()}
            >
              {saving ? "Saving…" : "Apply status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

function formatRole(role: PlatformRole): string {
  return role.toLowerCase().replaceAll("_", " ");
}
