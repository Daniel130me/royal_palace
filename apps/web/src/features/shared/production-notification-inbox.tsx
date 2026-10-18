"use client";

import type { NotificationComponents } from "@royal-palace/api-client";
import { Bell, Check, CheckCheck, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { productionNotificationService } from "@/lib/services";
import {
  announceNotificationsUpdated,
  notificationTitle,
} from "@/features/shared/notification-summary";

type InboxItem = NotificationComponents["schemas"]["NotificationInboxItem"];

export function ProductionNotificationInbox({
  description,
  emptyDescription,
}: {
  description: string;
  emptyDescription: string;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCursor?: string) => {
    setLoading(true);
    try {
      const response = await productionNotificationService.list({
        ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
        limit: 25,
      });
      setItems((current) =>
        nextCursor === undefined ? [...response.data] : [...current, ...response.data],
      );
      setCursor(response.pageInfo.endCursor);
      setHasNextPage(response.pageInfo.hasNextPage);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);
  const unreadCount = useMemo(() => items.filter((item) => item.readAt === null).length, [items]);

  async function markRead(item: InboxItem) {
    if (item.readAt !== null) return;
    try {
      const updated = await productionNotificationService.markRead(item.id);
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id ? { ...candidate, readAt: updated.readAt } : candidate,
        ),
      );
      announceNotificationsUpdated();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Notification could not be updated.");
    }
  }

  async function markAllRead() {
    try {
      const response = await productionNotificationService.markAllRead();
      await load();
      announceNotificationsUpdated();
      toast.success(
        `${response.markedCount} notification${response.markedCount === 1 ? "" : "s"} marked read.`,
      );
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Notifications could not be updated.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description={description}
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          ) : undefined
        }
      />
      {loading && items.length === 0 ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <EmptyState title="Notifications unavailable" description={error} />
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description={emptyDescription} compact />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/40 p-0">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void markRead(item)}
                className={`flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40 ${item.readAt === null ? "bg-primary/[0.04]" : ""}`}
              >
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                  {item.category === "SECURITY" ? (
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <Bell className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{notificationTitle(item.templateKey)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Reference {item.reference} · {formatDateTime(item.createdAt)}
                  </p>
                </div>
                {item.readAt === null ? (
                  <Check className="mt-2 h-4 w-4 text-muted-foreground" />
                ) : (
                  <span className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Read
                  </span>
                )}
              </button>
            ))}
            {hasNextPage && cursor !== null ? (
              <div className="p-3">
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void load(cursor)}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
