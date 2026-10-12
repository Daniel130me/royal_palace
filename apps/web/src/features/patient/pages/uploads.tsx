"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Download, FileText, Plus, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CompactListItem } from "@/components/healthcare/compact-list";
import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type UploadRow = PrescriptionComponents["schemas"]["ScannedPrescriptionSummary"];

export function PatientUploads() {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    productionPrescriptionService.patient
      .scannedPrescriptions()
      .then((page) => active && setRows([...page.data]))
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : "Uploads could not be loaded"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function download(row: UploadRow) {
    try {
      const result = await productionPrescriptionService.patient.scannedPrescriptionDownload(
        row.id,
      );
      window.location.assign(result.url);
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "The clean document is not available yet",
      );
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Uploaded prescriptions"
        description="Track private scanning and pharmacy verification without exposing the document to unrelated organizations."
        actions={
          <Button size="sm" onClick={() => navigate("patient", "upload-prescription")}>
            <Plus className="h-4 w-4" /> Upload
          </Button>
        }
      />
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <EmptyState title="Could not load uploads" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="No uploaded prescriptions"
          description="Upload a paper prescription to begin the secure verification flow."
          action={
            <Button onClick={() => navigate("patient", "upload-prescription")}>
              <Upload className="h-4 w-4" /> Upload prescription
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {rows.map((row) => (
            <CompactListItem
              key={row.id}
              leading={<FileText className="h-4 w-4 text-emerald-700" />}
              title={row.uploadNumber}
              subtitle={`${row.prescriberName ?? "Prescriber not supplied"} · ${formatDateTime(row.createdAt)}`}
              trailing={
                <div className="flex items-center gap-2">
                  <StatusBadge status={row.status.toLowerCase()} size="sm" />
                  {canDownload(row.status) ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        void download(row);
                      }}
                      aria-label="Download clean document"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              }
              onClick={() => navigate("patient", "uploads", { id: row.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function canDownload(status: UploadRow["status"]): boolean {
  return ["CLEAN", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED"].includes(status);
}
