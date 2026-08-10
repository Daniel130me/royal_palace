"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate, useNav } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { labRequestService, serviceService } from "@/lib/services";
import type { LaboratoryRequest, Service } from "@/types";
import { PageHeader } from "@/components/healthcare/page-header";
import { EmptyState, LoadingState, ErrorState } from "@/components/healthcare/states";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCurrency, formatDate, formatTime, nextLabStatuses, age } from "@/lib/format";
import {
  ArrowLeft, FlaskConical, CalendarClock, User, Stethoscope, FileText, Beaker,
  ClipboardList, FileCheck2, Home, MapPin, Calendar, Clock, Microscope, ArrowRight,
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
      .then((r) => {
        setRequest(r);
        setError(null);
      })
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
  const nextStatuses = useMemo(
    () => (booking ? nextLabStatuses(booking.status) : []),
    [booking]
  );

  const handleProgress = (next: string) => {
    if (!booking) return;
    setProgressing(true);
    labRequestService
      .progress(booking.id, next, labId ?? "")
      .then(() => {
        toast.success(`Booking advanced to ${next.replace(/_/g, " ")}.`);
        load();
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Failed to update booking.");
      })
      .finally(() => setProgressing(false));
  };

  if (loading) return <LoadingState label="Loading laboratory request…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!request) return <ErrorState message="Request not found." />;

  const patient = request.patient;
  const provider = request.provider;
  const isPending = request.status === "pending_booking";
  const isBookedByThisLab = booking && booking.laboratoryId === labId;

  return (
    <div>
      <PageHeader
        title={`Request ${request.requestNumber}`}
        description={`${request.tests.length} test(s) · ${request.priority} priority`}
        breadcrumbs={[
          { label: "Laboratory", onClick: () => navigate("laboratory", "dashboard") },
          { label: "Requests", onClick: () => navigate("laboratory", "requests") },
          { label: request.requestNumber },
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("laboratory", "requests")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Tests + clinical info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><FlaskConical className="h-4 w-4" /> Tests requested</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {request.tests.map((t) => (
                  <Badge key={t} variant="secondary" className="text-sm">{t}</Badge>
                ))}
              </div>
              <Detail icon={ClipboardList} label="Clinical indication" value={request.clinicalIndication} />
              <Detail icon={Beaker} label="Sample type" value={request.sampleType} />
              <Detail icon={ClipboardList} label="Preparation instructions" value={request.preparationInstructions} />
              <div className="flex items-center gap-2 text-sm mt-3">
                <span className="text-muted-foreground">Fasting required:</span>
                <StatusBadge status={request.fastingRequired ? "active" : "draft"} />
              </div>
              {request.notes && <Detail icon={FileText} label="Notes" value={request.notes} />}
            </CardContent>
          </Card>

          {/* Patient identity */}
          {patient && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-1.5"><User className="h-4 w-4" /> Patient</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Name" value={`${patient.firstName} ${patient.lastName}`} />
                  <InfoRow label="Patient number" value={patient.patientNumber} />
                  <InfoRow label="Age" value={patient.dateOfBirth ? `${age(patient.dateOfBirth)} years` : "—"} />
                  <InfoRow label="Gender" value={patient.gender} />
                  <InfoRow label="Phone" value={patient.phone} />
                  <InfoRow label="Location" value={`${patient.city}, ${patient.state}`} />
                </div>
                <p className="mt-4 text-xs text-muted-foreground bg-muted/40 rounded-md p-2">
                  Note: Per consent policy, the laboratory only sees identity + clinical indication necessary for testing. Diagnoses and full medical history are not shared.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Referring provider */}
          {provider && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-1.5"><Stethoscope className="h-4 w-4" /> Referring provider</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Name" value={`${provider.title} ${provider.firstName} ${provider.lastName}`} />
                  <InfoRow label="Specialty" value={provider.specialty} />
                  <InfoRow label="Provider number" value={provider.providerNumber} />
                  <InfoRow label="Location" value={`${provider.city}, ${provider.state}`} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — actions / status */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Request</span>
                <StatusBadge status={request.status} />
              </div>
              {booking && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Booking</span>
                  <StatusBadge status={booking.status} />
                </div>
              )}
              {booking?.laboratory && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Laboratory</span>
                  <span className="text-sm font-medium">{booking.laboratory.name}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action card */}
          {isPending && (
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Accept this request</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Accept and book a slot for this patient. You will collect the sample and process the test.
                </p>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setBookingOpen(true)}>
                  <CalendarClock className="h-4 w-4 mr-1" /> Accept &amp; Book
                </Button>
              </CardContent>
            </Card>
          )}

          {isBookedByThisLab && booking && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Booking details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <DetailRow icon={Calendar} label="Date" value={formatDate(booking.date)} />
                <DetailRow icon={Clock} label="Time" value={formatTime(booking.time)} />
                <DetailRow
                  icon={Home}
                  label="Collection"
                  value={booking.collectionMode === "home" ? "Home collection" : "Facility"}
                />
                {booking.collectionMode === "home" && booking.homeAddress && (
                  <DetailRow icon={MapPin} label="Address" value={booking.homeAddress} />
                )}
                <DetailRow icon={FileText} label="Price" value={formatCurrency(booking.price)} />
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Workflow</p>
                  {nextStatuses.length > 0 && (
                    <div className="space-y-2">
                      {nextStatuses.map((s) => (
                        <Button
                          key={s}
                          className="w-full bg-emerald-600 hover:bg-emerald-700"
                          disabled={progressing}
                          onClick={() => handleProgress(s)}
                        >
                          {humanise(s)}
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      ))}
                    </div>
                  )}
                  {booking.status === "quality_review" && (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => navigate("laboratory", "result-new", {
                        bookingId: booking.id,
                        requestId: booking.requestId,
                      })}
                    >
                      <FileCheck2 className="h-4 w-4 mr-1" /> Upload result
                    </Button>
                  )}
                  {booking.status === "completed" && (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => navigate("laboratory", "result-new", {
                        bookingId: booking.id,
                        requestId: booking.requestId,
                      })}
                    >
                      <FileCheck2 className="h-4 w-4 mr-1" /> Upload result
                    </Button>
                  )}
                  {(booking.status === "result_published" || nextStatuses.length === 0) && booking.status !== "quality_review" && booking.status !== "completed" && (
                    <p className="text-xs text-muted-foreground">
                      No further workflow action required for this booking.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {request.result && (
            <Card className="border-emerald-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-1.5"><FileCheck2 className="h-4 w-4" /> Result published</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <InfoRow label="Test" value={request.result.test} />
                <InfoRow label="Value" value={`${request.result.value} ${request.result.unit ?? ""}`} />
                {request.result.abnormalIndicator && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Indicator</span>
                    <StatusBadge status={request.result.abnormalIndicator} />
                  </div>
                )}
                <InfoRow label="Reported" value={formatDate(request.result.resultDate)} />
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate("laboratory", "results")}>
                  View all results
                </Button>
              </CardContent>
            </Card>
          )}

          {booking && !isBookedByThisLab && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="p-4">
                <p className="text-sm text-amber-700">
                  This request is already booked by another laboratory.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Booking dialog */}
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

function humanise(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Detail({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm mt-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
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
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting} onClick={submit}>
            <Microscope className="h-4 w-4 mr-1" /> Confirm booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
