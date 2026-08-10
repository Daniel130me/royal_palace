"use client";

import { useNav } from "@/lib/nav";
import { AppShell } from "@/components/healthcare/app-shell";
import {
  LayoutDashboard, Stethoscope, Tag, Pill, CreditCard, Wallet,
  ScrollText, MessageSquareWarning, CalendarDays, Package, Truck,
  Users, BarChart3, Settings,
} from "lucide-react";
import { AdminDashboard } from "./pages/dashboard";
import { AdminProviders } from "./pages/providers";
import { AdminProviderDetail } from "./pages/provider";
import { AdminPricing } from "./pages/pricing";
import { AdminPharmacyCommissions } from "./pages/pharmacy-commissions";
import { AdminPayments } from "./pages/payments";
import { AdminSettlements } from "./pages/settlements";
import { AdminAudit } from "./pages/audit";
import { AdminComplaints } from "./pages/complaints";
import { AdminAppointments } from "./pages/appointments";
import { AdminOrders } from "./pages/orders";
import { AdminDeliveries } from "./pages/deliveries";
import { AdminUsers } from "./pages/users";
import { AdminReports } from "./pages/reports";
import { AdminSettings } from "./pages/settings";

export function AdminPortal() {
  const { view } = useNav();
  const page = view.page;

  const navItems = [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Providers", page: "providers", icon: Stethoscope },
    { label: "Pricing", page: "pricing", icon: Tag },
    { label: "Pharmacy Commission", page: "pharmacy-commissions", icon: Pill },
    { label: "Payments", page: "payments", icon: CreditCard },
    { label: "Settlements", page: "settlements", icon: Wallet },
    { label: "Audit Trail", page: "audit", icon: ScrollText },
    { label: "Complaints", page: "complaints", icon: MessageSquareWarning },
    { label: "Appointments", page: "appointments", icon: CalendarDays },
    { label: "Pharmacy Orders", page: "orders", icon: Package },
    { label: "Deliveries", page: "deliveries", icon: Truck },
    { label: "Users", page: "users", icon: Users },
    { label: "Reports", page: "reports", icon: BarChart3 },
    { label: "Settings", page: "settings", icon: Settings },
  ];

  return (
    <AppShell portal="admin" brand="Royal Palace" navItems={navItems} notifications={0}>
      {page === "dashboard" ? <AdminDashboard /> :
       page === "providers" ? <AdminProviders /> :
       page === "provider" ? <AdminProviderDetail /> :
       page === "pricing" ? <AdminPricing /> :
       page === "pharmacy-commissions" ? <AdminPharmacyCommissions /> :
       page === "payments" ? <AdminPayments /> :
       page === "settlements" ? <AdminSettlements /> :
       page === "audit" ? <AdminAudit /> :
       page === "complaints" ? <AdminComplaints /> :
       page === "appointments" ? <AdminAppointments /> :
       page === "orders" ? <AdminOrders /> :
       page === "deliveries" ? <AdminDeliveries /> :
       page === "users" ? <AdminUsers /> :
       page === "reports" ? <AdminReports /> :
       page === "settings" ? <AdminSettings /> :
       <AdminDashboard />}
    </AppShell>
  );
}
