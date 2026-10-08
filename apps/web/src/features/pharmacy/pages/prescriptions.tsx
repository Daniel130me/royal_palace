"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";

import { CompactListItem } from "@/components/healthcare/compact-list";
import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { formatDate } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type Prescription = PrescriptionComponents["schemas"]["PharmacyPrescription"];

export function PharmacyPrescriptions() {
  const organizationId = useNav().session?.profileId;
  const [rows, setRows] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setError("No pharmacy membership is available for this session");
      setLoading(false);
      return;
    }
    let active = true;
    productionPrescriptionService.pharmacy
      .prescriptions(organizationId)
      .then((page) => active && setRows([...page.data]))
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : "Queue could not be loaded"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [organizationId]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prescription queue"
        description="Purpose-limited prescriptions routed to this pharmacy."
      />
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null ? (
        <EmptyState title="Could not load the queue" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Queue is clear"
          description="Patient-routed prescriptions will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {rows.map((prescription) => (
            <CompactListItem
              key={prescription.id}
              leading={<FileText className="h-4 w-4 text-primary" />}
              title={prescription.prescriptionNumber}
              subtitle={`${prescription.patient.displayName} · ${prescription.items.length} item(s) · expires ${formatDate(prescription.validUntil)}`}
              trailing={<StatusBadge status={prescription.status.toLowerCase()} size="sm" />}
              onClick={() => navigate("pharmacy", "prescription", { id: prescription.id })}
              chevron
            />
          ))}
        </div>
      )}
    </div>
  );
}
