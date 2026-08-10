"use client";

import { useLabContext } from "../use-lab-context";
import { notificationService } from "@/lib/services";
import {
  PageHeader, EmptyState, LoadingState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { useEffect, useState } from "react";
import {
  Bell, CheckCheck, FlaskConical, CalendarClock, AlertTriangle, Package,
  Info, Check,
} from "lucide-react";
import { toast } from "sonner";
import type { Notification } from "@/types";

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  lab_request: { icon: FlaskConical, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  booking: { icon: CalendarClock, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
  critical_result: { icon: AlertTriangle, tone: "bg-rose-50 text-rose-700 ring-rose-100" },
  order: { icon: Package, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
  default: { icon: Bell, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
};

function metaFor(n: Notification) {
  const key = (n.type || "default") as keyof typeof TYPE_META;
  return TYPE_META[key] ?? TYPE_META.default;
}

export function LabNotifications() {
  const { labId, notifications, loading, reload } = useLabContext();
  const [marking, setMarking] = useState(false);

  const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (!labId) return;
    setMarking(true);
    try {
      await notificationService.markAllRead(labId, "laboratory");
      toast.success("All notifications marked as read.");
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to mark notifications.");
    } finally {
      setMarking(false);
    }
  };

  const markOne = async (n: Notification) => {
    try {
      await notificationService.markRead(n.id);
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update notification.");
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Booking requests, result escalations, and platform announcements."
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={marking}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      {unreadCount > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
          </p>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={marking}>
            Mark all read
          </Button>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Notifications about new bookings, critical results and platform updates will appear here."
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((n) => {
            const meta = metaFor(n);
            const Icon = meta.icon;
            return (
              <Card key={n.id} className={n.read ? "" : "border-primary/30 bg-primary/5"}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-xl p-2 shrink-0 ring-1 ${n.read ? "bg-muted text-muted-foreground ring-border" : meta.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight">{n.title}</p>
                        {!n.read && (
                          <span className="text-[10px] font-medium uppercase tracking-wider bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 shrink-0">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{n.body}</p>
                      <p className="text-xs text-muted-foreground mt-1.5">{formatDateTime(n.createdAt)}</p>
                    </div>
                    {!n.read && (
                      <Button size="iconSm" variant="ghost" onClick={() => markOne(n)} aria-label="Mark read">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
