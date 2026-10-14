"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  LaboratoryBookingStatus,
  LaboratoryRequestResponse,
  LaboratoryReviewTaskResponse,
  LaboratoryResultResponse,
  PublicOrganizationSummary,
} from "@royal-palace/contracts";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  Home,
  Lock,
  MapPin,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import { CompactListItem } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LaboratoryResultCard } from "@/features/shared/laboratory-result-card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMinorCurrency, formatTime } from "@/lib/format";
import {
  productionLaboratoryService,
  publicDiscoveryService,
  schedulingPaymentService,
} from "@/lib/services";
import { usePatientContext } from "../use-patient-context";

const TIME_SLOTS = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];
const ACTIVE_BOOKING_STATUSES: ReadonlySet<LaboratoryBookingStatus> = new Set([
  "CONFIRMED",
  "SAMPLE_COLLECTION_PENDING",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "RESULT_READY",
]);
const CHECKOUT_PAYMENT_STATUSES = new Set(["CREATED", "PENDING", "FAILED"]);

type LabTab = "pending" | "bookings" | "results";

function nextDays(count: number): { label: string; sub: string; value: string }[] {
  const result: { label: string; sub: string; value: string }[] = [];
  const today = new Date();
  for (let offset = 1; offset <= count; offset += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    result.push({
      label: date.toLocaleDateString("en", { day: "2-digit", month: "short" }),
      sub: offset === 1 ? "Tomorrow" : date.toLocaleDateString("en", { weekday: "short" }),
      value: date.toISOString().slice(0, 10),
    });
  }
  return result;
}

function activeBooking(request: LaboratoryRequestResponse) {
  return request.bookings.find((booking) => booking.status !== "CANCELLED");
}

