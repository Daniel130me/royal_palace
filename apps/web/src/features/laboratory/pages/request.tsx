"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  LaboratoryBookingResponse,
  LaboratoryBookingStatus,
  LaboratoryQueueRequestResponse,
} from "@royal-palace/contracts";
import {
  ArrowRight,
  Calendar,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  FlaskConical,
  Home,
  MapPin,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";

import {
  BottomActionBar,
  ErrorState,
  PageHeader,
  SectionCard,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionLaboratoryService } from "@/lib/services";
import { useLabContext } from "../use-lab-context";

type SupportedTransition = {
  label: string;
  reasonCode:
    | "collection_arranged"
    | "sample_collected"
    | "processing_started"
    | "laboratory_cancelled"
    | "sample_invalid";
  toStatus: "SAMPLE_COLLECTION_PENDING" | "SAMPLE_COLLECTED" | "PROCESSING" | "CANCELLED";
  variant?: "default" | "destructive";
};

const TRANSITIONS: Partial<Record<LaboratoryBookingStatus, readonly SupportedTransition[]>> = {
  CONFIRMED: [
    {
      label: "Confirm collection arrangement",
      reasonCode: "collection_arranged",
      toStatus: "SAMPLE_COLLECTION_PENDING",
    },
    {
      label: "Cancel booking",
      reasonCode: "laboratory_cancelled",
      toStatus: "CANCELLED",
      variant: "destructive",
    },
  ],
  SAMPLE_COLLECTION_PENDING: [
    {
      label: "Mark sample collected",
      reasonCode: "sample_collected",
      toStatus: "SAMPLE_COLLECTED",
    },
    {
      label: "Cancel booking",
      reasonCode: "laboratory_cancelled",
      toStatus: "CANCELLED",
      variant: "destructive",
    },
  ],
  SAMPLE_COLLECTED: [
    { label: "Start processing", reasonCode: "processing_started", toStatus: "PROCESSING" },
    {
      label: "Reject invalid sample",
      reasonCode: "sample_invalid",
      toStatus: "CANCELLED",
      variant: "destructive",
    },
  ],
};

function bookingFrom(request: LaboratoryQueueRequestResponse, bookingId: string) {
  return request.bookings.find((booking) => booking.id === bookingId);
}

export function LabRequestDetail() {
  const { view } = useNav();
  const { labId } = useLabContext();
  const bookingId = view.params.id;
  const [request, setRequest] = useState<LaboratoryQueueRequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressing, setProgressing] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId || !labId) {
      setError("The laboratory booking could not be identified.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRequest(await productionLaboratoryService.laboratory.getBooking(labId, bookingId));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The laboratory request could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId, labId]);

  useEffect(() => {
    void load();
  }, [load]);

  const booking = request && bookingId ? bookingFrom(request, bookingId) : undefined;
  const transitions = useMemo(
    () => (booking ? (TRANSITIONS[booking.status] ?? []) : []),
    [booking],
  );

  async function transition(next: SupportedTransition) {
    if (!booking || !labId) return;
    setProgressing(true);
    try {
      const updated = await productionLaboratoryService.laboratory.transition(labId, booking.id, {
        expectedVersion: booking.version,
        reasonCode: next.reasonCode,
        toStatus: next.toStatus,
      });
      setRequest(updated);
      toast.success(`Booking updated to ${next.toStatus.toLowerCase().replaceAll("_", " ")}.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The booking could not be updated.");
      await load();
    } finally {
      setProgressing(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!request || !booking) return <ErrorState message="Laboratory booking not found." />;

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <PageHeader
        title={`Request ${request.requestNumber}`}
        description={`${request.service.name} · ${request.priority.toLowerCase()} priority`}
        back
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Test requested" icon={FlaskConical}>
            <Badge variant="secondary" className="mb-4 text-sm">
              {request.service.name}
            </Badge>
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5" /> Clinical indication
              </p>
              <p className="text-sm leading-relaxed">{request.clinicalIndication}</p>
            </div>
            {request.specimenInstructions && (
              <div className="mt-3 whitespace-pre-line rounded-xl border border-border/60 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Specimen instructions
                </p>
                {request.specimenInstructions}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Patient" icon={Stethoscope}>
            <p className="font-semibold">{request.patient.displayName}</p>
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              Only the minimum identity and test context required for this booking is disclosed.
              Full patient records are not available to the laboratory.
            </p>
          </SectionCard>

          <SectionCard title="Referring practitioner" icon={Stethoscope}>
            <p className="font-semibold">{request.practitioner.displayName}</p>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Booking status" icon={CalendarClock}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current status</span>
              <StatusBadge status={booking.status.toLowerCase()} size="sm" />
            </div>
            <Separator className="my-4" />
            <dl className="space-y-3 text-sm">
              <Detail label="Booking number" value={booking.bookingNumber} />
              <Detail
                label="Collection method"
                value={booking.collectionMode === "HOME" ? "Home collection" : "At laboratory"}
              />
              <Detail
                label="Scheduled"
                value={booking.scheduledAt ? formatDate(booking.scheduledAt) : "Not scheduled"}
              />
              <Detail label="Accepted" value={formatDate(booking.acceptedAt)} />
            </dl>
            {booking.homeCollection && (
              <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
                <p className="flex items-center gap-1.5 font-medium">
                  <Home className="h-4 w-4" /> Collection address
                </p>
                <p className="mt-2 flex items-start gap-1.5 text-xs">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {formatHomeCollectionAddress(booking.homeCollection)}
                </p>
                {booking.homeCollection.collectionInstructions && (
                  <p className="mt-2 whitespace-pre-line text-xs">
                    {booking.homeCollection.collectionInstructions}
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          {transitions.length > 0 && (
            <SectionCard title="Next action">
              <div className="space-y-2">
                {transitions.map((next) => (
                  <Button
                    key={`${next.toStatus}-${next.reasonCode}`}
                    variant={next.variant}
                    className="w-full justify-between"
                    disabled={progressing}
                    onClick={() => void transition(next)}
                  >
                    {next.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ))}
              </div>
            </SectionCard>
          )}

          {booking.status === "PROCESSING" && (
            <SectionCard title="Result workflow" icon={FileCheck2}>
              <p className="mb-3 text-sm text-muted-foreground">
                Result entry, clinical review and critical-result handling continue in the result
                workflow.
              </p>
              <Button
                className="w-full"
                onClick={() =>
                  navigate("laboratory", "result-new", {
                    bookingId: booking.id,
                    requestId: request.id,
                  })
                }
              >
                <FileCheck2 className="h-4 w-4" /> Enter result
              </Button>
            </SectionCard>
          )}
        </div>
      </div>

      {transitions.length > 0 && transitions[0] && (
        <BottomActionBar>
          <Button
            className="w-full"
            disabled={progressing}
            onClick={() => void transition(transitions[0]!)}
          >
            <Calendar className="h-4 w-4" /> {transitions[0].label}
          </Button>
        </BottomActionBar>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function formatHomeCollectionAddress(
  collection: NonNullable<LaboratoryBookingResponse["homeCollection"]>,
) {
  return [
    collection.addressLine1,
    collection.addressLine2,
    collection.locality,
    collection.administrativeArea,
    collection.postalCode,
    collection.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
}
