"use client";

import { useNav } from "@/lib/nav";
import { AppShell } from "@/components/healthcare/app-shell";
import { PharmacyDashboard } from "./pages/dashboard";
import { PharmacyPrescriptions } from "./pages/prescriptions";
import { PharmacyPrescriptionDetail } from "./pages/prescription";
import { PharmacyOrders } from "./pages/orders";
import { PharmacyOrderDetail } from "./pages/order";
import { PharmacyProducts } from "./pages/products";
import { PharmacyProductDetail } from "./pages/product";
import { PharmacyInventory } from "./pages/inventory";
import { PharmacyDeliveries } from "./pages/deliveries";
import { PharmacyCommissions } from "./pages/commissions";
import { PharmacySettlements } from "./pages/settlements";
import { PharmacyNotifications } from "./pages/notifications";
import { PharmacySettings } from "./pages/settings";
import {
  LayoutDashboard, FileText, Package, Pill, Boxes, Truck,
  Percent, Wallet, Bell, Settings,
} from "lucide-react";

export function PharmacyPortal() {
  const { view } = useNav();
  const page = view.page;

  const navItems = [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Prescriptions", page: "prescriptions", icon: FileText },
    { label: "Orders", page: "orders", icon: Package },
    { label: "Products", page: "products", icon: Pill },
    { label: "Inventory", page: "inventory", icon: Boxes },
    { label: "Deliveries", page: "deliveries", icon: Truck },
    { label: "Commissions", page: "commissions", icon: Percent },
    { label: "Settlements", page: "settlements", icon: Wallet },
    { label: "Notifications", page: "notifications", icon: Bell },
    { label: "Settings", page: "settings", icon: Settings },
  ];

  return (
    <AppShell portal="pharmacy" brand="Royal Palace" navItems={navItems} notifications={0}>
      {page === "prescriptions" ? <PharmacyPrescriptions /> :
       page === "prescription" ? <PharmacyPrescriptionDetail /> :
       page === "orders" ? <PharmacyOrders /> :
       page === "order" ? <PharmacyOrderDetail /> :
       page === "products" ? <PharmacyProducts /> :
       page === "product" ? <PharmacyProductDetail /> :
       page === "inventory" ? <PharmacyInventory /> :
       page === "deliveries" ? <PharmacyDeliveries /> :
       page === "commissions" ? <PharmacyCommissions /> :
       page === "settlements" ? <PharmacySettlements /> :
       page === "notifications" ? <PharmacyNotifications /> :
       page === "settings" ? <PharmacySettings /> :
       <PharmacyDashboard />}
    </AppShell>
  );
}
