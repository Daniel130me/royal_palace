"use client";

import { FileText, Package, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyState, PageHeader } from "@/components/healthcare/page-header";
import { StatTile } from "@/components/healthcare/compact-list";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

export function PharmacyDashboard() {
  const organizationId = useNav().session?.profileId;
  const [counts, setCounts] = useState({ orders: 0, prescriptions: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setError("No pharmacy membership is available for this session");
      return;
    }
    let active = true;
    Promise.all([
      productionPrescriptionService.pharmacy.prescriptions(organizationId, undefined, 50),
      productionPrescriptionService.pharmacy.orders(organizationId, undefined, 50),
    ])
      .then(
        ([prescriptions, orders]) =>
          active &&
          setCounts({ orders: orders.data.length, prescriptions: prescriptions.data.length }),
      )
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : "Dashboard could not be loaded"),
      );
    return () => {
      active = false;
    };
  }, [organizationId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pharmacy workspace"
        description="Secure prescription review, quoting, and fulfilment."
      />
      {error !== null ? (
        <EmptyState title="Workspace unavailable" description={error} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatTile
            label="Prescription queue"
            value={counts.prescriptions}
            icon={FileText}
            tone="info"
            onClick={() => navigate("pharmacy", "prescriptions")}
          />
          <StatTile
            label="Orders"
            value={counts.orders}
            icon={Package}
            tone="warning"
            onClick={() => navigate("pharmacy", "orders")}
          />
        </div>
      )}
      <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Clinical and commercial state are independent. Patient identity and prescription data are
        limited to the active pharmacy workflow.
      </div>
    </div>
  );
}
