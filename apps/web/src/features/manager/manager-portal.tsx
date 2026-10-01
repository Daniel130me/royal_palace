"use client";

// Manager Portal shell (plan §3.1). Routes every #/manager/* view and keeps
// mobile navigation usable: four primary tabs + a "More" sheet via AppShell.

import { useNav } from "@/lib/nav";
import { AppShell } from "@/components/healthcare/app-shell";
import { useManagerContext } from "./use-manager-context";
import { ManagerDashboard } from "./pages/dashboard";
import { ManagerOnboard } from "./pages/onboard";
import { ManagerApplications } from "./pages/applications";
import { ManagerEarnings } from "./pages/earnings";
import { ManagerSupport } from "./pages/support";
import { ManagerTicketDetail } from "./pages/ticket";
import { ManagerResources } from "./pages/resources";
import { ManagerProfile } from "./pages/profile";
import { ManagerSettings } from "./pages/settings";
import {
  LayoutDashboard,
  UserPlus,
  ClipboardList,
  Coins,
  LifeBuoy,
  Ticket,
  BookOpen,
  UserCircle,
  Settings,
} from "lucide-react";

export function ManagerPortal() {
  const { view } = useNav();
  const { unread } = useManagerContext();
  const page = view.page;

  const navItems = [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard, mobile: true },
    { label: "Enrollment Links", page: "onboard", icon: UserPlus, mobile: true },
    { label: "Enrollment Status", page: "applications", icon: ClipboardList },
    { label: "Manager Earnings", page: "earnings", icon: Coins, mobile: true },
    { label: "Support", page: "support", icon: LifeBuoy },
    { label: "Ticket Detail", page: "ticket", icon: Ticket, badge: unread || undefined },
    { label: "Resources", page: "resources", icon: BookOpen },
    { label: "Profile", page: "profile", icon: UserCircle },
    { label: "Settings", page: "settings", icon: Settings },
  ];

  return (
    <AppShell portal="manager" brand="Royal Palace" navItems={navItems} notifications={unread}>
      {page === "dashboard" ? (
        <ManagerDashboard />
      ) : page === "onboard" ? (
        <ManagerOnboard />
      ) : page === "applications" ? (
        <ManagerApplications />
      ) : page === "earnings" ? (
        <ManagerEarnings />
      ) : page === "support" ? (
        <ManagerSupport />
      ) : page === "ticket" ? (
        <ManagerTicketDetail />
      ) : page === "resources" ? (
        <ManagerResources />
      ) : page === "profile" ? (
        <ManagerProfile />
      ) : page === "settings" ? (
        <ManagerSettings />
      ) : (
        <ManagerDashboard />
      )}
    </AppShell>
  );
}
