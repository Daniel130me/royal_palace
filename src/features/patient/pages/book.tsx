"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { providerService, serviceService, appointmentService } from "@/lib/services";
import type { Provider, Service } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Check, ChevronLeft, ChevronRight, Video, Phone, MessageSquare, Building2,
  Calendar as CalendarIcon, Clock, CreditCard, ShieldCheck, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, fullName, initials } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

type Channel = "video" | "audio" | "in_person" | "chat";
const CHANNELS: { id: Channel; label: string; icon: React.ComponentType<{ className?: string }>; }[] = [
  { id: "video", label: "Video Call", icon: Video },
  { id: "audio", label: "Audio Call", icon: Phone },
  { id: "in_person", label: "In-person Visit", icon: Building2 },
  { id: "chat", label: "Chat", icon: MessageSquare },
];

const STEPS = ["Doctor", "Channel", "Date & Time", "Intake", "Review", "Payment", "Confirmed"];

function nextDays(count: number): { value: string; label: string; sub: string }[] {
  const out: { value: string; label: string; sub: string }[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const value = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const sub = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" });
    out.push({ value, label, sub });
  }
  return out;
}

const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];

export function PatientBook() {
  const { view } = useNav();
  const providerIdParam = view.params?.providerId;
  const { profile } = usePatientContext();

  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(!!providerIdParam);
  const [error, setError] = useState<string | null>(null);

  const [channel, setChannel] = useState<Channel>("video");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [reason, setReason] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [consent, setConsent] = useState(false);
  const [method, setMethod] = useState<"card" | "bank_transfer">("card");
  const [submitting, setSubmitting] = useState(false);
  const [confirmedAppt, setConfirmedAppt] = useState<{ id: string; paymentId?: string } | null>(null);

  const days = useMemo(() => nextDays(14), []);

  useEffect(() => {
    providerService.list().then((rows) => {
      setProviders(rows.filter((p) => p.verificationStatus === "approved"));
      if (providerIdParam) {
        const match = rows.find((p) => p.id === providerIdParam) ?? null;
        setProvider(match);
        if (match) setStep(1); // skip doctor picker if preselected
      }
      setLoading(false);
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to load providers");
      setLoading(false);
    });
    serviceService.byCategory("consultation").then(setServices).catch(() => {});
  }, [providerIdParam]);

  const consultationFee = provider?.consultationFee ?? 0;
  const serviceFee = Math.round(consultationFee * 0.05);
  const total = consultationFee + serviceFee;

  async function confirmAndPay() {
    if (!provider || !profile) {
      toast.error("Missing provider or patient.");
      return;
    }
    setSubmitting(true);
    try {
      const matchingService = services.find((s) =>
        s.name.toLowerCase().includes(provider.specialty.toLowerCase().split(" ")[0])
      ) ?? services[0];
      const res = await appointmentService.book({
        patientId: profile.id,
        providerId: provider.id,
        serviceId: matchingService?.id,
        date,
        time,
        consultationChannel: channel,
        price: total,
        method,
        intakeForm: { reason, symptoms, consent, channel },
      });
      setConfirmedAppt({ id: res.id, paymentId: res.payment?.id });
      setStep(6);
      toast.success("Booking confirmed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Preparing booking…" />;
  if (error) return <EmptyState title="Could not start booking" description={error} />;

  const canProceed =
    step === 0 ? !!provider :
    step === 1 ? !!channel :
    step === 2 ? !!date && !!time :
    step === 3 ? !!reason && consent :
    step === 4 ? true :
    step === 5 ? true : false;

  return (
    <div>
      <PageHeader
        title="Book a consultation"
        description="Complete the steps below to confirm your appointment."
        breadcrumbs={[
          { label: "Find Care", onClick: () => navigate("patient", "services") },
          { label: "Doctors", onClick: () => navigate("patient", "doctors") },
          { label: "Book" },
        ]}
      />

      {/* Stepper */}
      <div className="mb-6 overflow-x-auto">
        <ol className="flex items-center gap-1 min-w-max">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label} className="flex items-center">
                <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border ${
                  active ? "bg-emerald-600 text-white border-emerald-600" :
                  done ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  "bg-background text-muted-foreground border-border"
                }`}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                    active ? "bg-white/20" : done ? "bg-emerald-600 text-white" : "bg-muted"
                  }`}>
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span>{label}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />}
              </li>
            );
          })}
        </ol>
      </div>

      <Card className="mb-4">
        <CardContent className="p-5">
          {step === 0 && (
            <DoctorPicker
              providers={providers}
              selected={provider}
              onSelect={(p) => { setProvider(p); setStep(1); }}
            />
          )}
          {step === 1 && provider && (
            <div>
              <ProviderMini provider={provider} />
              <h3 className="text-base font-semibold mt-4 mb-3">Select consultation type</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {CHANNELS.map((c) => {
                  const supported = (provider.consultationModes ?? []).includes(c.id);
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.id}
                      disabled={!supported}
                      onClick={() => setChannel(c.id)}
                      className={`rounded-lg border p-4 text-left transition-all ${
                        channel === c.id ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-emerald-300"
                      } ${!supported ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <Icon className="h-5 w-5 mb-2" />
                      <p className="text-sm font-medium">{c.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {step === 2 && provider && (
            <div>
              <ProviderMini provider={provider} />
              <h3 className="text-base font-semibold mt-4 mb-3">Choose a date</h3>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-4">
                {days.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDate(d.value)}
                    className={`rounded-lg border p-3 text-center transition-all ${
                      date === d.value ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-emerald-300"
                    }`}
                  >
                    <p className="text-[10px] text-muted-foreground uppercase">{d.sub}</p>
                    <p className="text-sm font-semibold mt-0.5">{d.label}</p>
                  </button>
                ))}
              </div>
              {date && (
                <>
                  <h3 className="text-base font-semibold mb-3">Choose a time</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {TIME_SLOTS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTime(t)}
                        className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                          time === t ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-medium" : "border-border hover:border-emerald-300"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {step === 3 && provider && (
            <div>
              <ProviderMini provider={provider} />
              <h3 className="text-base font-semibold mt-4 mb-3">Pre-consultation intake</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="reason">Reason for consultation *</Label>
                  <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Follow-up hypertension review" />
                </div>
                <div>
                  <Label htmlFor="symptoms">Describe your symptoms</Label>
                  <Textarea id="symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="When did the symptoms start? How severe?" rows={4} />
                </div>
                <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30">
                  <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                  <span className="text-sm">
                    I consent to share my health information (allergies, conditions, medications, recent results) with this provider for the purpose of this consultation. I understand my access can be revoked at any time from the Consent Centre.
                  </span>
                </label>
              </div>
            </div>
          )}
          {step === 4 && provider && (
            <div>
              <h3 className="text-base font-semibold mb-3">Review your booking</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <ReviewRow label="Doctor" value={fullName(provider)} />
                <ReviewRow label="Specialty" value={provider.specialty} />
                <ReviewRow label="Channel" value={channel.replace("_", " ")} />
                <ReviewRow label="Date" value={date} />
                <ReviewRow label="Time" value={time} />
                <ReviewRow label="Patient" value={profile ? `${profile.firstName} ${profile.lastName}` : "—"} />
                <ReviewRow label="Reason" value={reason || "—"} full />
              </div>
              <div className="mt-4 rounded-lg border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">Cost summary</p>
                <Line label="Consultation fee" value={formatCurrency(consultationFee)} />
                <Line label="Platform service fee (5%)" value={formatCurrency(serviceFee)} />
                <div className="my-2 border-t" />
                <Line label="Total payable" value={formatCurrency(total)} bold />
              </div>
            </div>
          )}
          {step === 5 && provider && (
            <div>
              <h3 className="text-base font-semibold mb-3">Payment</h3>
              <div className="rounded-lg border p-3 bg-muted/30 mb-4">
                <Line label="Consultation fee" value={formatCurrency(consultationFee)} />
                <Line label="Service fee" value={formatCurrency(serviceFee)} />
                <div className="my-2 border-t" />
                <Line label="Total" value={formatCurrency(total)} bold />
              </div>
              <Label className="text-xs text-muted-foreground">Payment method</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  onClick={() => setMethod("card")}
                  className={`rounded-lg border p-4 text-left transition-all ${
                    method === "card" ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-emerald-300"
                  }`}
                >
                  <CreditCard className="h-5 w-5 mb-2" />
                  <p className="text-sm font-medium">Card</p>
                  <p className="text-xs text-muted-foreground">Demo — no real charge</p>
                </button>
                <button
                  onClick={() => setMethod("bank_transfer")}
                  className={`rounded-lg border p-4 text-left transition-all ${
                    method === "bank_transfer" ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-emerald-300"
                  }`}
                >
                  <Building2 className="h-5 w-5 mb-2" />
                  <p className="text-sm font-medium">Bank transfer</p>
                  <p className="text-xs text-muted-foreground">Demo — instant confirm</p>
                </button>
              </div>
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700 flex items-center gap-2">
                <Lock className="h-4 w-4" /> This is a prototype — no real payment will be charged.
              </div>
            </div>
          )}
          {step === 6 && confirmedAppt && provider && (
            <div className="text-center py-6">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold">Booking confirmed!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your {channel.replace("_", " ")} consultation with {fullName(provider)} is confirmed for {date} at {time}.
              </p>
              <p className="text-xs text-muted-foreground mt-1">Appointment reference: {confirmedAppt.id}</p>
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="outline" onClick={() => navigate("patient", "appointments")}>View appointments</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("patient", "consultation", { id: confirmedAppt.id })}>
                  Go to consultation
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {step < 6 && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => (step === 0 ? navigate("patient", "doctors") : setStep(step - 1))}>
            <ChevronLeft className="h-4 w-4 mr-1" /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 5 ? (
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!canProceed} onClick={() => setStep(step + 1)}>
              Continue <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting} onClick={confirmAndPay}>
              {submitting ? "Processing…" : `Pay ${formatCurrency(total)}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function DoctorPicker({ providers, selected, onSelect }: { providers: Provider[]; selected: Provider | null; onSelect: (p: Provider) => void }) {
  if (providers.length === 0) return <EmptyState title="No bookable doctors" description="Try again later." />;
  return (
    <div>
      <h3 className="text-base font-semibold mb-3">Select a doctor</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={`rounded-lg border p-3 text-left transition-all ${
              selected?.id === p.id ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-emerald-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  {initials(`${p.firstName} ${p.lastName}`)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium">{fullName(p)}</p>
                <p className="text-xs text-muted-foreground">{p.specialty} · {p.city}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">From</p>
                <p className="text-sm font-semibold text-emerald-700">{formatCurrency(p.consultationFee)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProviderMini({ provider: p }: { provider: Provider }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
          {initials(`${p.firstName} ${p.lastName}`)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium flex items-center gap-1">
          {fullName(p)}
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-[10px]">
            <ShieldCheck className="h-3 w-3" /> Verified
          </Badge>
        </p>
        <p className="text-xs text-muted-foreground">{p.specialty} · {p.city}</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium capitalize">{value}</p>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
