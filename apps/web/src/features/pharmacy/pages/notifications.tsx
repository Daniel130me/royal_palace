"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { notificationService } from "@/lib/services";
import type { Notification } from "@/types";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatDateTime } from "@/lib/format";
import {
  Bell, CheckCheck, ArrowRight, FileText, ShoppingCart, Truck, Package,
  Receipt, Wallet, Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  prescription: { icon: FileText, tone: "bg-sky-50 text-sky-600 ring-sky-100" },
  order: { icon: ShoppingCart, tone: "bg-amber-50 text-amber-600 ring-amber-100" },
  delivery: { icon: Truck, tone: "bg-violet-50 text-violet-600 ring-violet-100" },
  inventory: { icon: Package, tone: "bg-rose-50 text-rose-600 ring-rose-100" },
  settlement: { icon: Wallet, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  commission: { icon: Receipt, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  system: { icon: Info, tone: "bg-muted text-muted-foreground ring-border" },
};

const TYPE_TARGET: Record<string, string> = {
  prescription: "prescriptions",
  order: "orders",
  delivery: "deliveries",
  inventory: "inventory",
  settlement: "settlements",
  commission: "commissions",
};

type NotifTab = "unread" | "all";

export function PharmacyNotifications() {
  const { pharmacyId, unread, refresh } = usePharmacyContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<NotifTab>("unread");
  const { navigate } = useNav();

  const load = () => {
    if (!pharmacyId) return;
    setError(null);
    notificationService
      .list(pharmacyId, "pharmacy")
      .then((list) =>
        setNotifications(
          [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        )
      )
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load notifications"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    if (!pharmacyId) return;
    notificationService
      .list(pharmacyId, "pharmacy")
      .then((list) => {
        if (cancelled) return;
        setNotifications(
          [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load notifications"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pharmacyId]);

  const handleMarkAll = async () => {
    if (!pharmacyId) return;
    try {
      await notificationService.markAllRead(pharmacyId, "pharmacy");
      toast.success("All notifications marked as read.");
      load();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark all as read");
    }
  };

  const handleMarkOne = async (id: string) => {
    try {
      await notificationService.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark as read");
    }
  };

  const handleNavigate = (n: Notification) => {
    if (!n.read) handleMarkOne(n.id);
    const target = TYPE_TARGET[n.type] ?? "dashboard";
    navigate("pharmacy", target as any);
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const rows = tab === "unread" ? notifications.filter((n) => !n.read) : notifications;

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread notification(s).` : "You're all caught up."}
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAll}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          )
        }
      />

      <SegmentedControl<NotifTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "unread", label: "Unread", badge: unreadCount || undefined },
          { value: "all", label: "All", badge: notifications.length },
        ]}
        size="sm"
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={tab === "unread" ? "No unread notifications" : "No notifications"}
          description="Order updates, prescription alerts and system messages will appear here."
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {rows.map((n) => {
            const cfg = TYPE_ICON[n.type] ?? TYPE_ICON.system;
            const Icon = cfg.icon;
            const isUnread = !n.read;
            return (
              <CompactListItem
                key={n.id}
                leading={
                  <div className={cn(
                    "rounded-lg p-2 ring-1",
                    isUnread ? cfg.tone : "bg-muted text-muted-foreground ring-border/60"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                }
                title={n.title}
                subtitle={n.body}
                trailing={
                  <div className="flex flex-col items-end gap-1.5">
                    {isUnread && <span className="h-2 w-2 rounded-full bg-primary" />}
                    <span className="text-[10px] text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                  </div>
                }
                onClick={() => handleNavigate(n)}
                chevron
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
