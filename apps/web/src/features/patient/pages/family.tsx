"use client";

import { useEffect, useState } from "react";
import { patientService } from "@/lib/services";
import type { Patient } from "@/types";
import { usePatientContext } from "../use-patient-context";
import { PageHeader, LoadingState, EmptyState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Fab } from "@/components/healthcare/fab";
import {
  Plus, Heart, Baby, Check, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { age, initials } from "@/lib/format";
import { useNav } from "@/lib/nav";

const RELATIONSHIPS = ["Son", "Daughter", "Spouse", "Parent", "Sibling", "Ward"];
const GENDERS = ["Male", "Female"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENOTYPES = ["AA", "AS", "AC", "SS", "SC", "CC"];

export function PatientFamily() {
  const { primary, dependants, profile, selectPatient, loading } = usePatientContext();
  const { session } = useNav();
  const [addOpen, setAddOpen] = useState(false);

  if (loading) return <LoadingState label="Loading family…" />;

  const isActiveDependant = primary && profile && primary.id !== profile.id;
  const allMembers = primary ? [primary, ...dependants] : dependants;

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <PageHeader
        title="Family"
        description="Manage healthcare for yourself and your dependants."
      />

      {/* Compact active-context banner */}
      <div className={cn(
        "rounded-xl border p-3 flex items-center gap-3",
        isActiveDependant ? "bg-amber-50 border-amber-200" : "bg-primary/5 border-primary/20"
      )}>
        <div className={cn(
          "rounded-lg p-1.5 shrink-0",
          isActiveDependant ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"
        )}>
          <Heart className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-[10px] uppercase tracking-wider font-semibold leading-none",
            isActiveDependant ? "text-amber-700" : "text-primary"
          )}>
            Managing healthcare for
          </p>
          <p className="font-semibold text-sm leading-tight mt-1 truncate">
            {profile ? `${profile.firstName} ${profile.lastName}` : "—"}
            {isActiveDependant && primary && (
              <span className="ml-1.5 text-xs font-normal text-amber-700">(dependant of {primary.firstName})</span>
            )}
          </p>
        </div>
        {profile && (
          <Badge variant="outline" className={cn(
            "font-mono text-[10px] h-5 px-1.5 shrink-0",
            isActiveDependant ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-card text-primary border-primary/30"
          )}>
            {profile.patientNumber}
          </Badge>
        )}
      </div>

      {/* Member grid — 2-col mobile, 3-col desktop */}
      {allMembers.length === 0 ? (
        <EmptyState
          icon={Baby}
          title="No family members"
          description="Add your children, spouse or wards to manage their healthcare from one account."
          action={<Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add dependant
          </Button>}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {primary && (
            <FamilyMemberCard patient={primary} isPrimary active={profile?.id === primary.id} onSelect={() => selectPatient(primary.id)} />
          )}
          {dependants.map((d) => (
            <FamilyMemberCard
              key={d.id}
              patient={d}
              active={profile?.id === d.id}
              onSelect={() => {
                selectPatient(d.id);
                toast.success(`Now managing ${d.firstName}'s healthcare`);
              }}
            />
          ))}
          {/* Dashed add card */}
          <button
            onClick={() => setAddOpen(true)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/70 bg-muted/20 p-4 min-h-[140px] text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all tap-highlight-none"
          >
            <div className="rounded-full bg-primary/10 p-2">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <p className="text-xs font-medium text-center">Add dependant</p>
          </button>
        </div>
      )}

      {/* Floating Add button */}
      <Fab icon={Plus} label="Add dependant" onClick={() => setAddOpen(true)} />

      <AddDependantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        userId={session?.userId ?? ""}
        parentPatientId={primary?.id ?? ""}
        onCreated={() => { /* context refreshes automatically via selectPatient */ }}
      />
    </div>
  );
}

function FamilyMemberCard({
  patient: p, isPrimary, active, onSelect,
}: {
  patient: Patient; isPrimary?: boolean; active: boolean; onSelect: () => void;
}) {
  const patientAge = age(p.dateOfBirth);
  return (
    <Card className={cn(active && "border-primary ring-1 ring-primary/30 shadow-soft")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials(`${p.firstName} ${p.lastName}`)}
            </AvatarFallback>
          </Avatar>
          {isPrimary ? (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-0.5 h-5 px-1.5 text-[10px]">
              <User className="h-2.5 w-2.5" /> Primary
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-0.5 h-5 px-1.5 text-[10px]">
              <Baby className="h-2.5 w-2.5" /> Dependant
            </Badge>
          )}
        </div>
        <p className="mt-2.5 font-semibold text-sm tracking-tight truncate">{p.firstName} {p.lastName}</p>
        <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{p.patientNumber}</p>
        <dl className="mt-2.5 space-y-1 text-[11px] text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>Age</dt><dd className="font-medium text-foreground">{patientAge ?? "—"}y</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Gender</dt><dd className="font-medium text-foreground">{p.gender}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Blood</dt><dd className="font-medium text-foreground">{p.bloodGroup ?? "—"} · {p.genotype ?? "—"}</dd>
          </div>
        </dl>
        <Button
          className="w-full mt-3 h-8 text-xs"
          variant={active ? "default" : "outline"}
          onClick={onSelect}
          disabled={active}
        >
          {active ? (<><Check className="h-3.5 w-3.5" /> Active</>) : "Switch"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AddDependantDialog({
  open, onOpenChange, userId, parentPatientId, onCreated,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  userId: string; parentPatientId: string; onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("Female");
  const [relationship, setRelationship] = useState("Daughter");
  const [bloodGroup, setBloodGroup] = useState("");
  const [genotype, setGenotype] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setFirstName(""); setLastName(""); setDateOfBirth(""); setGender("Female");
    setRelationship("Daughter"); setBloodGroup(""); setGenotype("");
  }

  async function submit() {
    if (!firstName || !lastName || !dateOfBirth || !gender) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setBusy(true);
    try {
      const newPatient = await patientService.create({
        userId,
        parentPatientId,
        patientNumber: `RPH-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`,
        firstName,
        lastName,
        dateOfBirth,
        gender,
        phone: "+234 800 000 0000",
        email: "dependant@royalpalace.health",
        city: "Lekki",
        state: "Lagos",
        country: "Nigeria",
        bloodGroup: bloodGroup || null,
        genotype: genotype || null,
        allergies: JSON.stringify([]),
        conditions: JSON.stringify([]),
        medications: JSON.stringify([]),
        emergencyName: null,
        emergencyPhone: null,
        emergencyRel: relationship,
      } as Partial<Record<string, unknown>> as Partial<Patient>);
      toast.success(`${firstName} added as dependant`);
      onCreated();
      onOpenChange(false);
      reset();
      if (newPatient?.id) {
        const { setActivePatient } = useNav.getState();
        setActivePatient(newPatient.id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add dependant");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a dependant</DialogTitle>
          <DialogDescription>
            Add a family member to manage their healthcare from your account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First name *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Last name *</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date of birth *</Label>
              <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Gender *</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger className="w-full mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Relationship</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger className="w-full mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Blood group</Label>
              <Select value={bloodGroup} onValueChange={setBloodGroup}>
                <SelectTrigger className="w-full mt-1.5"><SelectValue placeholder="Unknown" /></SelectTrigger>
                <SelectContent>
                  {BLOOD_GROUPS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Genotype</Label>
              <Select value={genotype} onValueChange={setGenotype}>
                <SelectTrigger className="w-full mt-1.5"><SelectValue placeholder="Unknown" /></SelectTrigger>
                <SelectContent>
                  {GENOTYPES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? "Adding…" : "Add dependant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
