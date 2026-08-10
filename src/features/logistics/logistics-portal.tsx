"use client";

import { useNav } from "@/lib/nav";
import { AppShell } from "@/components/healthcare/app-shell";
import { LogisticsDashboard } from "./pages/dashboard";
import { LogisticsAssignments } from "./pages/assignments";
import { LogisticsDeliveryDetail } from "./pages/delivery";
import { LogisticsHistory } from "./pages/history";
import { LogisticsEarnings } from "./pages/earnings";
import { LayoutDashboard, Package, Truck, History, Wallet } from "lucide-react";

export function LogisticsPortal() {
  const { view } = useNav();
  const page = view.page;

  const navItems = [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Assignments", page: "assignments", icon: Package },
    { label: "Delivery Detail", page: "delivery", icon: Truck },
    { label: "History", page: "history", icon: History },
    { label: "Earnings", page: "earnings", icon: Wallet },
  ];

  return (
    <AppShell portal="logistics" brand="Royal Palace" navItems={navItems} notifications={0}>
      {page === "assignments" ? <LogisticsAssignments /> :
       page === "delivery" ? <LogisticsDeliveryDetail /> :
       page === "history" ? <LogisticsHistory /> :
       page === "earnings" ? <LogisticsEarnings /> :
       <LogisticsDashboard />}
    </AppShell>
  );
}
