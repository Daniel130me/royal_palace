"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { notificationService } from "@/lib/services";
import type { Notification } from "@/types";
import { PageHeader, EmptyState, SkeletonGrid } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { cn } from "@/lib/utils";
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

type NotifTab = "unread" | "all";

export function PatientNotifications() {
  const { profile, refresh } = usePatientContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<NotifTab>("unread");

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

  const unread = useMemo(() => notifications.filter((n) => !n.read), [notifications]);
  const rows = tab === "unread" ? unread : notifications;

  if (loading) return <SkeletonGrid count={4} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description={unread.length > 0 ? `${unread.length} unread` : "You're all caught up."}
        actions={
          unread.length > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          )
        }
      />

      <SegmentedControl<NotifTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "unread", label: "Unread", badge: unread.length || undefined },
          { value: "all", label: "All" },
        ]}
      />

      {error ? (
        <EmptyState title="Could not load notifications" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={tab === "unread" ? "No unread notifications" : "No notifications"}
          description="You'll be notified about appointments, prescriptions, lab results and deliveries here."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {rows.map((n) => {
            const config = ICON_FOR_TYPE[n.type] ?? { icon: Bell, tone: "bg-muted text-muted-foreground ring-border/60" };
            const Icon = config.icon;
            return (
              <CompactListItem
                key={n.id}
                leading={
                  <div className={cn(
                    "rounded-lg p-2 ring-1",
                    !n.read ? config.tone : "bg-muted text-muted-foreground ring-border/60"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                }
                title={n.title}
                subtitle={n.body}
                trailing={
                  <div className="flex flex-col items-end gap-1.5">
                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                    <span className="text-[10px] text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                  </div>
                }
                onClick={() => markRead(n)}
                chevron
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
