"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { notificationService } from "@/lib/services";
import type { Notification } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell, BellOff, CheckCheck, CalendarDays, Pill, FlaskConical, Package, Info,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { usePatientContext } from "../use-patient-context";

const ICON_FOR_TYPE: Record<string, React.ComponentType<{ className?: string }>> = {
  appointment: CalendarDays,
  prescription: Pill,
  laboratory: FlaskConical,
  pharmacy: Package,
  logistics: Package,
  system: Info,
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
      // Just navigate to target page
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

  function goto(n: Notification) {
    const target = TARGET_PAGE[n.type] ?? { page: "dashboard" };
    navigate("patient", target.page);
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

  if (loading) return <LoadingState label="Loading notifications…" />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `You have ${unread} unread notification${unread === 1 ? "" : "s"}.` : "You're all caught up."}
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
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
            const Icon = ICON_FOR_TYPE[n.type] ?? Bell;
            return (
              <Card
                key={n.id}
                className={`cursor-pointer hover:shadow-sm transition-shadow ${!n.read ? "border-emerald-200 bg-emerald-50/40" : ""}`}
                onClick={() => markRead(n)}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`rounded-lg p-2 shrink-0 ${!n.read ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{n.title}</p>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1.5" />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</p>
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