export function PatientLaboratory() {
  const { profile } = usePatientContext();
  const [requests, setRequests] = useState<readonly LaboratoryRequestResponse[]>([]);
  const [results, setResults] = useState<readonly LaboratoryResultResponse[]>([]);
  const [reviewTasks, setReviewTasks] = useState<readonly LaboratoryReviewTaskResponse[]>([]);
  const [bookingFor, setBookingFor] = useState<LaboratoryRequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [resultEndCursor, setResultEndCursor] = useState<string | null>(null);
  const [hasNextResultPage, setHasNextResultPage] = useState(false);
  const [loadingMoreResults, setLoadingMoreResults] = useState(false);
  const [tab, setTab] = useState<LabTab>("pending");

  const load = useCallback(
    async (cursor?: string) => {
      if (!profile) return;
      if (cursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const production = await productionLaboratoryService.patient.list(cursor);
        setRequests((current) =>
          cursor === undefined ? production.data : [...current, ...production.data],
        );
        setEndCursor(production.pageInfo.endCursor);
        setHasNextPage(production.pageInfo.hasNextPage);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Laboratory requests could not be loaded.",
        );
      } finally {
        if (cursor === undefined) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [profile],
  );

  const loadResults = useCallback(async (cursor?: string) => {
    if (cursor !== undefined) setLoadingMoreResults(true);
    try {
      const response = await productionLaboratoryService.patient.results(cursor);
      setResults((current) =>
        cursor === undefined ? response.data : [...current, ...response.data],
      );
      setResultEndCursor(response.pageInfo.endCursor);
      setHasNextResultPage(response.pageInfo.hasNextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Laboratory results could not be loaded.");
    } finally {
      setLoadingMoreResults(false);
    }
  }, []);

  const loadReviews = useCallback(async () => {
    try {
      const response = await productionLaboratoryService.patient.reviews(50);
      setReviewTasks(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Laboratory ratings could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load(undefined);
    void loadResults(undefined);
    void loadReviews();
  }, [load, loadResults, loadReviews]);

  const pendingReviews = reviewTasks.filter((task) => task.review === null);

  const sections = useMemo(() => {
    const ordered = [...requests].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    return {
      pending: ordered.filter((request) => request.status === "ACTIVE" && !activeBooking(request)),
      bookings: ordered.filter((request) => {
        const booking = activeBooking(request);
        return booking !== undefined && ACTIVE_BOOKING_STATUSES.has(booking.status);
      }),
    };
  }, [requests]);

  if (loading) return <LoadingState label="Loading laboratory…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Laboratory" description="Book tests, track samples and view results." />

      {pendingReviews.length > 0 ? (
        <section className="space-y-2" aria-labelledby="laboratory-ratings-heading">
          <div>
            <h2 id="laboratory-ratings-heading" className="text-sm font-semibold">
              Rating required
            </h2>
            <p className="text-xs text-muted-foreground">
              Rate each completed service. Comments remain private until moderation.
            </p>
          </div>
          {pendingReviews.map((task) => (
            <LaboratoryReviewCard key={task.bookingId} task={task} onSubmitted={loadReviews} />
          ))}
        </section>
      ) : null}

      <SegmentedControl<LabTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "pending", label: "Pending", badge: sections.pending.length || undefined },
          { value: "bookings", label: "Bookings", badge: sections.bookings.length || undefined },
          { value: "results", label: "Results", badge: results.length || undefined },
        ]}
      />

      {tab === "pending" &&
        (sections.pending.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No pending tests"
            description="Your practitioner can request laboratory tests during a consultation."
            compact
          />
        ) : (
          <div className="divide-y divide-amber-100 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50">
            {sections.pending.map((request) => (
              <CompactListItem
                key={request.id}
                leading={
                  <div className="rounded-lg bg-amber-100 p-2">
                    <FlaskConical className="h-4 w-4 text-amber-700" />
                  </div>
                }
                title={request.service.name}
                subtitle={`${request.requestNumber} · requested by ${request.practitioner.displayName}`}
                trailing={
                  <div className="flex flex-col items-end gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setBookingFor(request)}
                    >
                      Book
                    </Button>
                    <StatusBadge status={request.priority.toLowerCase()} size="sm" />
                  </div>
                }
                onClick={() => setBookingFor(request)}
                chevron
              />
            ))}
          </div>
        ))}

      {tab === "bookings" &&
        (sections.bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No bookings"
            description="Upcoming tests appear here after you select a verified laboratory."
            compact
          />
        ) : (
          <div className="space-y-2">
            {sections.bookings.map((request) => (
              <BookingRow key={request.id} request={request} />
            ))}
          </div>
        ))}

      {tab === "results" &&
        (results.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No results yet"
            description="Completed laboratory results will appear here."
            compact
          />
        ) : (
          <div className="space-y-2">
            {results.map((result) => (
              <LaboratoryResultCard
                downloadAttachment={(resultId, attachmentId) =>
                  productionLaboratoryService.patient.resultAttachmentDownload(
                    resultId,
                    attachmentId,
                  )
                }
                key={result.id}
                result={result}
              />
            ))}
          </div>
        ))}

      {tab === "results" && hasNextResultPage && resultEndCursor && (
        <div className="flex justify-center">
          <Button
            disabled={loadingMoreResults}
            onClick={() => void loadResults(resultEndCursor)}
            variant="outline"
          >
            {loadingMoreResults ? "Loading…" : "Load more results"}
          </Button>
        </div>
      )}

      {hasNextPage && endCursor && tab !== "results" && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void load(endCursor)}>
            {loadingMore ? "Loading…" : "Load more requests"}
          </Button>
        </div>
      )}

      <LabBookingSheet
        request={bookingFor}
        onBooked={() => {
          setBookingFor(null);
          void load(undefined);
        }}
        onClose={() => setBookingFor(null)}
      />
    </div>
  );
}

