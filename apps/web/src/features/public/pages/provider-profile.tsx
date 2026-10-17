"use client";

import type {
  PractitionerAvailabilityResponse,
  PublicPractitionerDetail,
} from "@royal-palace/contracts";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  GraduationCap,
  Languages,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/healthcare/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatMinorCurrency, initials } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { formatPractitionerLocation } from "@/lib/public-location";
import {
  createPractitionerAvailabilityRange,
  PRACTITIONER_AVAILABILITY_HORIZON_DAYS,
  practitionerModeLabel,
} from "@/lib/public-practitioner";
import { publicDiscoveryService, schedulingPaymentService } from "@/lib/services";

const PROFILE_SLOT_LIMIT = 5;

export function PublicProviderProfile() {
  const { view, session } = useNav();
  const practitionerId = view.params.id;
  const [practitioner, setPractitioner] = useState<PublicPractitionerDetail | null>(null);
  const [slots, setSlots] = useState<readonly PractitionerAvailabilityResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const availabilityRange = useMemo(() => createPractitionerAvailabilityRange(new Date()), []);

  useEffect(() => {
    if (practitionerId === undefined) {
      setError("Select a practitioner to view their profile.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      publicDiscoveryService.practitioner(practitionerId, controller.signal),
      schedulingPaymentService.availability(
        practitionerId,
        availabilityRange.from,
        availabilityRange.to,
        controller.signal,
      ),
    ])
      .then(([detail, availability]) => {
        setPractitioner(detail);
        setSlots(availability.slice(0, PROFILE_SLOT_LIMIT));
      })
      .catch((reason: unknown) => {
        if (!isAbort(reason)) {
          setError("This practitioner profile could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [availabilityRange, practitionerId, reloadKey]);

  if (loading) return <LoadingState label="Loading verified practitioner profile…" />;
  if (error !== null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />
      </div>
    );
  }
  if (practitioner === null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <EmptyState
          title="Practitioner unavailable"
          description="Choose another independently verified practitioner."
        />
      </div>
    );
  }

  const specialties =
    practitioner.specialties.map(({ name }) => name).join(" · ") ||
    practitioner.professions.map(({ name }) => name).join(" · ");
  const openBooking = () => {
    if (session?.role === "patient") {
      navigate("patient", "book", { providerId: practitioner.id });
      return;
    }
    navigate("login", "login");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <button
        type="button"
        onClick={() => navigate("public", "providers")}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All practitioners
      </button>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
              {initials(practitioner.displayName)}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{practitioner.displayName}</h1>
                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="mr-1 h-3 w-3" /> Independently verified
                </Badge>
              </div>
              <p className="text-muted-foreground">{specialties}</p>
              {practitioner.headline === null ? null : (
                <p className="mt-2 text-sm text-muted-foreground">{practitioner.headline}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                {practitioner.yearsExperience === null ? null : (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" /> {practitioner.yearsExperience} years of experience
                  </span>
                )}
                {practitioner.locations.map((location) => (
                  <span key={location.id} className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {formatPractitionerLocation(location)}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {practitioner.serviceModes.map((mode) => (
                  <Badge key={mode} variant="secondary">
                    {practitionerModeLabel(mode)}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-xs text-muted-foreground">Appointment prices</p>
              <p className="mt-1 max-w-52 text-sm font-medium text-emerald-700">
                Shown per published slot in its configured currency
              </p>
              <Button
                className="mt-3 bg-emerald-600 hover:bg-emerald-700"
                disabled={!practitioner.acceptingPatients}
                onClick={openBooking}
              >
                <Calendar className="mr-1 h-4 w-4" />
                {practitioner.acceptingPatients ? "Book appointment" : "Not accepting patients"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {practitioner.biography ?? "No public biography has been provided."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Credentials and affiliations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5" /> Verified public credentials
                </p>
                {practitioner.credentials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No public credentials listed.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {practitioner.credentials.map((credential, index) => (
                      <li key={`${credential.title}-${credential.issuerName}-${index}`}>
                        <span className="font-medium">{credential.title}</span>
                        <span className="text-muted-foreground">
                          {` · ${credential.issuerName}`}
                          {credential.awardedYear === null ? "" : ` · ${credential.awardedYear}`}
                          {credential.jurisdictionCode === null
                            ? ""
                            : ` · ${credential.jurisdictionCode}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> Affiliations
                </p>
                {practitioner.affiliations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No public affiliations listed.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {practitioner.affiliations.map((affiliation, index) => (
                      <li key={`${affiliation.facilityName}-${index}`}>
                        {affiliation.facilityName}
                        {affiliation.roleTitle === null ? "" : ` · ${affiliation.roleTitle}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {practitioner.languages.length === 0 ? null : (
                <div>
                  <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Languages className="h-3.5 w-3.5" /> Languages
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {practitioner.languages.map((language) => (
                      <Badge key={language} variant="secondary">
                        {language}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Next available appointments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bookable appointments are published in the next{" "}
                {PRACTITIONER_AVAILABILITY_HORIZON_DAYS} days.
              </p>
            ) : (
              slots.map((slot) => (
                <div key={slot.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{formatDateTime(slot.startsAt)}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{practitionerModeLabel(slot.mode)}</span>
                    <span className="font-semibold text-foreground">
                      {formatMinorCurrency(slot.amountMinor, slot.currency)}
                    </span>
                  </div>
                </div>
              ))
            )}
            {practitioner.acceptingPatients && slots.length > 0 ? (
              <Button className="mt-3 w-full" onClick={openBooking}>
                Choose an appointment
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}
