"use client";

import { useCallback, useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import {
  pharmacyService, notificationService, prescriptionService,
  pharmacyOrderService, settlementService,
} from "@/lib/services";
import type {
  Pharmacy, Notification, Prescription, PharmacyOrder,
  PharmacyProduct, Settlement,
} from "@/types";

// Resolves the active pharmacy profile + sidebar notification badges.
// Pharmacy ID comes from the session profileId (e.g. PHA-001 for Grace Pharmacy).
export function usePharmacyContext() {
  const { session } = useNav();
  const pharmacyId = session?.profileId ?? null;

  const [profile, setProfile] = useState<Pharmacy | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!pharmacyId) return;
    Promise.all([
      pharmacyService.get(pharmacyId),
      notificationService.list(pharmacyId, "pharmacy").catch(() => [] as Notification[]),
      prescriptionService.list().catch(() => [] as Prescription[]),
      pharmacyOrderService.list({ pharmacyId }).catch(() => [] as PharmacyOrder[]),
      pharmacyService.products(pharmacyId).catch(() => [] as PharmacyProduct[]),
      settlementService.list({ entityType: "pharmacy", entityId: pharmacyId }).catch(() => [] as Settlement[]),
    ])
      .then(([p, notifs, rx, ords, prods, stls]) => {
        setProfile(p);
        setNotifications(notifs);
        setPrescriptions(rx);
        setOrders(ords);
        setProducts(prods);
        setSettlements(stls);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load pharmacy context"))
      .finally(() => setLoading(false));
  }, [pharmacyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unread = notifications.filter((n) => !n.read).length;

  // Sidebar badges
  const newRxCount = prescriptions.filter((p) =>
    ["issued", "awaiting_pharmacy"].includes(p.status)
  ).length;
  const awaitingAcceptance = orders.filter((o) =>
    ["paid", "prescription_under_review"].includes(o.status)
  ).length;
  const clarificationCount = orders.filter((o) => o.status === "clarification_required").length;
  const preparingCount = orders.filter((o) => o.status === "preparing").length;
  const readyCount = orders.filter((o) => o.status === "ready_for_pickup").length;

  return {
    pharmacyId,
    profile,
    notifications,
    unread,
    prescriptions,
    orders,
    products,
    settlements,
    loading,
    error,
    refresh,
    newRxCount,
    awaitingAcceptance,
    clarificationCount,
    preparingCount,
    readyCount,
  };
}
