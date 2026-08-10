"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { appointmentService, encounterService } from "@/lib/services";
import type { Appointment, ClinicalEncounter, Provider } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Video, Mic, MicOff, VideoOff, MessageSquare, Paperclip, PhoneOff,
  Signal, Wifi, ShieldCheck, AlertTriangle, ChevronLeft, Clock,
} from "lucide-react";
import { formatCurrency, formatDate, formatTime, fullName, initials } from "@/lib/format";
import { toast } from "sonner";

// SIMULATED virtual consultation. No real WebRTC — this UI is isolated so a
// real provider (e.g. LiveKit, Daily.co, Twilio Video) can replace the
// simulated media area later without touching the surrounding flow.
export function PatientConsultation() {
  const { view } = useNav();
  const apptId = view.params?.id;
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [encounter, setEncounter] = useState<ClinicalEncounter | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"waiting" | "live" | "ended">("waiting");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [endOpen, setEndOpen] = useState(false);

  useEffect(() => {
    if (!apptId) { setLoading(false); return; }
    appointmentService.get(apptId).then(async (a) => {
      setAppt(a);
      setProvider(a.provider ?? null);
      try { setEncounter(await encounterService.byAppointment(a.id)); } catch { /* no encounter yet */ }
    }).finally(() => setLoading(false));
  }, [apptId]);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  if (loading) return <LoadingState label="Preparing consultation…" />;
  if (!appt) return (
    <EmptyState
      title="Consultation not found"
      description="The appointment could not be loaded."
      action={<Button onClick={() => navigate("patient", "appointments")}>Back to appointments</Button>}
    />
  );

  // WAITING ROOM
  if (phase === "waiting") {
    return (
      <div>
        <PageHeader
          title="Virtual consultation — Waiting room"
          description="Your doctor will join shortly. Please keep this page open."
          breadcrumbs={[{ label: "Appointments", onClick: () => navigate("patient", "appointments") }, { label: "Consultation" }]}
        />
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center gap-2 text-amber-700 text-sm">
            <AlertTriangle className="h-4 w-4" />
            Simulated environment — no real video/audio connection is established. This prototype is wired so a real WebRTC provider can be dropped in later.
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-emerald-100 text-emerald-700 text-lg font-semibold">
                    {provider ? initials(`${provider.firstName} ${provider.lastName}`) : "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-semibold">{provider ? fullName(provider) : "Doctor"}</p>
                  <p className="text-sm text-muted-foreground">{provider?.specialty}</p>
                  <p className="text-xs text-muted-foreground">{provider?.professionalTitle}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                      <ShieldCheck className="h-3 w-3" /> Verified
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" /> {formatDate(appt.date)} · {formatTime(appt.time)}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <DeviceCheck label="Camera" ok={camOn} onToggle={() => setCamOn((v) => !v)} icon={camOn ? Video : VideoOff} />
                <DeviceCheck label="Microphone" ok={micOn} onToggle={() => setMicOn((v) => !v)} icon={micOn ? Mic : MicOff} />
                <DeviceCheck label="Network" ok={true} icon={Wifi} sub="Excellent · 24 ms" />
              </div>

              <div className="mt-6 rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
                <p className="font-medium">Appointment summary</p>
                <p className="text-muted-foreground">Channel: <span className="capitalize">{appt.consultationChannel.replace("_", " ")}</span></p>
                <p className="text-muted-foreground">Duration: {appt.durationMinutes} minutes</p>
                <p className="text-muted-foreground">Fee: {formatCurrency(appt.price)} (paid)</p>
                <p className="text-muted-foreground">Reason: {(appt.intakeForm?.reason as string) || "—"}</p>
              </div>

              <Button className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700" size="lg" onClick={() => { setPhase("live"); setSeconds(0); toast.success("Consultation started"); }}>
                <Video className="h-4 w-4 mr-2" /> Join consultation
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-semibold mb-2">While you wait</p>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>Test your camera and microphone.</li>
                <li>Have your medication list ready.</li>
                <li>Find a quiet, private space.</li>
                <li>Prepare any questions for the doctor.</li>
              </ul>
              <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => navigate("patient", "appointment", { id: appt.id })}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back to appointment
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ENDED
  if (phase === "ended") {
    return (
      <div>
        <PageHeader
          title="Consultation ended"
          description="Thank you for using Royal Palace Health Care."
          breadcrumbs={[{ label: "Appointments", onClick: () => navigate("patient", "appointments") }, { label: "Consultation" }]}
        />
        <Card>
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <PhoneOff className="h-7 w-7" />
            </div>
            <p className="font-semibold">Duration: {formatDuration(seconds)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {encounter ? "Your clinical encounter summary will be available in Health Records shortly."
                        : "Your provider is finalising the encounter notes. Check back shortly."}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => navigate("patient", "appointment", { id: appt.id })}>View appointment</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("patient", "records")}>View records</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LIVE
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setPhase("waiting")}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Leave
        </Button>
        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" /> LIVE · {mm}:{ss}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Signal className="h-3 w-3 text-emerald-600" /> Excellent
        </Badge>
      </div>

      <Card className="mb-3 border-amber-200 bg-amber-50">
        <CardContent className="p-2 text-xs text-amber-700 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> Simulated consultation — no real media is exchanged.
        </CardContent>
      </Card>

      <div className="relative rounded-xl overflow-hidden border bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 aspect-video">
        {/* Simulated doctor video */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white">
            <Avatar className="h-20 w-20 mx-auto mb-2 border-2 border-white/30">
              <AvatarFallback className="bg-white/10 text-white text-2xl font-semibold">
                {provider ? initials(`${provider.firstName} ${provider.lastName}`) : "?"}
              </AvatarFallback>
            </Avatar>
            <p className="font-semibold text-lg">{provider ? fullName(provider) : "Doctor"}</p>
            <p className="text-sm text-white/70">{provider?.specialty}</p>
            <p className="text-xs text-white/50 mt-1">Camera simulated · Audio connected</p>
          </div>
        </div>

        {/* Self PIP */}
        <div className="absolute bottom-3 right-3 h-24 w-32 sm:h-32 sm:w-44 rounded-lg border-2 border-white/20 bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center">
          {camOn ? (
            <div className="text-center text-white/80">
              <Video className="h-5 w-5 mx-auto" />
              <p className="text-[10px] mt-1">You</p>
            </div>
          ) : (
            <div className="text-center text-white/60">
              <VideoOff className="h-5 w-5 mx-auto" />
              <p className="text-[10px] mt-1">Camera off</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur px-3 py-2">
          <ControlButton active={micOn} onClick={() => setMicOn((v) => !v)} iconOn={Mic} iconOff={MicOff} label="Mic" />
          <ControlButton active={camOn} onClick={() => setCamOn((v) => !v)} iconOn={Video} iconOff={VideoOff} label="Camera" />
          <ControlButton active={chatOpen} onClick={() => { setChatOpen((v) => !v); setFilesOpen(false); }} iconOn={MessageSquare} iconOff={MessageSquare} label="Chat" />
          <ControlButton active={filesOpen} onClick={() => { setFilesOpen((v) => !v); setChatOpen(false); }} iconOn={Paperclip} iconOff={Paperclip} label="Files" />
          <button
            onClick={() => setEndOpen(true)}
            className="flex items-center gap-1 rounded-full bg-rose-600 hover:bg-rose-700 px-4 py-1.5 text-white text-xs font-medium"
          >
            <PhoneOff className="h-4 w-4" /> End
          </button>
        </div>
      </div>

      {/* Side panels */}
      {chatOpen && (
        <Card className="mt-3">
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-2">Chat</p>
            <div className="space-y-2 max-h-48 overflow-y-auto text-sm">
              <div className="rounded-lg bg-muted p-2 max-w-[80%]">
                <p className="text-xs text-muted-foreground">{provider?.firstName} (doctor)</p>
                <p>Hello Amina, please give me a moment to review your records.</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                placeholder="Type a message…"
                onKeyDown={(e) => { if (e.key === "Enter") { toast.success("Message sent (simulated)"); (e.target as HTMLInputElement).value = ""; } }}
              />
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">Send</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filesOpen && (
        <Card className="mt-3">
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-2">Shared files</p>
            <p className="text-sm text-muted-foreground">No files shared yet. Drag-and-drop will be available in the production release.</p>
          </CardContent>
        </Card>
      )}

      {/* End confirm */}
        {endOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="max-w-md w-full">
              <CardContent className="p-5">
                <h3 className="font-semibold">End consultation?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This will end the call. Your provider will finalise the encounter and any prescriptions or follow-ups.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEndOpen(false)}>Keep in call</Button>
                  <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" onClick={() => { setPhase("ended"); setEndOpen(false); toast.success("Consultation ended"); }}>
                    End consultation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
    </div>
  );
}

function DeviceCheck({ label, ok, onToggle, icon: Icon, sub }: {
  label: string; ok: boolean; onToggle?: () => void; icon: React.ComponentType<{ className?: string }>; sub?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs font-medium ${ok ? "text-emerald-600" : "text-rose-600"}`}>{ok ? "Ready" : "Off"}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${ok ? "text-emerald-600" : "text-muted-foreground"}`} />
        {onToggle && (
          <Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs" onClick={onToggle}>
            {ok ? "Turn off" : "Turn on"}
          </Button>
        )}
      </div>
      {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ControlButton({ active, onClick, iconOn: IconOn, iconOff: IconOff, label }: {
  active: boolean; onClick: () => void; iconOn: React.ComponentType<{ className?: string }>; iconOff: React.ComponentType<{ className?: string }>; label: string;
}) {
  const Icon = active ? IconOn : IconOff;
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center justify-center h-9 w-9 rounded-full text-white transition-colors ${
        active ? "bg-white/20 hover:bg-white/30" : "bg-rose-600 hover:bg-rose-700"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function formatDuration(totalSeconds: number): string {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
