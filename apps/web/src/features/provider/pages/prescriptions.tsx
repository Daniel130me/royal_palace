"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";

import { CompactListItem } from "@/components/healthcare/compact-list";
import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { formatDate } from "@/lib/format";
import { productionPrescriptionService } from "@/lib/services";

type Prescription = PrescriptionComponents["schemas"]["Prescription"];

export function ProviderPrescriptions() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    productionPrescriptionService.provider
      .list()
      .then((page) => active && setPrescriptions([...page.data]))
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : "Prescriptions could not be loaded"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prescriptions"
        description="Signed clinical instructions you issued. Signed content is immutable."
      />
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null ? (
        <EmptyState title="Could not load prescriptions" description={error} />
      ) : prescriptions.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No prescriptions"
          description="Prescriptions created from eligible encounters will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {prescriptions.map((prescription) => (
            <CompactListItem
              key={prescription.id}
              leading={<FileText className="h-4 w-4 text-primary" />}
              title={prescription.prescriptionNumber}
              subtitle={`${prescription.patient.displayName} · ${prescription.items.length} item(s) · ${formatDate(prescription.createdAt)}`}
              trailing={<StatusBadge status={prescription.status.toLowerCase()} size="sm" />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
