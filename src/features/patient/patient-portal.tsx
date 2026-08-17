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
import { PatientUploadPrescription } from "./pages/upload-prescription";
import { PatientUploads } from "./pages/uploads";
import { PatientLaboratory } from "./pages/laboratory";
import { PatientOrders } from "./pages/orders";
import { PatientOrderDetail } from "./pages/order-detail";
import { PatientFamily } from "./pages/family";
import { PatientConsent } from "./pages/consent";
import { PatientPayments } from "./pages/payments";
import { PatientNotifications } from "./pages/notifications";
import { PatientSettings } from "./pages/settings";
import { PatientConsultation } from "./pages/consultation";
import { PatientPharmacies } from "./pages/pharmacies";
import { PatientLaboratories } from "./pages/laboratories";
import { PatientPharmacyDetail } from "./pages/pharmacy-detail";
import {
  LayoutDashboard, Stethoscope, CalendarDays, FileText, Pill, FlaskConical,
  Package, Users, ShieldCheck, CreditCard, Bell, Settings, Upload,
} from "lucide-react";
import { AppShell } from "@/components/healthcare/app-shell";
import { usePatientContext } from "./use-patient-context";

export function PatientPortal() {
  const { view } = useNav();
  const page = view.page;
  const { unread } = usePatientContext();

  // The first 4 items become the mobile bottom tab bar (Home / Find Care /
  // Records / Orders). Everything else lives under "More".
  const navItems = [
    { label: "Home", page: "dashboard", icon: LayoutDashboard, mobile: true },
    { label: "Find Care", page: "services", icon: Stethoscope, mobile: true },
    { label: "Records", page: "records", icon: FileText, mobile: true },
    { label: "Orders", page: "orders", icon: Package, mobile: true },
    { label: "Appointments", page: "appointments", icon: CalendarDays },
    { label: "Prescriptions", page: "prescriptions", icon: Pill },
    { label: "My Uploads", page: "uploads", icon: Upload },
    { label: "Laboratory", page: "laboratory", icon: FlaskConical },
    { label: "Family", page: "family", icon: Users },
    { label: "Consent & Access", page: "consent", icon: ShieldCheck },
    { label: "Payments", page: "payments", icon: CreditCard },
    { label: "Notifications", page: "notifications", icon: Bell, badge: unread || undefined },
    { label: "Settings", page: "settings", icon: Settings },
  ];

  return (
    <AppShell portal="patient" brand="Royal Palace" navItems={navItems} notifications={unread}>
      {page === "dashboard" ? <PatientDashboard /> :
       page === "services" ? <PatientServices /> :
       page === "doctors" ? <PatientDoctors /> :
       page === "appointments" ? <PatientAppointments /> :
       page === "appointment" ? <PatientAppointmentDetail /> :
       page === "book" ? <PatientBook /> :
       page === "consultation" ? <PatientConsultation /> :
       page === "pharmacies" ? <PatientPharmacies /> :
       page === "laboratories" ? <PatientLaboratories /> :
       page === "pharmacy" ? <PatientPharmacyDetail /> :
       page === "upload-prescription" ? <PatientUploadPrescription /> :
       page === "uploads" ? <PatientUploads /> :
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
