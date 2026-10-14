"use client";

import type { NotificationComponents } from "@royal-palace/api-client";
import { Bell, CheckCheck, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { productionNotificationService } from "@/lib/services";
import { cn } from "@/lib/utils";

type InboxItem = NotificationComponents["schemas"]["NotificationInboxItem"];

const TEMPLATE_COPY: Record<InboxItem["templateKey"], { description: string; title: string }> = {
  APPLICATION_ACTION_REQUIRED: {
    description: "An application requires attention.",
    title: "Application action required",
  },
  APPLICATION_STATUS_UPDATED: {
    description: "An application status has changed.",
    title: "Application updated",
  },
  APPOINTMENT_STATUS_UPDATED: {
    description: "An appointment status has changed.",
    title: "Appointment updated",
  },
  PAYMENT_STATUS_UPDATED: {
    description: "A payment status has changed.",
    title: "Payment updated",
  },
  LABORATORY_RESULT_ACTION_REQUIRED: {
    description: "A laboratory result requires prompt attention.",
    title: "Laboratory result action required",
  },
  LABORATORY_RESULT_PUBLISHED: {
    description: "A laboratory result has been published.",
    title: "Laboratory result published",
  },
  PHARMACY_ORDER_ACTION_REQUIRED: {
    description: "A pharmacy order requires attention.",
    title: "Order action required",
  },
  PHARMACY_ORDER_STATUS_UPDATED: {
    description: "A pharmacy order status has changed.",
    title: "Order updated",
  },
  PRESCRIPTION_ACTION_REQUIRED: {
    description: "A prescription workflow requires attention.",
    title: "Prescription action required",
  },
  PRESCRIPTION_STATUS_UPDATED: {
    description: "A prescription status has changed.",
    title: "Prescription updated",
  },
  SECURITY_ALERT: {
    description: "Review this security activity promptly.",
    title: "Security alert",
  },
};

export function PharmacyNotifications({
  onUnreadChange,
}: {
  onUnreadChange: (count: number) => void;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor?: string) => {
      setLoading(true);
      try {
        const response = await productionNotificationService.list({
          ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
          limit: 25,
          unreadOnly,
        });
        setItems((current) =>
          nextCursor === undefined ? [...response.data] : [...current, ...response.data],
        );
        setCursor(response.pageInfo.endCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
        onUnreadChange(response.unreadCount);
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Notifications could not be loaded");
      } finally {
        setLoading(false);
      }
    },
    [onUnreadChange, unreadOnly],
  );

  useEffect(() => void load(), [load]);

  async function markRead(item: InboxItem) {
    if (item.readAt !== null) return;
    try {
      const result = await productionNotificationService.markRead(item.id);
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id ? { ...candidate, readAt: result.readAt } : candidate,
        ),
      );
      onUnreadChange(Math.max(0, items.filter(({ readAt }) => readAt === null).length - 1));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Notification could not be updated");
    }
  }

  async function markAllRead() {
    try {
      const result = await productionNotificationService.markAllRead();
      await load();
      toast.success(
        result.hasMore
          ? `${result.markedCount} notifications marked read. More remain.`
          : `${result.markedCount} notifications marked read.`,
      );
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Notifications could not be updated");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Security and operational updates for your signed-in account and pharmacy."
        actions={
          <Button variant="outline" onClick={() => void markAllRead()}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        }
      />
      <div className="flex gap-2" role="tablist" aria-label="Notification views">
        {[false, true].map((onlyUnread) => (
          <Button
            key={String(onlyUnread)}
            role="tab"
            aria-selected={unreadOnly === onlyUnread}
            variant={unreadOnly === onlyUnread ? "default" : "outline"}
            onClick={() => setUnreadOnly(onlyUnread)}
          >
            {onlyUnread ? "Unread" : "All"}
          </Button>
        ))}
      </div>
      {loading && items.length === 0 ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <EmptyState title="Notifications unavailable" description={error} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="New account and pharmacy updates will appear here."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const copy = TEMPLATE_COPY[item.templateKey];
            return (
              <button
                key={item.id}
                type="button"
                className="block w-full text-left"
                onClick={() => void markRead(item)}
              >
                <Card
                  className={cn(
                    "transition-colors hover:border-primary/40",
                    item.readAt === null && "border-primary/30 bg-primary/[0.025]",
                  )}
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="rounded-lg bg-muted p-2">
                      {item.category === "SECURITY" ? (
                        <ShieldCheck className="h-4 w-4" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{copy.title}</p>
                        {item.readAt === null && <Badge>New</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Reference {item.reference} · {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
          {hasNextPage && cursor !== null && (
            <Button
              className="w-full"
              variant="outline"
              disabled={loading}
              onClick={() => void load(cursor)}
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
