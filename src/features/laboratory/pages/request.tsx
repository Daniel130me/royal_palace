"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate, useNav } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { labRequestService, serviceService } from "@/lib/services";
import type { LaboratoryRequest, Service } from "@/types";
import {
  PageHeader, SectionCard, BottomActionBar, EmptyState, ErrorState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency, formatDate, formatTime, nextLabStatuses, age, fullName, initials } from "@/lib/format";
import {
  FlaskConical, CalendarClock, Stethoscope, FileText, Beaker,
  ClipboardList, FileCheck2, Home, MapPin, Calendar, Clock, ArrowRight, Lock, ShieldCheck,
} from "lucide-react";

interface BookingFormValues {
  date: string;
  time: string;
  collectionMode: "facility" | "home";
  homeAddress: string;
  price: number;
  serviceId: string;
}

const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "13:00", "14:00", "15:00", "16:00",
];

const WORKFLOW_LABELS: Record<string, string> = {
  booked: "Mark sample collected",
  sample_collected: "Start processing",
  processing: "Move to quality review",
  quality_review: "Mark completed",
  completed: "Completed",
};

function humanise(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LabRequestDetail() {
  const { view } = useNav();
  const { labId, reload } = useLabContext();
  const requestId = view.params.id;
  const [request, setRequest] = useState<LaboratoryRequest | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [progressing, setProgressing] = useState(false);

  const load = () => {
    if (!requestId) {
      setError("No request id supplied.");
      setLoading(false);
      return;
    }
    setLoading(true);
    labRequestService
      .get(requestId)
      .then((r) => { setRequest(r); setError(null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load request."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [requestId]);

  useEffect(() => {
    serviceService
      .byCategory("laboratory")
      .then(setServices)
      .catch(() => setServices([]));
  }, []);

  const booking = request?.booking ?? null;
  const nextStatuses = useMemo(() => (booking ? nextLabStatuses(booking.status) : []), [booking]);

  const handleProgress = (next: string) => {
    if (!booking) return;
    setProgressing(true);
    labRequestService
      .progress(booking.id, next, labId ?? "")
      .then(() => {
        toast.success(`Booking advanced to ${humanise(next)}.`);
        load();
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update booking."))
      .finally(() => setProgressing(false));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-56 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 bg-muted/40 animate-pulse rounded-2xl" />
          <div className="h-64 bg-muted/40 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!request) return <ErrorState message="Request not found." />;

  const patient = request.patient;
  const provider = request.provider;
  const isPending = request.status === "pending_booking";
  const isBookedByThisLab = booking && booking.laboratoryId === labId;
  const uploadable = booking && (booking.status === "quality_review" || booking.status === "completed") && !request.result;

  return (
    <div className="pb-28 lg:pb-0 space-y-6">
      <PageHeader
        title={`Request ${request.requestNumber}`}
        description={`${request.tests.length} test(s) · ${request.priority} priority`}
        back
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Tests + clinical indication — primary focus */}
          <SectionCard title="Tests requested" icon={FlaskConical}>
            <div className="flex flex-wrap gap-2 mb-4">
              {request.tests.map((t) => (
                <Badge key={t} variant="secondary" className="text-sm">{t}</Badge>
              ))}
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> Clinical indication
              </p>
              <p className="text-sm leading-relaxed">{request.clinicalIndication ?? "—"}</p>
            </div>
            {request.sampleType && (
              <div className="mt-3 flex items-start gap-2 text-sm">
                <Beaker className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Sample type</p>
                  <p>{request.sampleType}</p>
                </div>
              </div>
            )}
            {request.preparationInstructions && (
              <div className="mt-2 flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Preparation instructions</p>
                  <p className="leading-relaxed">{request.preparationInstructions}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm mt-3">
              <span className="text-muted-foreground">Fasting required:</span>
              <StatusBadge status={request.fastingRequired ? "active" : "draft"} size="sm" />
            </div>
            {request.notes && (
              <div className="mt-2 flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Notes</p>
                  <p className="leading-relaxed">{request.notes}</p>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Patient — only identity fields per consent policy */}
          {patient && (
            <SectionCard title="Patient" icon={Stethoscope}>
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {initials(fullName(patient))}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{fullName(patient)}</p>
                  <p className="text-xs text-muted-foreground">{patient.patientNumber}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <InfoRow label="Age" value={patient.dateOfBirth ? `${age(patient.dateOfBirth)} years` : "—"} />
                <InfoRow label="Gender" value={patient.gender} />
                <InfoRow label="Phone" value={patient.phone} />
                <InfoRow label="Location" value={`${patient.city}, ${patient.state}`} />
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
                <Lock className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span>
                  Per consent policy, the laboratory sees only identity + clinical indication necessary for testing — full medical history is withheld.
                </span>
              </div>
            </SectionCard>
          )}

          {/* Referring provider */}
          {provider && (
            <SectionCard title="Referring provider" icon={Stethoscope}>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <InfoRow label="Name" value={`${provider.title} ${provider.firstName} ${provider.lastName}`} />
                <InfoRow label="Specialty" value={provider.specialty} />
                <InfoRow label="Provider number" value={provider.providerNumber} />
                <InfoRow label="Location" value={`${provider.city}, ${provider.state}`} />
              </dl>
            </SectionCard>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard title="Status">
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Request</dt>
                <StatusBadge status={request.status} size="sm" />
              </div>
              {booking && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Booking</dt>
                  <StatusBadge status={booking.status} size="sm" />
                </div>
              )}
              {booking?.laboratory && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Laboratory</dt>
                  <dd className="text-sm font-medium truncate">{booking.laboratory.name}</dd>
                </div>
              )}
            </dl>
          </SectionCard>

          {isPending && (
            <SectionCard title="Accept this request" icon={CalendarClock} className="border-primary/30 bg-primary/5">
              <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                Accept and book a slot for this patient. You will collect the sample and process the test.
              </p>
              <Button className="w-full" onClick={() => setBookingOpen(true)}>
                <CalendarClock className="h-4 w-4" /> Accept &amp; Book
              </Button>
            </SectionCard>
          )}

          {isBookedByThisLab && booking && (
            <SectionCard title="Booking details">
              <dl className="space-y-2.5 text-sm">
                <DetailRow icon={Calendar} label="Date" value={formatDate(booking.date)} />
                <DetailRow icon={Clock} label="Time" value={formatTime(booking.time)} />
                <DetailRow icon={Home} label="Collection" value={booking.collectionMode === "home" ? "Home collection" : "Facility"} />
                {booking.collectionMode === "home" && booking.homeAddress && (
                  <DetailRow icon={MapPin} label="Address" value={booking.homeAddress} />
                )}
                <DetailRow icon={FileText} label="Price" value={formatCurrency(booking.price)} />
              </dl>
              <Separator className="my-4" />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Workflow</p>
                {nextStatuses.length > 0 && (
                  <div className="space-y-2">
                    {nextStatuses.map((s) => (
                      <Button key={s} className="w-full justify-between" disabled={progressing} onClick={() => handleProgress(s)}>
                        <span className="flex items-center gap-1.5">
                          <ArrowRight className="h-3.5 w-3.5" />
                          {WORKFLOW_LABELS[s] ?? humanise(s)}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    ))}
                  </div>
                )}
                {uploadable && (
                  <Button className="w-full" onClick={() => navigate("laboratory", "result-new", { bookingId: booking.id, requestId: booking.requestId })}>
                    <FileCheck2 className="h-4 w-4" /> Upload result
                  </Button>
                )}
                {(booking.status === "result_published" || (nextStatuses.length === 0 && !uploadable)) && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-center">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
                    <p className="text-xs font-medium text-emerald-700">Workflow complete</p>
                    <p className="text-xs text-emerald-700/80 mt-0.5">No further action required.</p>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {request.result && (
            <SectionCard title="Result published" icon={FileCheck2}>
              <dl className="space-y-2.5 text-sm">
                <InfoRow label="Test" value={request.result.test} />
                <InfoRow label="Value" value={`${request.result.value} ${request.result.unit ?? ""}`} />
                {request.result.abnormalIndicator && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Indicator</span>
                    <StatusBadge status={request.result.abnormalIndicator} size="sm" />
                  </div>
                )}
                <InfoRow label="Reported" value={formatDate(request.result.resultDate)} />
              </dl>
              <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => navigate("laboratory", "results")}>
                View all results
              </Button>
            </SectionCard>
          )}

          {booking && !isBookedByThisLab && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-700">
                This request is already booked by another laboratory.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom action bar for accept */}
      {isPending && (
        <BottomActionBar>
          <Button className="w-full" onClick={() => setBookingOpen(true)}>
            <CalendarClock className="h-4 w-4" /> Accept &amp; Book
          </Button>
        </BottomActionBar>
      )}

      <BookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        services={services}
        defaultPrice={services[0]?.prices?.[0]?.patientPrice ?? 5000}
        onSubmit={async (values) => {
          if (!labId) {
            toast.error("Laboratory profile not loaded.");
            return;
          }
          try {
            await labRequestService.book({
              requestId: request.id,
              laboratoryId: labId,
              collectionMode: values.collectionMode,
              homeAddress: values.collectionMode === "home" ? values.homeAddress : null,
              date: values.date,
              time: values.time,
              price: values.price,
              actorId: labId,
            });
            toast.success("Request accepted — booking created.");
            setBookingOpen(false);
            load();
            reload();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to create booking.");
          }
        }}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  defaultPrice: number;
  onSubmit: (values: BookingFormValues) => void | Promise<void>;
}

function BookingDialog({ open, onOpenChange, services, defaultPrice, onSubmit }: BookingDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("08:00");
  const [collectionMode, setCollectionMode] = useState<"facility" | "home">("facility");
  const [homeAddress, setHomeAddress] = useState("");
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [price, setPrice] = useState<number>(defaultPrice);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (services.length > 0 && !serviceId) {
      const first = services[0];
      setServiceId(first.id);
      setPrice(first.prices?.[0]?.patientPrice ?? defaultPrice);
    }
  }, [services, serviceId, defaultPrice]);

  const onServiceChange = (id: string) => {
    const svc = services.find((s) => s.id === id);
    setServiceId(id);
    if (svc?.prices?.[0]?.patientPrice) setPrice(svc.prices[0].patientPrice);
  };

  const submit = async () => {
    if (!date || !time) {
      toast.error("Please choose a date and time.");
      return;
    }
    if (collectionMode === "home" && !homeAddress.trim()) {
      toast.error("Home collection requires an address.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ date, time, collectionMode, homeAddress, price, serviceId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Accept &amp; Book request</DialogTitle>
          <DialogDescription>
            Create a booking at your lab. The patient will be notified with the appointment time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bk-date">Sample collection date</Label>
              <Input id="bk-date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-time">Time slot</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger id="bk-time" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Collection mode</Label>
            <Select value={collectionMode} onValueChange={(v) => setCollectionMode(v as "facility" | "home")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="facility">Facility — patient visits lab</SelectItem>
                <SelectItem value="home">Home collection — sample pickup</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {collectionMode === "home" && (
            <div className="space-y-1.5">
              <Label htmlFor="bk-addr">Home address</Label>
              <Textarea
                id="bk-addr"
                placeholder="House number, street, area, city"
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Pricing reference</Label>
            <Select value={serviceId} onValueChange={onServiceChange}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Pick a lab service" /></SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {formatCurrency(s.prices?.[0]?.patientPrice ?? 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Platform prices are set centrally by Royal Palace.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bk-price">Booking price (₦)</Label>
            <Input
              id="bk-price"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button disabled={submitting} onClick={submit}>
            Confirm booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
