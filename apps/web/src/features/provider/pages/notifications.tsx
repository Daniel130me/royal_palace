"use client";

import { useEffect, useState, useCallback } from "react";
import { useProviderContext } from "../use-provider-context";
import { notificationService } from "@/lib/services";
import type { Notification } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatDateTime, relativeDay } from "@/lib/format";
import { toast } from "sonner";
import {
  Bell, BellOff, CheckCheck, CalendarClock, Pill, FlaskConical,
  Package, Truck, Info, type LucideIcon,
} from "lucide-react";

const TYPE_ICON: Record<string, LucideIcon> = {
  appointment: CalendarClock,
  prescription: Pill,
  laboratory: FlaskConical,
  pharmacy: Package,
  logistics: Truck,
  system: Info,
};

const TYPE_TONE: Record<string, string> = {
  appointment: "bg-sky-50 text-sky-600",
  prescription: "bg-emerald-50 text-emerald-600",
  laboratory: "bg-violet-50 text-violet-600",
  pharmacy: "bg-amber-50 text-amber-600",
  logistics: "bg-amber-50 text-amber-600",
  system: "bg-muted text-muted-foreground",
};

export function ProviderNotifications() {
  const { providerId } = useProviderContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const ns = await notificationService.list(providerId, "provider");
      setNotifications(ns.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (e) {
      setError((e as Error).message ?? "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    try {
      await notificationService.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (e) {
      toast.error("Could not mark as read: " + (e as Error).message);
    }
  }

  async function markAllRead() {
    if (!providerId) return;
    try {
      await notificationService.markAllRead(providerId, "provider");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success("All notifications marked as read.");
    } catch (e) {
      toast.error("Could not mark all read: " + (e as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Notifications" description="Activity alerts from your practice." />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const unread = notifications.filter((n) => !n.read);

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Activity alerts from your practice."
        actions={
          unread.length > 0 ? (
            <Button variant="outline" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      {/* Unread summary banner */}
      {unread.length > 0 && (
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">{unread.length} unread notification{unread.length === 1 ? "" : "s"}</p>
              <p className="text-xs text-muted-foreground">Tap the check button to dismiss each, or mark all read.</p>
            </div>
          </div>
        </div>
      )}

      {notifications.length === 0 ? (
        <EmptyState icon={BellOff} title="No notifications" description="You're all caught up." />
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Info;
            const tone = TYPE_TONE[n.type] ?? TYPE_TONE.system;
            return (
              <Card
                key={n.id}
                className={`transition-all hover:shadow-soft-md ${n.read ? "opacity-70" : "border-primary/30 bg-primary/5"}`}
              >
                <CardContent className="p-3.5 flex items-start gap-3">
                  <div className={`rounded-xl p-2 shrink-0 ${tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{n.title}</p>
                      {!n.read && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/10 text-primary h-5 shrink-0">
                          new
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{formatDateTime(n.createdAt)} · {relativeDay(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <Button size="iconSm" variant="ghost" className="shrink-0 text-muted-foreground hover:text-primary" onClick={() => markRead(n.id)} aria-label="Mark as read">
                      <CheckCheck className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
