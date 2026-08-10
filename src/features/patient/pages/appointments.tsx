"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { appointmentService } from "@/lib/services";
import type { Appointment, AppointmentStatus } from "@/types";
import { PageHeader, EmptyState, LoadingState, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarDays, ChevronRight, Plus, Video } from "lucide-react";
import { formatCurrency, formatDate, formatTime, fullName, initials, relativeDay } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

const UPCOMING: AppointmentStatus[] = ["scheduled", "checked_in", "waiting_for_provider", "in_progress", "awaiting_documentation"];
const COMPLETED: AppointmentStatus[] = ["completed"];
const CANCELLED: AppointmentStatus[] = ["cancelled", "no_show"];

export function PatientAppointments() {
  const { profile } = usePatientContext();
  const [all, setAll] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    appointmentService.list({ patientId: profile.id })
      .then((rows) => { if (!cancelled) setAll(rows); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load appointments"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const upcoming = useMemo(() => all.filter((a) => UPCOMING.includes(a.status)).sort((a, b) => a.date.localeCompare(b.date)), [all]);
  const completed = useMemo(() => all.filter((a) => COMPLETED.includes(a.status)).sort((a, b) => b.date.localeCompare(a.date)), [all]);
  const cancelled = useMemo(() => all.filter((a) => CANCELLED.includes(a.status)).sort((a, b) => b.date.localeCompare(a.date)), [all]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Appointments"
        description="View and manage your consultations."
        actions={
          <Button size="sm" onClick={() => navigate("patient", "doctors")}>
            <Plus className="h-4 w-4" /> Book new
          </Button>
        }
      />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : error ? (
        <EmptyState title="Could not load appointments" description={error} />
      ) : (
        <Tabs defaultValue="upcoming">
          <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 py-2 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur-md">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled ({cancelled.length})</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="upcoming" className="mt-4 space-y-3">
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming appointments"
                description="Book a consultation with one of our verified doctors."
                action={<Button onClick={() => navigate("patient", "doctors")}>Find a doctor</Button>}
              />
            ) : (
              upcoming.map((a) => <AppointmentRow key={a.id} appt={a} />)
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4 space-y-3">
            {completed.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No completed appointments yet" description="Your past consultations will appear here." compact />
            ) : (
              completed.map((a) => <AppointmentRow key={a.id} appt={a} />)
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="mt-4 space-y-3">
            {cancelled.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No cancelled appointments" description="You have a clean record." compact />
            ) : (
              cancelled.map((a) => <AppointmentRow key={a.id} appt={a} />)
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function AppointmentRow({ appt: a }: { appt: Appointment }) {
  const provider = a.provider;
  const isUpcoming = ["scheduled", "checked_in", "waiting_for_provider", "in_progress"].includes(a.status);
  return (
    <Card className="hover:shadow-soft-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {provider ? initials(`${provider.firstName} ${provider.lastName}`) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{provider ? fullName(provider) : "Provider"}</p>
                <p className="text-sm text-muted-foreground truncate">{provider?.specialty}</p>
              </div>
              <StatusBadge status={a.status} size="sm" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {relativeDay(a.date)} · {formatDate(a.date)} · {formatTime(a.time)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="capitalize">{a.consultationChannel.replace("_", " ")}</span>
              <span>· {formatCurrency(a.price)}</span>
              <span>· Pay: <span className="capitalize">{a.paymentStatus}</span></span>
            </div>
            <div className="mt-3 flex gap-2">
              {isUpcoming && a.consultationChannel === "video" && (
                <Button size="sm" onClick={() => navigate("patient", "consultation", { id: a.id })}>
                  <Video className="h-3.5 w-3.5" /> Join
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate("patient", "appointment", { id: a.id })}>
                View details <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