function LaboratoryReviewCard({
  onSubmitted,
  task,
}: {
  onSubmitted: () => Promise<void>;
  task: LaboratoryReviewTaskResponse;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (score === null) return;
    setSubmitting(true);
    try {
      await productionLaboratoryService.patient.submitReview(task.bookingId, {
        ...(comment.trim() === "" ? {} : { comment: comment.trim() }),
        score,
      });
      toast.success("Thank you. Your verified rating has been recorded.");
      await onSubmitted();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The rating could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{task.service.name}</p>
          <p className="text-xs text-muted-foreground">
            {task.laboratory.displayName} · completed {formatDate(task.completedAt)}
          </p>
        </div>
        <Badge variant="outline" className="bg-background text-amber-700">
          Verified service
        </Badge>
      </div>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Service rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            aria-checked={score === value}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            className="rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            key={value}
            onClick={() => setScore(value)}
            role="radio"
            type="button"
          >
            <Star
              className={
                score !== null && value <= score
                  ? "h-6 w-6 fill-amber-400 text-amber-500"
                  : "h-6 w-6 text-muted-foreground/40"
              }
            />
          </button>
        ))}
      </div>
      <Textarea
        aria-label="Optional rating comment"
        className="mt-2 min-h-20 bg-background"
        maxLength={2000}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Optional comment (moderated before publication)"
        value={comment}
      />
      <div className="mt-2 flex justify-end">
        <Button disabled={score === null || submitting} onClick={() => void submit()} size="sm">
          {submitting ? "Submitting…" : "Submit rating"}
        </Button>
      </div>
    </div>
  );
}

