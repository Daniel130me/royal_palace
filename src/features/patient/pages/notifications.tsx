"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { notificationService } from "@/lib/services";
import type { Notification } from "@/types";
import { PageHeader, EmptyState, LoadingState, SkeletonGrid } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bell, BellOff, CheckCheck, CalendarDays, Pill, FlaskConical, Package, Info,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { usePatientContext } from "../use-patient-context";

const ICON_FOR_TYPE: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  appointment: { icon: CalendarDays, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  prescription: { icon: Pill, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  laboratory: { icon: FlaskConical, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
  pharmacy: { icon: Package, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
  logistics: { icon: Package, tone: "bg-rose-50 text-rose-700 ring-rose-100" },
  system: { icon: Info, tone: "bg-muted text-muted-foreground ring-border/60" },
};

const TARGET_PAGE: Record<string, { page: string; paramKey?: string }> = {
  appointment: { page: "appointments" },
  prescription: { page: "prescriptions" },
  laboratory: { page: "laboratory" },
  pharmacy: { page: "orders" },
  logistics: { page: "orders" },
  system: { page: "dashboard" },
};

export function PatientNotifications() {
  const { profile, refresh } = usePatientContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    setLoading(true);
    try {
      const rows = await notificationService.list(profile.id, "patient");
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [profile?.id]);

  async function markRead(n: Notification) {
    if (n.read) {
      goto(n);
      return;
    }
    try {
      await notificationService.markRead(n.id);
      setNotifications((arr) => arr.map((x) => x.id === n.id ? { ...x, read: true } : x));
      goto(n);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark as read");
    }
  }

  function goto(_n: Notification) {
    // Navigate to the target page (any notification type → its list page)
    // We don't have the exact ID, so just go to the list page.
  }

  async function markAllRead() {
    if (!profile) return;
    try {
      await notificationService.markAllRead(profile.id, "patient");
      setNotifications((arr) => arr.map((x) => ({ ...x, read: true })));
      toast.success("All notifications marked as read");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark all as read");
    }
  }

  const unread = notifications.filter((n) => !n.read).length;

  if (loading) return <SkeletonGrid count={4} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `You have ${unread} unread notification${unread === 1 ? "" : "s"}.` : "You're all caught up."}
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          )
        }
      />

      {error ? (
        <EmptyState title="Could not load notifications" description={error} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="No notifications"
          description="You'll be notified about appointments, prescriptions, lab results and deliveries here."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const config = ICON_FOR_TYPE[n.type] ?? { icon: Bell, tone: "bg-muted text-muted-foreground ring-border/60" };
            const Icon = config.icon;
            const target = TARGET_PAGE[n.type] ?? { page: "dashboard" };
            return (
              <Card
                key={n.id}
                className={`cursor-pointer hover:shadow-soft-md transition-shadow ${!n.read ? "border-primary/30 bg-primary/[0.03]" : ""}`}
                onClick={() => { markRead(n); navigate("patient", target.page); }}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`rounded-xl p-2 shrink-0 ring-1 ${!n.read ? config.tone : "bg-muted text-muted-foreground ring-border/60"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm leading-tight">{n.title}</p>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{formatDateTime(n.createdAt)}</p>
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
