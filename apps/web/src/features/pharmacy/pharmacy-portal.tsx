"use client";

import { useNav } from "@/lib/nav";
import { AppShell } from "@/components/healthcare/app-shell";
import { PharmacyDashboard } from "./pages/dashboard";
import { PharmacyPrescriptions } from "./pages/prescriptions";
import { PharmacyPrescriptionDetail } from "./pages/prescription";
import { PharmacyScannedPrescriptionDetail } from "./pages/scanned-prescription";
import { PharmacyOrders } from "./pages/orders";
import { PharmacyOrderDetail } from "./pages/order";
import { PharmacyProducts } from "./pages/products";
import { PharmacyProductDetail } from "./pages/product";
import { PharmacyInventory } from "./pages/inventory";
import { PharmacyDeliveries } from "./pages/deliveries";
import { PharmacyNotifications } from "./pages/notifications";
import { PharmacySettings } from "./pages/settings";
import { PharmacyCommissions } from "./pages/commissions";
import { PharmacyPayouts } from "./pages/payouts";
import { PharmacySettlements } from "./pages/settlements";
import {
  Bell,
  FileText,
  LayoutDashboard,
  Package,
  Pill,
  Settings,
  Truck,
  Warehouse,
  Banknote,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { productionNotificationService } from "@/lib/services";

export function PharmacyPortal() {
  const { view } = useNav();
  const page = view.page;
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const updateUnreadNotifications = useCallback(
    (count: number) => setUnreadNotifications(count),
    [],
  );

  useEffect(() => {
    let active = true;
    void productionNotificationService
      .list({ limit: 1 })
      .then((response) => {
        if (active) setUnreadNotifications(response.unreadCount);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const navItems = [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Prescriptions", page: "prescriptions", icon: FileText },
    { label: "Orders", page: "orders", icon: Package },
    { label: "Products", page: "products", icon: Pill },
    { label: "Inventory", page: "inventory", icon: Warehouse },
    { label: "Deliveries", page: "deliveries", icon: Truck },
    { label: "Earnings", page: "commissions", icon: Banknote },
    { label: "Settlements", page: "settlements", icon: Wallet },
    { label: "Payouts", page: "payouts", icon: Wallet },
    { label: "Notifications", page: "notifications", icon: Bell, badge: unreadNotifications },
    { label: "Settings", page: "settings", icon: Settings },
  ];

  return (
    <AppShell
      portal="pharmacy"
      brand="Royal Palace"
      navItems={navItems}
      notifications={unreadNotifications}
    >
      {page === "prescriptions" ? (
        <PharmacyPrescriptions />
      ) : page === "prescription" ? (
        <PharmacyPrescriptionDetail />
      ) : page === "scanned-prescription" ? (
        <PharmacyScannedPrescriptionDetail />
      ) : page === "orders" ? (
        <PharmacyOrders />
      ) : page === "order" ? (
        <PharmacyOrderDetail />
      ) : page === "products" ? (
        <PharmacyProducts />
      ) : page === "product" ? (
        <PharmacyProductDetail />
      ) : page === "inventory" ? (
        <PharmacyInventory />
      ) : page === "deliveries" ? (
        <PharmacyDeliveries />
      ) : page === "commissions" ? (
        <PharmacyCommissions />
      ) : page === "settlements" ? (
        <PharmacySettlements />
      ) : page === "payouts" ? (
        <PharmacyPayouts />
      ) : page === "notifications" ? (
        <PharmacyNotifications onUnreadChange={updateUnreadNotifications} />
      ) : page === "settings" ? (
        <PharmacySettings />
      ) : (
        <PharmacyDashboard />
      )}
    </AppShell>
  );
}
