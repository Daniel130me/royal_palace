"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { notificationService } from "@/lib/services";
import type { Notification } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatDateTime } from "@/lib/format";
import { Bell, CheckCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export function PharmacyNotifications() {
  const { pharmacyId, unread, refresh } = usePharmacyContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <LoadingState label="Loading notifications…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${unread} unread notification(s).`}
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Notifications" }]}
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAll}>
              <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
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
          {notifications.map((n) => (
            <Card key={n.id} className={n.read ? "" : "border-emerald-200 bg-emerald-50/30"}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{n.title}</p>
                      <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide">{n.type}</span>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{n.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!n.read && (
                      <Button size="sm" variant="ghost" onClick={() => handleMarkOne(n.id)}>Mark read</Button>
                    )}
                    {n.relatedId && (
                      <Button size="sm" variant="outline" onClick={() => navigate("pharmacy", n.type === "prescription" ? "prescriptions" : "orders")}>
                        View <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
