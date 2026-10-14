"use client";

import type { NotificationComponents } from "@royal-palace/api-client";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CompactListItem } from "@/components/healthcare/compact-list";
import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { productionNotificationService } from "@/lib/services";
import { cn } from "@/lib/utils";

type InboxItem = NotificationComponents["schemas"]["NotificationInboxItem"];
type FilterKey = "all" | "unread";

const COPY: Partial<Record<InboxItem["templateKey"], { description: string; title: string }>> = {
  LABORATORY_RESULT_ACTION_REQUIRED: {
    description: "A laboratory result requires prompt attention.",
    title: "Result action required",
  },
  LABORATORY_RESULT_PUBLISHED: {
    description: "A laboratory result has been published.",
    title: "Result published",
  },
  PAYMENT_STATUS_UPDATED: {
    description: "A payment status has changed.",
    title: "Payment updated",
  },
  SECURITY_ALERT: {
    description: "Review this security activity promptly.",
    title: "Security alert",
  },
};

export function LabNotifications({ onUnreadChange }: { onUnreadChange: (count: number) => void }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor?: string) => {
      setLoading(true);
      try {
        const response = await productionNotificationService.list({
          ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
          limit: 25,
          unreadOnly: filter === "unread",
        });
        setItems((current) =>
          nextCursor === undefined ? [...response.data] : [...current, ...response.data],
        );
        setCursor(response.pageInfo.endCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
        onUnreadChange(response.unreadCount);
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Notifications could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [filter, onUnreadChange],
  );

  useEffect(() => void load(), [load]);
  const unreadCount = useMemo(() => items.filter(({ readAt }) => readAt === null).length, [items]);

  async function markRead(item: InboxItem) {
    if (item.readAt !== null) return;
    try {
      const response = await productionNotificationService.markRead(item.id);
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id ? { ...candidate, readAt: response.readAt } : candidate,
        ),
      );
      onUnreadChange(Math.max(0, unreadCount - 1));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Notification could not be updated.");
    }
  }

  async function markAllRead() {
    setMarking(true);
    try {
      const response = await productionNotificationService.markAllRead();
      await load();
      toast.success(
        response.hasMore
          ? `${response.markedCount} notifications marked read. More remain.`
          : `${response.markedCount} notifications marked read.`,
      );
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Notifications could not be updated.");
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Booking requests, result escalations, and platform announcements."
        actions={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void markAllRead()}
              disabled={marking}
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          ) : undefined
        }
      />
      {unreadCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="h-2 w-2 rounded-full bg-primary" />
            {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void markAllRead()} disabled={marking}>
            Mark all read
          </Button>
        </div>
      )}
      <SegmentedControl
        options={[
          { value: "all" as FilterKey, label: "All", badge: items.length },
          { value: "unread" as FilterKey, label: "Unread", badge: unreadCount },
        ]}
        value={filter}
        onChange={setFilter}
        size="sm"
      />
      {loading && items.length === 0 ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <EmptyState title="Notifications unavailable" description={error} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filter === "unread" ? "No unread notifications" : "No notifications"}
          description="New booking, laboratory result, and platform updates will appear here."
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {items.map((item) => {
            const copy = COPY[item.templateKey] ?? {
              description: "A platform activity has changed.",
              title: "Platform update",
            };
            const Icon = iconFor(item);
            return (
              <CompactListItem
                key={item.id}
                leading={
                  <div className={cn("rounded-lg p-2 ring-1", toneFor(item))}>
                    <Icon className="h-4 w-4" />
                  </div>
                }
                title={copy.title}
                subtitle={`${copy.description} Reference ${item.reference} · ${formatDateTime(item.createdAt)}`}
                trailing={
                  item.readAt === null ? (
                    <Button
                      size="iconSm"
                      variant="ghost"
                      onClick={(event: React.MouseEvent) => {
                        event.stopPropagation();
                        void markRead(item);
                      }}
                      aria-label="Mark read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Read
                    </span>
                  )
                }
                onClick={() => void markRead(item)}
              />
            );
          })}
          {hasNextPage && cursor !== null && (
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
          )}
        </div>
      )}
    </div>
  );
}

function iconFor(item: InboxItem) {
  if (item.category === "SECURITY") return ShieldCheck;
  if (item.templateKey === "LABORATORY_RESULT_ACTION_REQUIRED") return AlertTriangle;
  if (item.templateKey === "LABORATORY_RESULT_PUBLISHED") return FlaskConical;
  return CalendarClock;
}

function toneFor(item: InboxItem): string {
  if (item.readAt !== null) return "bg-muted text-muted-foreground ring-border";
  if (item.category === "SECURITY") return "bg-rose-50 text-rose-700 ring-rose-100";
  return "bg-violet-50 text-violet-700 ring-violet-100";
}
