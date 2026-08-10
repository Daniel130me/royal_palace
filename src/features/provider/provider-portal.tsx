"use client";

import { useNav } from "@/lib/nav";
import { AppShell } from "@/components/healthcare/app-shell";
import { useProviderContext } from "./use-provider-context";
import { ProviderDashboard } from "./pages/dashboard";
import { ProviderAppointments } from "./pages/appointments";
import { ProviderAppointmentDetail } from "./pages/appointment";
import { ProviderEncounter } from "./pages/encounter";
import { ProviderPatients } from "./pages/patients";
import { ProviderPatientDetail } from "./pages/patient";
import { ProviderPrescriptions } from "./pages/prescriptions";
import { ProviderLabRequests } from "./pages/laboratory-requests";
import { ProviderReferrals } from "./pages/referrals";
import { ProviderResults } from "./pages/results";
import { ProviderEarnings } from "./pages/earnings";
import { ProviderAvailability } from "./pages/availability";
import { ProviderVerification } from "./pages/verification";
import { ProviderNotifications } from "./pages/notifications";
import { ProviderSettings } from "./pages/settings";
import {
  LayoutDashboard,
  CalendarDays,
  Stethoscope,
  Pill,
  FlaskConical,
  Share2,
  FileText,
  Wallet,
  Clock,
  BadgeCheck,
  Bell,
  Settings,
} from "lucide-react";

export function ProviderPortal() {
  const { view } = useNav();
  const { unread } = useProviderContext();
  const page = view.page;

  const navItems = [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Appointments", page: "appointments", icon: CalendarDays },
    { label: "Patients", page: "patients", icon: Stethoscope },
    { label: "Prescriptions", page: "prescriptions", icon: Pill },
    { label: "Lab Requests", page: "laboratory-requests", icon: FlaskConical },
    { label: "Results", page: "results", icon: FileText },
    { label: "Referrals", page: "referrals", icon: Share2 },
    { label: "Earnings", page: "earnings", icon: Wallet },
    { label: "Availability", page: "availability", icon: Clock },
    { label: "Verification", page: "verification", icon: BadgeCheck },
    { label: "Notifications", page: "notifications", icon: Bell, badge: unread || undefined },
    { label: "Settings", page: "settings", icon: Settings },
  ];

  return (
    <AppShell portal="provider" brand="Royal Palace" navItems={navItems} notifications={unread}>
      {page === "dashboard" ? <ProviderDashboard /> :
       page === "appointments" ? <ProviderAppointments /> :
       page === "appointment" ? <ProviderAppointmentDetail /> :
       page === "encounter" ? <ProviderEncounter /> :
       page === "patients" ? <ProviderPatients /> :
       page === "patient" ? <ProviderPatientDetail /> :
       page === "prescriptions" ? <ProviderPrescriptions /> :
       page === "laboratory-requests" ? <ProviderLabRequests /> :
       page === "results" ? <ProviderResults /> :
       page === "referrals" ? <ProviderReferrals /> :
       page === "earnings" ? <ProviderEarnings /> :
       page === "availability" ? <ProviderAvailability /> :
       page === "verification" ? <ProviderVerification /> :
       page === "notifications" ? <ProviderNotifications /> :
       page === "settings" ? <ProviderSettings /> :
       <ProviderDashboard />}
    </AppShell>
  );
}
