"use client";

import { useNav } from "@/lib/nav";
import { PatientDashboard } from "./pages/dashboard";
import { PatientServices } from "./pages/services";
import { PatientDoctors } from "./pages/doctors";
import { PatientAppointments } from "./pages/appointments";
import { PatientAppointmentDetail } from "./pages/appointment-detail";
import { PatientBook } from "./pages/book";
import { PatientRecords } from "./pages/records";
import { PatientPrescriptions } from "./pages/prescriptions";
import { PatientPrescriptionDetail } from "./pages/prescription-detail";
import { PatientLaboratory } from "./pages/laboratory";
import { PatientOrders } from "./pages/orders";
import { PatientOrderDetail } from "./pages/order-detail";
import { PatientFamily } from "./pages/family";
import { PatientConsent } from "./pages/consent";
import { PatientPayments } from "./pages/payments";
import { PatientNotifications } from "./pages/notifications";
import { PatientSettings } from "./pages/settings";
import { PatientConsultation } from "./pages/consultation";
import {
  LayoutDashboard, Stethoscope, CalendarDays, FileText, Pill, FlaskConical,
  Package, Users, ShieldCheck, CreditCard, Bell, Settings,
} from "lucide-react";
import { AppShell } from "@/components/healthcare/app-shell";

export function PatientPortal() {
  const { view, session, activePatientId } = useNav();
  const page = view.page;

  const navItems = [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Find Care", page: "services", icon: Stethoscope },
    { label: "Appointments", page: "appointments", icon: CalendarDays },
    { label: "Health Records", page: "records", icon: FileText },
    { label: "Prescriptions", page: "prescriptions", icon: Pill },
    { label: "Laboratory", page: "laboratory", icon: FlaskConical },
    { label: "Pharmacy Orders", page: "orders", icon: Package },
    { label: "Family", page: "family", icon: Users },
    { label: "Consent & Access", page: "consent", icon: ShieldCheck },
    { label: "Payments", page: "payments", icon: CreditCard },
    { label: "Notifications", page: "notifications", icon: Bell },
    { label: "Settings", page: "settings", icon: Settings },
  ];

  return (
    <AppShell portal="patient" brand="Royal Palace" navItems={navItems} notifications={0}>
      {page === "dashboard" ? <PatientDashboard /> :
       page === "services" ? <PatientServices /> :
       page === "doctors" ? <PatientDoctors /> :
       page === "appointments" ? <PatientAppointments /> :
       page === "appointment" ? <PatientAppointmentDetail /> :
       page === "book" ? <PatientBook /> :
       page === "consultation" ? <PatientConsultation /> :
       page === "records" ? <PatientRecords /> :
       page === "prescriptions" ? <PatientPrescriptions /> :
       page === "prescription" ? <PatientPrescriptionDetail /> :
       page === "laboratory" ? <PatientLaboratory /> :
       page === "orders" ? <PatientOrders /> :
       page === "order" ? <PatientOrderDetail /> :
       page === "family" ? <PatientFamily /> :
       page === "consent" ? <PatientConsent /> :
       page === "payments" ? <PatientPayments /> :
       page === "notifications" ? <PatientNotifications /> :
       page === "settings" ? <PatientSettings /> :
       <PatientDashboard />}
    </AppShell>
  );
}
