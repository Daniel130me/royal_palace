"use client";

import { useNav } from "@/lib/nav";
import { AppShell } from "@/components/healthcare/app-shell";
import { PharmacyDashboard } from "./pages/dashboard";
import { PharmacyPrescriptions } from "./pages/prescriptions";
import { PharmacyPrescriptionDetail } from "./pages/prescription";
import { PharmacyOrders } from "./pages/orders";
import { PharmacyOrderDetail } from "./pages/order";
import { LayoutDashboard, FileText, Package } from "lucide-react";

export function PharmacyPortal() {
  const { view } = useNav();
  const page = view.page;

  const navItems = [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Prescriptions", page: "prescriptions", icon: FileText },
    { label: "Orders", page: "orders", icon: Package },
  ];

  return (
    <AppShell portal="pharmacy" brand="Royal Palace" navItems={navItems} notifications={0}>
      {page === "prescriptions" ? (
        <PharmacyPrescriptions />
      ) : page === "prescription" ? (
        <PharmacyPrescriptionDetail />
      ) : page === "orders" ? (
        <PharmacyOrders />
      ) : page === "order" ? (
        <PharmacyOrderDetail />
      ) : (
        <PharmacyDashboard />
      )}
    </AppShell>
  );
}
