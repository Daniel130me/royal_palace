"use client";

import { useNav } from "@/lib/nav";
import { AppShell } from "@/components/healthcare/app-shell";
import { LaboratoryContextProvider } from "./use-lab-context";
import { LabDashboard } from "./pages/dashboard";
import { LabRequests } from "./pages/requests";
import { LabRequestDetail } from "./pages/request";
import { LabBookings } from "./pages/bookings";
import { LabResults } from "./pages/results";
import { LabResultNew } from "./pages/result-new";
import { LabCriticalResults } from "./pages/critical-results";
import { LabServices } from "./pages/services";
import { LabSettlements } from "./pages/settlements";
import { LaboratoryPayouts } from "./pages/payouts";
import { LabNotifications } from "./pages/notifications";
import { LabSettings } from "./pages/settings";
import {
  LayoutDashboard,
  FlaskConical,
  CalendarClock,
  FileText,
  AlertTriangle,
  ListChecks,
  Wallet,
  Bell,
  Settings,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { productionNotificationService } from "@/lib/services";

export function LaboratoryPortal() {
  return (
    <LaboratoryContextProvider>
      <LaboratoryPortalContent />
    </LaboratoryContextProvider>
  );
}

function LaboratoryPortalContent() {
  const { view } = useNav();
  const [unread, setUnread] = useState(0);
  const page = view.page;

  const updateUnread = useCallback((count: number) => setUnread(count), []);
  useEffect(() => {
    let active = true;
    void productionNotificationService
      .list({ limit: 1 })
      .then((response) => {
        if (active) setUnread(response.unreadCount);
      })
      .catch(() => {
        if (active) setUnread(0);
      });
    return () => {
      active = false;
    };
  }, []);

  const navItems = [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Test Requests", page: "requests", icon: FlaskConical },
    { label: "Bookings", page: "bookings", icon: CalendarClock },
    { label: "Results", page: "results", icon: FileText },
    {
      label: "Critical",
      page: "critical-results",
      icon: AlertTriangle,
      badge: unread || undefined,
    },
    { label: "Service Catalogue", page: "services", icon: ListChecks },
    { label: "Settlements", page: "settlements", icon: Wallet },
    { label: "Payouts", page: "payouts", icon: Wallet },
    { label: "Notifications", page: "notifications", icon: Bell, badge: unread || undefined },
    { label: "Settings", page: "settings", icon: Settings },
  ];

  return (
    <AppShell portal="laboratory" brand="Royal Palace" navItems={navItems} notifications={unread}>
      {page === "dashboard" ? (
        <LabDashboard />
      ) : page === "requests" ? (
        <LabRequests />
      ) : page === "request" ? (
        <LabRequestDetail />
      ) : page === "bookings" ? (
        <LabBookings />
      ) : page === "results" ? (
        <LabResults />
      ) : page === "result-new" ? (
        <LabResultNew />
      ) : page === "critical-results" ? (
        <LabCriticalResults />
      ) : page === "services" ? (
        <LabServices />
      ) : page === "settlements" ? (
        <LabSettlements />
      ) : page === "payouts" ? (
        <LaboratoryPayouts />
      ) : page === "notifications" ? (
        <LabNotifications onUnreadChange={updateUnread} />
      ) : page === "settings" ? (
        <LabSettings />
      ) : (
        <LabDashboard />
      )}
    </AppShell>
  );
}
