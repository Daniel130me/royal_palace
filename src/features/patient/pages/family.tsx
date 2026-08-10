"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { patientService } from "@/lib/services";
import type { Patient } from "@/types";
import { usePatientContext } from "../use-patient-context";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Users, Plus, ChevronDown, ShieldCheck, Heart, Baby, Check, User,
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

  return (
    <div>
      <PageHeader
        title="Family"
        description="Manage healthcare for yourself and your dependants."
        actions={
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add dependant
          </Button>
        }
      />

      {/* Active context banner */}
      <Card className="mb-6 border-emerald-200 bg-emerald-50">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 p-2">
            <Heart className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-emerald-700 uppercase tracking-wide">Currently managing healthcare for</p>
            <p className="font-semibold">
              {profile ? `${profile.firstName} ${profile.lastName}` : "—"}
              {primary && profile && primary.id !== profile.id && (
                <span className="ml-2 text-xs font-normal text-emerald-700">(dependant of {primary.firstName})</span>
              )}
            </p>
          </div>
          <Badge variant="outline" className="bg-background text-emerald-700 border-emerald-200">
            {profile?.patientNumber}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Primary card */}
        {primary && (
          <FamilyMemberCard patient={primary} isPrimary active={profile?.id === primary.id} onSelect={() => selectPatient(primary.id)} />
        )}
        {/* Dependants */}
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

      {dependants.length === 0 && (
        <EmptyState
          icon={Baby}
          title="No dependants yet"
          description="Add your children, spouse or wards to manage their healthcare from one account."
          action={<Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add dependant
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
    <Card className={active ? "border-emerald-500 ring-1 ring-emerald-200" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold">
              {initials(`${p.firstName} ${p.lastName}`)}
            </AvatarFallback>
          </Avatar>
          {isPrimary ? (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
              <User className="h-3 w-3" /> Primary
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <Baby className="h-3 w-3" /> Dependant
            </Badge>
          )}
        </div>
        <p className="mt-3 font-semibold">{p.firstName} {p.lastName}</p>
        <p className="text-xs text-muted-foreground">{p.patientNumber}</p>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>Age: {patientAge ?? "—"} years</p>
          <p>Gender: {p.gender}</p>
          <p>Blood: {p.bloodGroup ?? "—"} · {p.genotype ?? "—"}</p>
          <p>Location: {p.city}, {p.state}</p>
        </div>
        <Button
          className={`w-full mt-4 ${active ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
          variant={active ? "default" : "outline"}
          onClick={onSelect}
          disabled={active}
        >
          {active ? (<><Check className="h-4 w-4 mr-1" /> Active</>) : "Switch to this profile"}
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
        // JSON-string fields (SQLite storage)
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
      // Switch to the new dependant for immediate management. setActivePatient
      // updates the nav store; the patient context's useEffect re-runs and
      // re-resolves the active profile from the server.
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
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label>Last name *</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date of birth *</Label>
              <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div>
              <Label>Gender *</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Relationship</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Blood group</Label>
              <Select value={bloodGroup} onValueChange={setBloodGroup}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Unknown" /></SelectTrigger>
                <SelectContent>
                  {BLOOD_GROUPS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Genotype</Label>
              <Select value={genotype} onValueChange={setGenotype}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Unknown" /></SelectTrigger>
                <SelectContent>
                  {GENOTYPES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={submit}>
            {busy ? "Adding…" : "Add dependant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