function BookingRow({ request }: { request: LaboratoryRequestResponse }) {
  const booking = activeBooking(request);
  const [openingCheckout, setOpeningCheckout] = useState(false);
  if (!booking) return null;
  const sampleDone = ["SAMPLE_COLLECTED", "PROCESSING", "RESULT_READY", "COMPLETED"].includes(
    booking.status,
  );
  const resultDone = ["RESULT_READY", "COMPLETED"].includes(booking.status);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{request.service.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {booking.laboratory.displayName} ·{" "}
            {booking.scheduledAt ? formatDate(booking.scheduledAt) : "Schedule pending"}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {booking.collectionMode === "HOME" ? (
              <Home className="h-3 w-3" />
            ) : (
              <Building2 className="h-3 w-3" />
            )}
            {booking.collectionMode === "HOME" ? "Home collection" : "Laboratory collection"}
          </p>
          {booking.pricing && (
            <p className="mt-1 text-xs font-medium">
              {formatMinorCurrency(booking.pricing.patientPriceMinor, booking.pricing.currency)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={booking.status.toLowerCase()} size="sm" />
          {booking.paymentId &&
            booking.paymentStatus !== null &&
            CHECKOUT_PAYMENT_STATUSES.has(booking.paymentStatus) && (
              <Button
                size="sm"
                variant="outline"
                disabled={openingCheckout}
                onClick={async () => {
                  const paymentId = booking.paymentId;
                  if (paymentId === null) return;
                  setOpeningCheckout(true);
                  try {
                    const checkout = await schedulingPaymentService.createCheckout(
                      paymentId,
                      crypto.randomUUID(),
                    );
                    window.location.assign(checkout.checkoutUrl);
                  } catch (cause) {
                    toast.error(cause instanceof Error ? cause.message : "Checkout is unavailable");
                    setOpeningCheckout(false);
                  }
                }}
              >
                {openingCheckout ? "Opening…" : "Pay"}
              </Button>
            )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
        <Milestone label="Booked" done />
        <Milestone label="Sample" done={sampleDone} />
        <Milestone label="Result" done={resultDone} />
      </div>
    </div>
  );
}

function Milestone({ done, label }: { done: boolean; label: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-1 rounded-full px-2 py-1 ${done ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}
    >
      {done ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {label}
    </div>
  );
}

function LabBookingSheet({
  onBooked,
  onClose,
  request,
}: {
  onBooked: () => void;
  onClose: () => void;
  request: LaboratoryRequestResponse | null;
}) {
  const [laboratories, setLaboratories] = useState<readonly PublicOrganizationSummary[]>([]);
  const [laboratoryId, setLaboratoryId] = useState("");
  const [collectionMode, setCollectionMode] = useState<"FACILITY" | "HOME">("FACILITY");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [locality, setLocality] = useState("");
  const [administrativeArea, setAdministrativeArea] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [collectionInstructions, setCollectionInstructions] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => nextDays(14), []);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLaboratories([]);
    setLaboratoryId("");
    setCollectionMode("FACILITY");
    setAddressLine1("");
    setAddressLine2("");
    setLocality("");
    setAdministrativeArea("");
    setPostalCode("");
    setCountryCode("");
    setCollectionInstructions("");
    setDate("");
    setTime("");
    setError(null);
    setLoading(true);
    publicDiscoveryService
      .laboratories({ limit: 50, service: request.service.code }, controller.signal)
      .then((response) => setLaboratories(response.data))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : "Compatible laboratories could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request]);

  async function confirm() {
    if (!request || !laboratoryId || !date || !time) return;
    if (
      collectionMode === "HOME" &&
      (!addressLine1.trim() || !locality.trim() || !/^[A-Za-z]{2}$/.test(countryCode.trim()))
    ) {
      setError("Address line 1, city or locality, and a two-letter country code are required.");
      return;
    }
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    setBusy(true);
    setError(null);
    try {
      const bookedRequest = await productionLaboratoryService.patient.book(
        request.id,
        collectionMode === "HOME"
          ? {
              collectionMode,
              expectedVersion: request.version,
              homeCollection: {
                addressLine1: addressLine1.trim(),
                ...(addressLine2.trim() ? { addressLine2: addressLine2.trim() } : {}),
                ...(administrativeArea.trim()
                  ? { administrativeArea: administrativeArea.trim() }
                  : {}),
                ...(collectionInstructions.trim()
                  ? { collectionInstructions: collectionInstructions.trim() }
                  : {}),
                countryCode: countryCode.trim().toUpperCase(),
                locality: locality.trim(),
                ...(postalCode.trim() ? { postalCode: postalCode.trim() } : {}),
              },
              laboratoryOrganizationId: laboratoryId,
              scheduledAt,
            }
          : {
              collectionMode,
              expectedVersion: request.version,
              laboratoryOrganizationId: laboratoryId,
              scheduledAt,
            },
        crypto.randomUUID(),
      );
      const booking = activeBooking(bookedRequest);
      toast.success("Laboratory test booked. Clinical processing is independent of settlement.");
      onBooked();
      if (booking?.paymentId) {
        try {
          const checkout = await schedulingPaymentService.createCheckout(
            booking.paymentId,
            crypto.randomUUID(),
          );
          window.location.assign(checkout.checkoutUrl);
        } catch (checkoutError) {
          toast.error(
            checkoutError instanceof Error
              ? `Booking saved. ${checkoutError.message}`
              : "Booking saved, but checkout is currently unavailable.",
          );
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The booking could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const availableLaboratories =
    collectionMode === "HOME" && request
      ? laboratories.filter((laboratory) =>
          laboratory.homeCollectionServiceCodes.includes(request.service.code),
        )
      : laboratories;
  const selected = availableLaboratories.find((laboratory) => laboratory.id === laboratoryId);
  return (
    <Sheet open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] rounded-t-3xl sm:mx-auto sm:max-w-md sm:rounded-2xl"
      >
        <SheetHeader className="border-b border-border/60 pb-3">
          <SheetTitle className="text-left text-base">Book laboratory test</SheetTitle>
          <p className="text-left text-xs text-muted-foreground">
            {request ? `${request.service.name} · ${request.requestNumber}` : ""}
          </p>
        </SheetHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto py-4">
          <div>
            <Label>Collection method</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-xl border p-3 text-left ${collectionMode === "FACILITY" ? "border-primary bg-primary/5" : "border-border"}`}
                onClick={() => {
                  setCollectionMode("FACILITY");
                  setLaboratoryId("");
                }}
              >
                <Building2 className="mb-2 h-4 w-4" />
                <span className="block text-sm font-medium">At the laboratory</span>
                <span className="text-xs text-muted-foreground">Visit the selected facility</span>
              </button>
              <button
                type="button"
                className={`rounded-xl border p-3 text-left ${collectionMode === "HOME" ? "border-primary bg-primary/5" : "border-border"}`}
                onClick={() => {
                  setCollectionMode("HOME");
                  setLaboratoryId("");
                }}
              >
                <Home className="mb-2 h-4 w-4" />
                <span className="block text-sm font-medium">Home collection</span>
                <span className="text-xs text-muted-foreground">
                  A collector visits your address
                </span>
              </button>
            </div>
          </div>

          <div>
            <Label>Verified laboratory offering this test</Label>
            <Select value={laboratoryId} onValueChange={setLaboratoryId} disabled={loading}>
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue
                  placeholder={loading ? "Finding compatible laboratories…" : "Select a laboratory"}
                />
              </SelectTrigger>
              <SelectContent>
                {availableLaboratories.map((laboratory) => (
                  <SelectItem key={laboratory.id} value={laboratory.id}>
                    {laboratory.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loading && availableLaboratories.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                {collectionMode === "HOME"
                  ? "No verified laboratory currently offers home collection for this exact service."
                  : "No verified laboratory currently offers this exact service."}
              </p>
            )}
          </div>

          {selected?.locations[0] && (
            <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1 font-medium text-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {selected.displayName}
              </p>
              <p className="mt-1 flex items-start gap-1">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                {selected.locations[0].label}
              </p>
            </div>
          )}

          {collectionMode === "HOME" && (
            <div className="space-y-3 rounded-xl border border-border/60 p-3">
              <div>
                <Label htmlFor="home-address-line-1">Address line 1</Label>
                <Input
                  id="home-address-line-1"
                  className="mt-1.5"
                  maxLength={200}
                  value={addressLine1}
                  onChange={(event) => setAddressLine1(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="home-address-line-2">Address line 2 (optional)</Label>
                <Input
                  id="home-address-line-2"
                  className="mt-1.5"
                  maxLength={200}
                  value={addressLine2}
                  onChange={(event) => setAddressLine2(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="home-locality">City or locality</Label>
                  <Input
                    id="home-locality"
                    className="mt-1.5"
                    maxLength={100}
                    value={locality}
                    onChange={(event) => setLocality(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="home-administrative-area">State or region</Label>
                  <Input
                    id="home-administrative-area"
                    className="mt-1.5"
                    maxLength={100}
                    value={administrativeArea}
                    onChange={(event) => setAdministrativeArea(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="home-postal-code">Postal code</Label>
                  <Input
                    id="home-postal-code"
                    className="mt-1.5"
                    maxLength={32}
                    value={postalCode}
                    onChange={(event) => setPostalCode(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="home-country-code">Country code</Label>
                  <Input
                    id="home-country-code"
                    className="mt-1.5 uppercase"
                    maxLength={2}
                    placeholder="NG"
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="home-collection-instructions">Collection instructions</Label>
                <Textarea
                  id="home-collection-instructions"
                  className="mt-1.5"
                  maxLength={1000}
                  placeholder="Access notes or directions for the collector (optional)"
                  value={collectionInstructions}
                  onChange={(event) => setCollectionInstructions(event.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This address is shared only with the selected laboratory for this booking.
              </p>
            </div>
          )}

          <div>
            <Label>Date</Label>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {days.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => setDate(day.value)}
                  className={`rounded-lg border p-2 text-center text-xs ${date === day.value ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <p className="text-[9px] uppercase text-muted-foreground">{day.sub}</p>
                  <p className="font-semibold">{day.label}</p>
                </button>
              ))}
            </div>
          </div>

          {date && (
            <div>
              <Label>Time slot ({timeZone})</Label>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    className={`rounded-lg border px-2 py-1.5 text-xs ${time === slot ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The approved price is copied into this booking and cannot be changed later. After
            booking, you will continue to the secure payment provider. Payment does not alter the
            laboratory's clinical result workflow.
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <SheetFooter className="border-t border-border/60 pt-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                !laboratoryId ||
                !date ||
                !time ||
                (collectionMode === "HOME" &&
                  (!addressLine1.trim() ||
                    !locality.trim() ||
                    !/^[A-Za-z]{2}$/.test(countryCode.trim())))
              }
              onClick={confirm}
              className="flex-1"
            >
              {busy ? "Booking…" : "Confirm booking"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
