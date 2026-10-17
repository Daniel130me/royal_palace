"use client";

import { PractitionerDirectory } from "@/features/shared/practitioner-directory";
import { useNav } from "@/lib/nav";

export function PatientDoctors() {
  const { view } = useNav();
  return <PractitionerDirectory context="patient" initialSpecialty={view.params?.specialty} />;
}
