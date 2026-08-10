"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { notificationService } from "@/lib/services";
import type { Notification } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatDateTime } from "@/lib/format";
import {
  Bell, CheckCheck, ArrowRight, FileText, ShoppingCart, Truck, Package,
  Receipt, Wallet, Info,
} from "lucide-react";
import { toast } from "sonner";

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

export function PharmacyNotifications() {
  const { pharmacyId, unread, refresh } = usePharmacyContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description={`${unreadCount} unread notification(s).`}
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAll}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          )
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Order updates, prescription alerts and system messages will appear here."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const cfg = TYPE_ICON[n.type] ?? TYPE_ICON.system;
            const Icon = cfg.icon;
            const isUnread = !n.read;
            return (
              <Card
                key={n.id}
                className={isUnread ? "border-primary/30 bg-primary/[0.03] shadow-soft" : "opacity-90"}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-xl p-2 ring-1 shrink-0 ${cfg.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold leading-tight">{n.title}</p>
                        {isUnread && (
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/30 bg-primary/5 text-primary">NEW</Badge>
                          </span>
                        )}
                        <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide">{n.type}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{n.body}</p>
                      <p className="text-xs text-muted-foreground mt-1.5">{formatDateTime(n.createdAt)}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {isUnread && (
                        <Button size="sm" variant="ghost" onClick={() => handleMarkOne(n.id)}>Mark read</Button>
                      )}
                      {n.relatedId && (
                        <Button size="sm" variant="outline" onClick={() => handleNavigate(n)}>
                          View <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
