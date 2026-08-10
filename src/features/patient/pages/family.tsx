"use client";

import { useEffect, useState } from "react";
import { navigate } from "@/lib/nav";
import { patientService } from "@/lib/services";
import type { Patient } from "@/types";
import { usePatientContext } from "../use-patient-context";
import { PageHeader, EmptyState, LoadingState, SectionCard } from "@/components/healthcare/page-header";
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
import {
  Plus, ShieldCheck, Heart, Baby, Check, User,
} from "lucide-react";
import { toast } from "sonner";
import { age, formatDate, initials } from "@/lib/format";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Family"
        description="Manage healthcare for yourself and your dependants."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add dependant
          </Button>
        }
      />

      {/* Active context banner — prominent */}
      <div className={`rounded-2xl border p-1 ${isActiveDependant ? "bg-amber-50 border-amber-200" : "bg-primary/5 border-primary/20"}`}>
        <SectionCard>
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2 shrink-0 ${isActiveDependant ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
              <Heart className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${isActiveDependant ? "text-amber-700" : "text-primary"}`}>
                Currently managing healthcare for
              </p>
              <p className="font-semibold leading-tight mt-0.5">
                {profile ? `${profile.firstName} ${profile.lastName}` : "—"}
                {isActiveDependant && primary && (
                  <span className="ml-1.5 text-xs font-normal text-amber-700">(dependant of {primary.firstName})</span>
                )}
              </p>
            </div>
            {profile && (
              <Badge variant="outline" className={`font-mono text-xs h-6 px-2 ${isActiveDependant ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-card text-primary border-primary/30"}`}>
                {profile.patientNumber}
              </Badge>
            )}
          </div>
        </SectionCard>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Family members</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      </div>

      {dependants.length === 0 && (
        <EmptyState
          icon={Baby}
          title="No dependants yet"
          description="Add your children, spouse or wards to manage their healthcare from one account."
          action={<Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add dependant
          </Button>}
        />
      )}

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
    <Card className={active ? "border-primary ring-1 ring-primary/30" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials(`${p.firstName} ${p.lastName}`)}
            </AvatarFallback>
          </Avatar>
          {isPrimary ? (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1 h-5 px-1.5 text-[10px]">
              <User className="h-3 w-3" /> Primary
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 h-5 px-1.5 text-[10px]">
              <Baby className="h-3 w-3" /> Dependant
            </Badge>
          )}
        </div>
        <p className="mt-3 font-semibold tracking-tight">{p.firstName} {p.lastName}</p>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.patientNumber}</p>
        <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>Age</dt><dd className="font-medium text-foreground">{patientAge ?? "—"} years</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Gender</dt><dd className="font-medium text-foreground">{p.gender}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Blood</dt><dd className="font-medium text-foreground">{p.bloodGroup ?? "—"} · {p.genotype ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Location</dt><dd className="font-medium text-foreground text-right">{p.city}, {p.state}</dd>
          </div>
        </dl>
        <Button
          className="w-full mt-4"
          variant={active ? "default" : "outline"}
          onClick={onSelect}
          disabled={active}
        >
          {active ? (<><Check className="h-4 w-4" /> Active</>) : "Switch to this profile"}
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
