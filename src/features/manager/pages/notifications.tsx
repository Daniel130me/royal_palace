"use client";

// Manager notifications — reuses the generic notification resources with
// the manager recipient scope.

import { useCallback, useEffect, useState } from "react";
import { managerService, notificationService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { Bell, CheckCheck } from "lucide-react";
import type { Notification } from "@/types";

export function ManagerNotifications() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await managerService.me();
      setItems(await notificationService.list(me.manager.id, "manager"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    if (!items) return;
    const me = await managerService.me();
    await notificationService.markAllRead(me.manager.id, "manager");
    await load();
  }

  if (items === null && !error) return <LoadingState label="Loading notifications…" />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Manager-specific activity alerts across your portfolio and earnings."
        actions={
          <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !items || items.length === 0 ? (
        <EmptyState title="No notifications" description="You are all caught up." />
      ) : (
        <Card>
          <CardContent className="p-0">
            {items.map((n) => (
              <div key={n.id} className={`flex items-start gap-3 p-4 border-b border-border/40 last:border-0 ${n.read ? "" : "bg-primary/[0.04]"}`}>
                <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.read ? "bg-muted-foreground/30" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">{formatDateTime(n.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
