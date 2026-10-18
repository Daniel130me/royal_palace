"use client";

import type { PublicOrganizationDetail } from "@royal-palace/contracts";
import {
  Building2,
  Clock3,
  Hospital as HospitalIcon,
  MapPin,
  Phone,
  Siren,
  Stethoscope,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/healthcare/app-shell";
import { ErrorState, LoadingState, PageHeader } from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNav } from "@/lib/nav";
import { formatPublicLocation } from "@/lib/public-location";
import { publicDiscoveryService } from "@/lib/services";

export function HospitalPortal() {
  return (
    <AppShell
      portal="hospital"
      brand="Royal Palace Hospital"
      navItems={[
        { label: "Hospital Profile", page: "dashboard", icon: HospitalIcon, mobile: true },
      ]}
    >
      <HospitalDashboard />
    </AppShell>
  );
}

function HospitalDashboard() {
  const { session } = useNav();
  const [hospital, setHospital] = useState<PublicOrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const organizationId = session?.profileId;
    if (!organizationId) {
      setLoading(false);
      setError("Your session is not linked to a hospital organization.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await publicDiscoveryService.hospital(organizationId);
      if (result.organizationType !== "HOSPITAL") {
        throw new Error("Your session is not linked to a hospital organization.");
      }
      setHospital(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load hospital profile.");
    } finally {
      setLoading(false);
    }
  }, [session?.profileId]);

  useEffect(() => void load(), [load]);

  if (loading) return <LoadingState label="Loading hospital profile…" />;
  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (hospital === null) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={hospital.displayName}
        description="Verified hospital profile and patient-facing service catalogue."
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex gap-2 text-sm">
              <Stethoscope className="h-4 w-4" /> Services offered
            </CardTitle>
            <CardDescription>Patients use these services to find your hospital.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {hospital.services.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved public services yet.</p>
            ) : (
              hospital.services.map((service) => (
                <Badge key={service.id} variant="outline">
                  {service.name}
                  <span className="ml-1 text-muted-foreground">· {service.category}</span>
                </Badge>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2 text-sm">
              <Building2 className="h-4 w-4" /> Facility
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {hospital.locations.map((location) => (
              <div key={location.id} className="space-y-1.5 border-b pb-3 last:border-0 last:pb-0">
                <p className="flex gap-1.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formatPublicLocation(location)}</span>
                </p>
                {location.publicPhone === null ? null : (
                  <p className="flex gap-1.5 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" /> {location.publicPhone}
                  </p>
                )}
              </div>
            ))}
            {hospital.openTwentyFourHours ? (
              <p className="flex gap-1.5">
                <Clock3 className="h-4 w-4" /> Open 24 hours
              </p>
            ) : null}
            {hospital.emergencyAvailable ? (
              <p className="flex gap-1.5 text-rose-600">
                <Siren className="h-4 w-4" /> Emergency care available
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
