"use client";

import { useLabContext } from "../use-lab-context";
import { notificationService } from "@/lib/services";
import { PageHeader } from "@/components/healthcare/page-header";
import { EmptyState, LoadingState } from "@/components/healthcare/states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Notification } from "@/types";

export function LabNotifications() {
  const { labId, notifications, loading, reload } = useLabContext();
  const [marking, setMarking] = useState(false);

  const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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

  if (loading) return <LoadingState label="Loading notifications…" />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Booking requests, result escalations, and platform announcements."
        actions={
          notifications.some((n) => !n.read) ? (
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={marking}>
              <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      {sorted.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Notifications about new bookings, critical results and platform updates will appear here."
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((n) => (
            <Card key={n.id} className={n.read ? "" : "border-emerald-200 bg-emerald-50/30"}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {!n.read ? (
                    <div className="rounded-full bg-emerald-100 p-1.5 shrink-0">
                      <AlertCircle className="h-4 w-4 text-emerald-700" />
                    </div>
                  ) : (
                    <div className="rounded-full bg-muted p-1.5 shrink-0">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <Button size="sm" variant="ghost" onClick={() => markOne(n)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
