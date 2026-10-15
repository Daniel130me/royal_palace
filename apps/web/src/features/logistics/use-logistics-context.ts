"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useNav } from "@/lib/nav";
import { productionLogisticsService, productionNotificationService } from "@/lib/services";

import type { LogisticsDelivery, MutableLogisticsDeliveryStatus } from "./logistics-types";

const DELIVERY_PAGE_SIZE = 50;

export function useLogisticsContext(options: { loadUnread?: boolean } = {}) {
  const { session, sessionName } = useNav();
  const logisticsId = session?.profileId ?? null;
  const [deliveries, setDeliveries] = useState<LogisticsDelivery[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!logisticsId) {
      setDeliveries([]);
      setNextCursor(null);
      setLoading(false);
      setError("No logistics organization is associated with this session.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [page, notifications] = await Promise.all([
        productionLogisticsService.organization.list(logisticsId, {
          limit: DELIVERY_PAGE_SIZE,
        }),
        options.loadUnread === true
          ? productionNotificationService
              .list({ limit: 50, unreadOnly: true })
              .catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
      ]);
      setDeliveries(page.data);
      setNextCursor(page.nextCursor);
      setUnread(notifications.data.length);
    } catch (reason) {
      setDeliveries([]);
      setNextCursor(null);
      setError(reason instanceof Error ? reason.message : "Logistics data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [logisticsId, options.loadUnread]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (!logisticsId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await productionLogisticsService.organization.list(logisticsId, {
        cursor: nextCursor,
        limit: DELIVERY_PAGE_SIZE,
      });
      setDeliveries((current) => {
        const byId = new Map(current.map((delivery) => [delivery.id, delivery]));
        page.data.forEach((delivery) => byId.set(delivery.id, delivery));
        return [...byId.values()];
      });
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, logisticsId, nextCursor]);

  const transition = useCallback(
    async (
      delivery: LogisticsDelivery,
      toStatus: MutableLogisticsDeliveryStatus,
      reasonCode?: string,
    ) => {
      if (!logisticsId)
        throw new Error("No logistics organization is associated with this session.");
      const updated = await productionLogisticsService.organization.transition(
        logisticsId,
        delivery.id,
        { expectedVersion: delivery.version, reasonCode, toStatus },
        crypto.randomUUID(),
      );
      setDeliveries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    },
    [logisticsId],
  );

  const verifyRecipientCode = useCallback(
    async (delivery: LogisticsDelivery, recipientCode: string) => {
      if (!logisticsId)
        throw new Error("No logistics organization is associated with this session.");
      const updated = await productionLogisticsService.organization.verifyRecipientCode(
        logisticsId,
        delivery.id,
        { expectedVersion: delivery.version, recipientCode },
        crypto.randomUUID(),
      );
      setDeliveries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    },
    [logisticsId],
  );

  const groups = useMemo(() => {
    const available = deliveries.filter((delivery) => delivery.status === "ASSIGNED");
    const pickupPhase = deliveries.filter((delivery) =>
      ["ACCEPTED", "HEADING_TO_PICKUP", "ARRIVED_AT_PICKUP", "PICKUP_VERIFIED"].includes(
        delivery.status,
      ),
    );
    const inTransit = deliveries.filter((delivery) =>
      ["PICKED_UP", "IN_TRANSIT", "ARRIVED_AT_DESTINATION"].includes(delivery.status),
    );
    const active = [...pickupPhase, ...inTransit];
    const completed = deliveries.filter((delivery) =>
      ["DELIVERED", "FAILED", "RETURNED", "CANCELLED"].includes(delivery.status),
    );
    return { active, available, completed, inTransit, pickupPhase };
  }, [deliveries]);

  return {
    ...groups,
    deliveries,
    error,
    hasMore: nextCursor !== null,
    loading,
    loadingMore,
    loadMore,
    logisticsId,
    organizationName: sessionName,
    refresh,
    transition,
    unread,
    verifyRecipientCode,
  };
}
