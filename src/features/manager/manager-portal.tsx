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
import { ManagerPayouts } from "./pages/payouts";
import { ManagerSupport } from "./pages/support";
import { ManagerTicketDetail } from "./pages/ticket";
import { ManagerReports } from "./pages/reports";
import { ManagerNotifications } from "./pages/notifications";
import { ManagerResources } from "./pages/resources";
import { ManagerProfile } from "./pages/profile";
import { ManagerBankDetails } from "./pages/bank-details";
import { ManagerSettings } from "./pages/settings";
import {
  LayoutDashboard, UserPlus, ClipboardList, Coins,
  Wallet, LifeBuoy, Ticket, BarChart3, Bell, BookOpen,
  UserCircle, Landmark, Settings,
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
    { label: "Payouts", page: "payouts", icon: Wallet },
    { label: "Support", page: "support", icon: LifeBuoy },
    { label: "Ticket Detail", page: "ticket", icon: Ticket, badge: unread || undefined },
    { label: "Reports", page: "reports", icon: BarChart3 },
    { label: "Notifications", page: "notifications", icon: Bell, badge: unread || undefined },
    { label: "Resources", page: "resources", icon: BookOpen },
    { label: "Profile", page: "profile", icon: UserCircle },
    { label: "Bank Details", page: "bank-details", icon: Landmark },
    { label: "Settings", page: "settings", icon: Settings },
  ];

  return (
    <AppShell portal="manager" brand="Royal Palace" navItems={navItems} notifications={unread}>
      {page === "dashboard" ? <ManagerDashboard /> :
       page === "onboard" ? <ManagerOnboard /> :
       page === "applications" ? <ManagerApplications /> :
       page === "earnings" ? <ManagerEarnings /> :
       page === "payouts" ? <ManagerPayouts /> :
       page === "support" ? <ManagerSupport /> :
       page === "ticket" ? <ManagerTicketDetail /> :
       page === "reports" ? <ManagerReports /> :
       page === "notifications" ? <ManagerNotifications /> :
       page === "resources" ? <ManagerResources /> :
       page === "profile" ? <ManagerProfile /> :
       page === "bank-details" ? <ManagerBankDetails /> :
       page === "settings" ? <ManagerSettings /> :
       <ManagerDashboard />}
    </AppShell>
  );
}
