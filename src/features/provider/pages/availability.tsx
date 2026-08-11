"use client";

import { useState } from "react";
import { useProviderContext } from "../use-provider-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  PageHeader,
  SectionCard,
  BottomActionBar,
} from "@/components/healthcare/page-header";
import { toast } from "sonner";
import { onlineConsultationModes } from "@/lib/consultation-policy";
import { Clock, Video, Phone, MessageSquare, Save, Calendar } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const MODES = [
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Voice", icon: Phone },
  { id: "chat", label: "Chat", icon: MessageSquare },
];

export function ProviderAvailability() {
  const { profile } = useProviderContext();
  // Prototype state: an availability matrix (day x slot) of booleans.
  const [grid, setGrid] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const d of DAYS) for (const s of SLOTS) {
      initial[`${d}-${s}`] = !["Sat", "Sun"].includes(d) && parseInt(s.slice(0, 2), 10) >= 10 && parseInt(s.slice(0, 2), 10) <= 16;
    }
    return initial;
  });
  const [modes, setModes] = useState<string[]>(() => onlineConsultationModes(profile?.consultationModes ?? ["video", "audio"]));
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
    setTimeout(() => {
      setSaving(false);
      toast.success("Availability saved.", { description: "Your weekly calendar has been updated." });
    }, 700);
  }

  const consultationModes = onlineConsultationModes(profile?.consultationModes);
  const enabledCount = Object.values(grid).filter(Boolean).length;

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title="Availability"
        description="Define your weekly consultation calendar and supported channels."
      />

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2">
          <SectionCard
            title="Weekly calendar"
            icon={Calendar}
            description="Tap slots to toggle availability"
            action={<Badge variant="outline" className="h-6">{enabledCount} slots</Badge>}
          >
            {/* Desktop grid (table-style) */}
            <div className="hidden sm:block">
              <div className="grid grid-cols-[64px_repeat(7,1fr)] gap-1 mb-2">
                <div />
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-semibold">{d}</div>
                ))}
              </div>
              {SLOTS.map((slot) => (
                <div key={slot} className="grid grid-cols-[64px_repeat(7,1fr)] gap-1 mb-1">
                  <div className="text-[10px] text-muted-foreground flex items-center justify-end pr-2 font-medium">{slot}</div>
                  {DAYS.map((day) => {
                    const key = `${day}-${slot}`;
                    const on = grid[key];
                    return (
                      <button
                        key={key}
                        onClick={() => toggle(day, slot)}
                        className={`h-8 rounded-md text-[10px] font-medium transition-colors tap-highlight-none ${
                          on ? "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90" : "bg-muted text-muted-foreground hover:bg-muted/70"
                        }`}
                        aria-label={`${day} ${slot} ${on ? "available" : "unavailable"}`}
                      >
                        {on ? "●" : "—"}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {DAYS.map((d) => (
                  <div key={d} className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => fillDay(d, true)}>Fill {d}</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600 px-2" onClick={() => fillDay(d, false)}>Clear</Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile: stacked day rows */}
            <div className="sm:hidden space-y-3">
              {DAYS.map((day) => {
                const daySlots = SLOTS.filter((s) => grid[`${day}-${s}`]);
                return (
                  <div key={day} className="rounded-xl border border-border/80 bg-muted/20 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold">{day}</p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => fillDay(day, true)}>Fill</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-rose-600 px-2" onClick={() => fillDay(day, false)}>Clear</Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {SLOTS.map((slot) => {
                        const key = `${day}-${slot}`;
                        const on = grid[key];
                        return (
                          <button
                            key={key}
                            onClick={() => toggle(day, slot)}
                            className={`h-8 rounded-md text-[10px] font-medium transition-colors tap-highlight-none ${
                              on ? "bg-primary text-primary-foreground shadow-soft" : "bg-muted text-muted-foreground"
                            }`}
                            aria-label={`${day} ${slot} ${on ? "available" : "unavailable"}`}
                          >
                            {slot.slice(0, 2)}
                          </button>
                        );
                      })}
                    </div>
                    {daySlots.length === 0 && <p className="text-[10px] text-muted-foreground mt-2">Unavailable</p>}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard
            title="Consultation modes"
            icon={Clock}
            description={`Profile default: ${consultationModes.join(", ") || "—"}`}
          >
            <div className="space-y-2.5">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = modes.includes(m.id);
                return (
                  <div key={m.id} className={`flex items-center justify-between rounded-xl border p-3 transition-colors ${active ? "border-primary/30 bg-primary/5" : "border-border/80"}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`rounded-lg p-1.5 ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">{m.label}</Label>
                        <p className="text-[10px] text-muted-foreground">{`${m.label} consultation`}</p>
                      </div>
                    </div>
                    <Switch checked={active} onCheckedChange={() => toggleMode(m.id)} />
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Slot summary" icon={Calendar}>
            <div className="text-sm space-y-2.5">
              {DAYS.map((d) => {
                const daySlots = SLOTS.filter((s) => grid[`${d}-${s}`]);
                return (
                  <div key={d} className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground w-10 text-xs font-medium uppercase">{d}</span>
                    <div className="flex-1 flex flex-wrap gap-1 justify-end">
                      {daySlots.length === 0 ? <span className="text-xs text-muted-foreground italic">Unavailable</span> :
                        daySlots.map((s) => <Badge key={s} variant="secondary" className="text-[10px] h-5">{s}</Badge>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground mb-1.5">How booking works</p>
            Patients see your available slots in real time and can only book times you have enabled. Each consultation reserves a 30-minute slot. Booked slots are automatically removed from your availability.
          </div>
        </div>
      </div>

      {/* Mobile sticky save bar */}
      <BottomActionBar>
        <Button className="w-full" disabled={saving} onClick={save}>
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save schedule"}
        </Button>
      </BottomActionBar>

      {/* Desktop save button (in header position via PageHeader actions on mobile could not fit) */}
      <div className="hidden lg:block fixed bottom-6 right-8 z-10">
        <Button size="lg" disabled={saving} onClick={save} className="shadow-soft-lg">
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save schedule"}
        </Button>
      </div>
    </div>
  );
}
