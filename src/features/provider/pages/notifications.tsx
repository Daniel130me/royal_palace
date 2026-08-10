"use client";

import { useEffect, useState, useCallback } from "react";
import { useProviderContext } from "../use-provider-context";
import { notificationService } from "@/lib/services";
import type { Notification } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatDateTime, relativeDay } from "@/lib/format";
import { toast } from "sonner";
import { Bell, BellOff, CheckCheck, Trash2 } from "lucide-react";

const TYPE_ICON: Record<string, string> = {
  appointment: "📅",
  prescription: "💊",
  laboratory: "🧪",
  pharmacy: "📦",
  logistics: "🚚",
  system: "🔔",
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

  if (loading) return <LoadingState label="Loading notifications…" />;
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

      {notifications.length === 0 ? (
        <EmptyState icon={BellOff} title="No notifications" description="You're all caught up." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card key={n.id} className={n.read ? "opacity-70" : "border-emerald-200 bg-emerald-50/30"}>
              <CardContent className="p-3 flex items-start gap-3">
                <div className="text-lg shrink-0">{TYPE_ICON[n.type] ?? "🔔"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    {!n.read && <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700">new</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.createdAt)} · {relativeDay(n.createdAt)}</p>
                </div>
                {!n.read && (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => markRead(n.id)}>
                    <CheckCheck className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

void Bell;
void Trash2;
