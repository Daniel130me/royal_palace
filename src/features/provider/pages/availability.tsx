"use client";

import { useState } from "react";
import { useProviderContext } from "../use-provider-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/healthcare/page-header";
import { toast } from "sonner";
import { Clock, Video, Phone, MessageSquare, User, Save, Calendar } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const MODES = [
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Audio", icon: Phone },
  { id: "in_person", label: "In-person", icon: User },
  { id: "chat", label: "Chat", icon: MessageSquare },
];

export function ProviderAvailability() {
  const { profile } = useProviderContext();
  // Prototype state: an availability matrix (day x slot) of booleans.
  // In production this would be persisted via a dedicated endpoint.
  const [grid, setGrid] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const d of DAYS) for (const s of SLOTS) {
      // Default weekday business hours on
      initial[`${d}-${s}`] = !["Sat", "Sun"].includes(d) && parseInt(s.slice(0, 2), 10) >= 10 && parseInt(s.slice(0, 2), 10) <= 16;
    }
    return initial;
  });
  const [modes, setModes] = useState<string[]>(() => profile?.consultationModes ?? ["video", "audio"]);
  const [saving, setSaving] = useState(false);

  function toggle(day: string, slot: string) {
    setGrid((prev) => ({ ...prev, [`${day}-${slot}`]: !prev[`${day}-${slot}`] }));
  }
  function toggleMode(modeId: string) {
    setModes((prev) => prev.includes(modeId) ? prev.filter((m) => m !== modeId) : [...prev, modeId]);
  }
  function fillDay(day: string, on: boolean) {
    setGrid((prev) => {
      const next = { ...prev };
      for (const s of SLOTS) next[`${day}-${s}`] = on;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    // Prototype: just toast. Real implementation would call an availability service.
    setTimeout(() => {
      setSaving(false);
      toast.success("Availability saved.", { description: "Your weekly calendar has been updated." });
    }, 700);
  }

  const consultationModes = profile?.consultationModes ?? [];
  const enabledCount = Object.values(grid).filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Availability"
        description="Define your weekly consultation calendar and supported channels."
        actions={
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={save}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save schedule"}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Weekly calendar</CardTitle>
              <span className="text-xs text-muted-foreground">{enabledCount} slots enabled</span>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[64px_repeat(7,1fr)] gap-1 mb-2">
                  <div className="text-[10px] text-muted-foreground" />
                  {DAYS.map((d) => (
                    <div key={d} className="text-center text-xs font-medium">{d}</div>
                  ))}
                </div>
                {SLOTS.map((slot) => (
                  <div key={slot} className="grid grid-cols-[64px_repeat(7,1fr)] gap-1 mb-1">
                    <div className="text-[10px] text-muted-foreground flex items-center justify-end pr-2">{slot}</div>
                    {DAYS.map((day) => {
                      const key = `${day}-${slot}`;
                      const on = grid[key];
                      return (
                        <button
                          key={key}
                          onClick={() => toggle(day, slot)}
                          className={`h-7 rounded-md text-[10px] font-medium transition-colors ${
                            on ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                          aria-label={`${day} ${slot} ${on ? "available" : "unavailable"}`}
                        >
                          {on ? "●" : "—"}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <div className="mt-4 flex flex-wrap gap-2">
                  {DAYS.map((d) => (
                    <div key={d} className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fillDay(d, true)}>Fill {d}</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" onClick={() => fillDay(d, false)}>Clear</Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Consultation modes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Channels patients can book with you. (Profile default: {consultationModes.join(", ") || "—"}.)</p>
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = modes.includes(m.id);
                return (
                  <div key={m.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <Label className="text-sm">{m.label}</Label>
                        <p className="text-[10px] text-muted-foreground">{m.id === "in_person" ? "Face-to-face at your practice" : `${m.label} consultation`}</p>
                      </div>
                    </div>
                    <Switch checked={active} onCheckedChange={() => toggleMode(m.id)} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">How booking works</p>
              Patients see your available slots in real time and can only book times you have enabled. Each consultation reserves a 30-minute slot. Booked slots are automatically removed from your availability.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Slot summary</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {DAYS.map((d) => {
                const daySlots = SLOTS.filter((s) => grid[`${d}-${s}`]);
                return (
                  <div key={d} className="flex items-start justify-between">
                    <span className="text-muted-foreground w-10">{d}</span>
                    <div className="flex-1 flex flex-wrap gap-1 justify-end">
                      {daySlots.length === 0 ? <span className="text-xs text-muted-foreground">Unavailable</span> :
                        daySlots.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
