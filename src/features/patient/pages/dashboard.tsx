"use client";

import { useEffect, useState, useMemo } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePatientContext } from "../use-patient-context";
import { appointmentService, prescriptionService, labRequestService, pharmacyOrderService, carePlanService } from "@/lib/services";
import type { Appointment, Prescription, LaboratoryRequest, PharmacyOrder, CarePlan } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, relativeDay, formatTime, age } from "@/lib/format";
import {
  CalendarDays, Pill, FlaskConical, Package, Stethoscope, Plus, Video,
  HeartPulse, Activity, AlertCircle, ArrowRight, Bell, FileText,
} from "lucide-react";
import Link from "next/link";

export function PatientDashboard() {
  const { sessionName } = useNav();
  const { profile, loading, unread, notifications } = usePatientContext();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [carePlans, setCarePlans] = useState<CarePlan[]>([]);

  useEffect(() => {
    if (!profile) return;
    appointmentService.list({ patientId: profile.id }).then(setAppointments);
    prescriptionService.list({ patientId: profile.id }).then(setPrescriptions);
    labRequestService.list({ patientId: profile.id }).then(setLabRequests);
    pharmacyOrderService.list({ patientId: profile.id }).then(setOrders);
    carePlanService.list(profile.id).then(setCarePlans);
  }, [profile?.id]);

  const upcoming = useMemo(
    () => appointments.filter((a) => ["scheduled", "checked_in", "waiting_for_provider", "in_progress"].includes(a.status)).sort((a, b) => a.date.localeCompare(b.date)),
    [appointments]
  );
  const pendingRx = prescriptions.filter((p) => ["issued", "awaiting_pharmacy", "partially_fulfilled"].includes(p.status));
  const pendingLab = labRequests.filter((l) => l.status === "pending_booking");
  const activeOrders = orders.filter((o) => !["delivered", "cancelled", "refunded"].includes(o.status));

  if (loading) return <LoadingState label="Loading your dashboard…" />;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile?.firstName ?? sessionName.split(" ")[0]}`}
        description={profile ? `Managing healthcare for ${profile.firstName} ${profile.lastName}` : undefined}
        actions={
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("patient", "doctors")}>
            <Stethoscope className="h-4 w-4 mr-1" /> Consult a doctor
          </Button>
        }
      />

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Consult a Doctor", icon: Stethoscope, page: "doctors" },
          { label: "Book Lab Test", icon: FlaskConical, page: "laboratory" },
          { label: "Order Medicine", icon: Pill, page: "prescriptions" },
          { label: "View Records", icon: FileText, page: "records" },
          { label: "Add Dependant", icon: Plus, page: "family" },
        ].map((a) => (
          <button key={a.label} onClick={() => navigate("patient", a.page as any)} className="rounded-lg border bg-background p-4 text-left hover:border-emerald-400 hover:shadow-sm transition-all">
            <a.icon className="h-5 w-5 text-emerald-600 mb-2" />
            <p className="text-sm font-medium">{a.label}</p>
          </button>
        ))}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Upcoming" value={upcoming.length} icon={CalendarDays} tone="info" onClick={() => navigate("patient", "appointments")} />
        <MetricCard label="Active Rx" value={pendingRx.length} icon={Pill} tone="info" onClick={() => navigate("patient", "prescriptions")} />
        <MetricCard label="Pending Tests" value={pendingLab.length} icon={FlaskConical} tone="warning" onClick={() => navigate("patient", "laboratory")} />
        <MetricCard label="Active Orders" value={activeOrders.length} icon={Package} tone="info" onClick={() => navigate("patient", "orders")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: upcoming + records summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming appointment */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Upcoming appointment</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("patient", "appointments")}>View all</Button>
            </CardHeader>
            <CardContent>
              {upcoming[0] ? (
                <div className="rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{upcoming[0].provider ? `${upcoming[0].provider.title} ${upcoming[0].provider.lastName}` : "Consultation"}</p>
                      <p className="text-sm text-muted-foreground">{upcoming[0].provider?.specialty}</p>
                      <p className="text-sm mt-2">{relativeDay(upcoming[0].date)} · {formatTime(upcoming[0].time)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{upcoming[0].consultationChannel.replace("_", " ")} consultation</p>
                    </div>
                    <StatusBadge status={upcoming[0].status} />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("patient", "consultation", { id: upcoming[0].id })}>
                      <Video className="h-4 w-4 mr-1" /> Join consultation
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("patient", "appointment", { id: upcoming[0].id })}>Details</Button>
                  </div>
                </div>
              ) : (
                <EmptyState icon={CalendarDays} title="No upcoming appointment" description="Book a consultation with one of our verified doctors." action={<Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("patient", "doctors")}>Find a doctor</Button>} />
              )}
            </CardContent>
          </Card>

          {/* Active prescriptions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Active prescriptions</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("patient", "prescriptions")}>View all</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingRx.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No active prescriptions.</p>
              ) : pendingRx.slice(0, 3).map((rx) => (
                <div key={rx.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{rx.prescriptionNumber}</p>
                    <p className="text-xs text-muted-foreground">{rx.items?.length ?? 0} item(s) · expires {formatDate(rx.expiryDate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={rx.status} />
                    <Button size="sm" variant="outline" onClick={() => navigate("patient", "prescription", { id: rx.id })}>View</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Health summary */}
          {profile && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Health summary</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Active conditions</p>
                    {profile.conditions.length === 0 ? <p className="text-sm text-muted-foreground">None recorded</p> :
                      profile.conditions.map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-sm">
                          <Activity className="h-3 w-3 text-amber-500" /> {c.name}
                        </div>
                      ))}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Allergies</p>
                    {profile.allergies.length === 0 ? <p className="text-sm text-muted-foreground">None recorded</p> :
                      profile.allergies.map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-sm">
                          <AlertCircle className="h-3 w-3 text-rose-500" /> {c.name}
                        </div>
                      ))}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Current medicines</p>
                    {profile.medications.length === 0 ? <p className="text-sm text-muted-foreground">None</p> :
                      profile.medications.map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-sm">
                          <Pill className="h-3 w-3 text-sky-500" /> {c.name}
                        </div>
                      ))}
                  </div>
                </div>
                {carePlans[0] && (
                  <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                    <p className="text-xs font-medium text-emerald-700 flex items-center gap-1"><HeartPulse className="h-3.5 w-3.5" /> Active care plan</p>
                    <p className="text-sm font-medium mt-1">{carePlans[0].title}</p>
                    <p className="text-xs text-muted-foreground">{carePlans[0].description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: notifications + follow-up */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><Bell className="h-4 w-4" /> Notifications</CardTitle>
              {unread > 0 && <span className="text-xs bg-rose-500 text-white rounded-full px-2 py-0.5">{unread}</span>}
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No notifications.</p>
              ) : notifications.slice(0, 5).map((n) => (
                <div key={n.id} className={`rounded-lg p-3 text-sm ${n.read ? "bg-muted/40" : "bg-emerald-50/50 border border-emerald-100"}`}>
                  <p className="font-medium text-xs">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {pendingLab[0] && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-amber-700 flex items-center gap-1"><FlaskConical className="h-3.5 w-3.5" /> Pending laboratory test</p>
                <p className="text-sm mt-1">{pendingLab[0].tests.join(", ")}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("patient", "laboratory")}>
                  Book test <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Profile</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {profile && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient No.</span><span className="font-medium">{profile.patientNumber}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Age</span><span>{age(profile.dateOfBirth)} years</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Blood group</span><span>{profile.bloodGroup ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Genotype</span><span>{profile.genotype ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Location</span><span>{profile.city}, {profile.state}</span></div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
