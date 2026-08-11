"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { providerService, serviceService, appointmentService } from "@/lib/services";
import type { Provider, Service } from "@/types";
import { PageHeader, EmptyState, LoadingState, SectionCard, BottomActionBar } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  consultationChannelLabel,
  onlineConsultationModes,
  SPECIALIST_COUNTRY,
} from "@/lib/consultation-policy";
import type { OnlineConsultationChannel } from "@/lib/consultation-policy";


const CHANNELS: { id: OnlineConsultationChannel; label: string; icon: React.ComponentType<{ className?: string }>; }[] = [
  { id: "video", label: "Video Call", icon: Video },
  { id: "audio", label: "Voice Call", icon: Phone },
  { id: "chat", label: "Chat", icon: MessageSquare },
];

const STEPS = ["Channel", "Date & Time", "Intake", "Review", "Payment"];

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

  const [channel, setChannel] = useState<OnlineConsultationChannel>("video");
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
    let cancelled = false;
    providerService.list().then((rows) => {
      if (cancelled) return;
      setProviders(rows.filter((p) => p.verificationStatus === "approved"));
      if (providerIdParam) {
        const match = rows.find((p) => p.id === providerIdParam) ?? null;
        setProvider(match);
        if (match) setStep(0); // start at step 0 (channel) since provider preselected
      }
      setLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Failed to load providers");
      setLoading(false);
    });
    serviceService.byCategory("consultation").then(setServices).catch(() => {});
    return () => { cancelled = true; };
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
      setStep(5);
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
    step === 0 ? !!channel :
    step === 1 ? !!date && !!time :
    step === 2 ? !!reason && consent :
    step === 3 ? true :
    step === 4 ? true : false;

  // Confirmation screen — full-page success state
  if (step === 5 && confirmedAppt && provider) {
    return (
      <div className="space-y-6">
        <PageHeader title="Booking confirmed" back />
        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Booking confirmed!</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
              Your {consultationChannelLabel(channel).toLowerCase()} consultation with {fullName(provider)} is confirmed for {date} at {time}.
            </p>
            <p className="text-xs text-muted-foreground mt-2 font-mono">Ref: {confirmedAppt.id}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => navigate("patient", "appointments")}>View appointments</Button>
              <Button onClick={() => navigate("patient", "consultation", { id: confirmedAppt.id })}>
                <Video className="h-4 w-4" /> Go to consultation
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-32 lg:pb-0">
      <PageHeader
        title="Book a consultation"
        description="Complete the steps below to confirm your appointment."
        breadcrumbs={[
          { label: "Find Care", onClick: () => navigate("patient", "services") },
          { label: "Doctors", onClick: () => navigate("patient", "doctors") },
          { label: "Book" },
        ]}
      />

      {/* Provider mini bar */}
      {provider && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 shadow-soft">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials(`${provider.firstName} ${provider.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
              {fullName(provider)}
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-0.5 text-[10px] h-5 px-1">
                <ShieldCheck className="h-3 w-3" /> Verified
              </Badge>
            </p>
            <p className="text-xs text-muted-foreground">{provider.specialty} · {SPECIALIST_COUNTRY}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">From</p>
            <p className="text-sm font-bold text-primary">{formatCurrency(provider.consultationFee)}</p>
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <ol className="flex items-center gap-1.5 min-w-max">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label} className="flex items-center">
                <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                  active ? "bg-primary text-primary-foreground border-primary" :
                  done ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  "bg-card text-muted-foreground border-border"
                }`}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                    active ? "bg-white/20" : done ? "bg-primary text-white" : "bg-muted"
                  }`}>
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span>{label}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Step content */}
      <SectionCard>
        {step === 0 && provider && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Select consultation type</h3>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {CHANNELS.map((c) => {
                const supported = onlineConsultationModes(provider.consultationModes).includes(c.id);
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    disabled={!supported}
                    onClick={() => setChannel(c.id)}
                    className={`rounded-xl border p-4 text-left transition-all tap-highlight-none ${
                      channel === c.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    } ${!supported ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Icon className={`h-5 w-5 mb-2 ${channel === c.id ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="text-sm font-medium">{c.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {step === 1 && provider && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Choose a date</h3>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-5">
              {days.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDate(d.value)}
                  className={`rounded-lg border p-3 text-center transition-all tap-highlight-none ${
                    date === d.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <p className="text-[10px] text-muted-foreground uppercase">{d.sub}</p>
                  <p className="text-sm font-semibold mt-0.5">{d.label}</p>
                </button>
              ))}
            </div>
            {date && (
              <>
                <h3 className="text-sm font-semibold mb-3">Choose a time</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {TIME_SLOTS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTime(t)}
                      className={`rounded-lg border px-3 py-2 text-sm transition-all tap-highlight-none ${
                        time === t ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-primary/30"
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
        {step === 2 && provider && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Pre-consultation intake</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="reason">Reason for consultation *</Label>
                <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Follow-up hypertension review" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="symptoms">Describe your symptoms</Label>
                <Textarea id="symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="When did the symptoms start? How severe?" rows={4} className="mt-1.5" />
              </div>
              <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                <span className="text-sm leading-relaxed">
                  I consent to share my health information (allergies, conditions, medications, recent results) with this provider for the purpose of this consultation. I understand my access can be revoked at any time from the Consent Centre.
                </span>
              </label>
            </div>
          </div>
        )}
        {step === 3 && provider && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Review your booking</h3>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              <ReviewRow label="Doctor" value={fullName(provider)} />
              <ReviewRow label="Specialty" value={provider.specialty} />
              <ReviewRow label="Channel" value={consultationChannelLabel(channel)} />
              <ReviewRow label="Date" value={date} />
              <ReviewRow label="Time" value={time} />
              <ReviewRow label="Patient" value={profile ? `${profile.firstName} ${profile.lastName}` : "—"} />
              <ReviewRow label="Reason" value={reason || "—"} full />
            </div>
            <div className="mt-5 rounded-xl border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Cost summary</p>
              <Line label="Consultation fee" value={formatCurrency(consultationFee)} />
              <Line label="Platform service fee (5%)" value={formatCurrency(serviceFee)} />
              <div className="my-2 border-t border-border/80" />
              <Line label="Total payable" value={formatCurrency(total)} bold />
            </div>
          </div>
        )}
        {step === 4 && provider && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Payment</h3>
            <div className="rounded-xl border bg-muted/30 p-4 mb-5">
              <Line label="Consultation fee" value={formatCurrency(consultationFee)} />
              <Line label="Service fee" value={formatCurrency(serviceFee)} />
              <div className="my-2 border-t border-border/80" />
              <Line label="Total" value={formatCurrency(total)} bold />
            </div>
            <Label className="text-xs text-muted-foreground">Payment method</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button
                onClick={() => setMethod("card")}
                className={`rounded-xl border p-4 text-left transition-all tap-highlight-none ${
                  method === "card" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <CreditCard className={`h-5 w-5 mb-2 ${method === "card" ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm font-medium">Card</p>
                <p className="text-xs text-muted-foreground">Demo — no real charge</p>
              </button>
              <button
                onClick={() => setMethod("bank_transfer")}
                className={`rounded-xl border p-4 text-left transition-all tap-highlight-none ${
                  method === "bank_transfer" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <Building2 className={`h-5 w-5 mb-2 ${method === "bank_transfer" ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm font-medium">Bank transfer</p>
                <p className="text-xs text-muted-foreground">Demo — instant confirm</p>
              </button>
            </div>
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700 flex items-center gap-2">
              <Lock className="h-4 w-4 shrink-0" /> This is a prototype — no real payment will be charged.
            </div>
          </div>
        )}
      </SectionCard>

      {/* Desktop action row */}
      <div className="hidden lg:flex items-center justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? navigate("patient", "doctors") : setStep(step - 1))}>
          <ChevronLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < 4 ? (
          <Button disabled={!canProceed} onClick={() => setStep(step + 1)}>
            Continue <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button disabled={submitting} onClick={confirmAndPay}>
            {submitting ? "Processing…" : `Pay ${formatCurrency(total)}`}
          </Button>
        )}
      </div>

      {/* Mobile bottom action bar */}
      <BottomActionBar>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => (step === 0 ? navigate("patient", "doctors") : setStep(step - 1))} aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            {step >= 4 ? (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight">Total payable</p>
                <p className="text-base font-bold text-primary leading-tight">{formatCurrency(total)}</p>
              </>
            ) : (
              <p className="text-sm font-medium leading-tight">Step {step + 1} of {STEPS.length}</p>
            )}
          </div>
          {step < 4 ? (
            <Button disabled={!canProceed} onClick={() => setStep(step + 1)}>
              Continue <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button disabled={submitting} onClick={confirmAndPay}>
              {submitting ? "Processing…" : `Pay`}
            </Button>
          )}
        </div>
      </BottomActionBar>
    </div>
  );
}

function ReviewRow({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium capitalize mt-0.5">{value}</p>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-bold text-base" : "font-medium"}>{value}</span>
    </div>
  );
}
