"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Download, FileText, Plus, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CompactListItem } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type UploadRow = PrescriptionComponents["schemas"]["ScannedPrescriptionSummary"];
type UploadDetail = PrescriptionComponents["schemas"]["ScannedPrescriptionDetail"];

export function PatientUploads() {
  const selectedId = useNav().view.params.id;
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [detail, setDetail] = useState<UploadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const request =
      selectedId === undefined
        ? productionPrescriptionService.patient
            .scannedPrescriptions()
            .then((page) => setRows([...page.data]))
        : productionPrescriptionService.patient
            .scannedPrescription(selectedId)
            .then(setDetail);
    request
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : "Uploads could not be loaded"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [selectedId]);

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

  if (loading) return <SkeletonGrid count={4} />;
  if (error) return <EmptyState title="Could not load uploads" description={error} />;
  if (selectedId !== undefined) {
    return detail === null ? (
      <EmptyState title="Upload unavailable" description="The uploaded prescription was not found." />
    ) : (
      <PatientUploadDetail detail={detail} onDownload={() => download(detail)} />
    );
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
      {rows.length === 0 ? (
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

function PatientUploadDetail({
  detail,
  onDownload,
}: {
  detail: UploadDetail;
  onDownload: () => Promise<void>;
}) {
  const latestPatientNote = [...detail.history]
    .reverse()
    .find((entry) => entry.patientVisibleNote !== null)?.patientVisibleNote;
  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={detail.uploadNumber}
        description={`Uploaded ${formatDateTime(detail.createdAt)}`}
        actions={<StatusBadge status={detail.status.toLowerCase()} />}
      />
      {latestPatientNote !== undefined ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Pharmacy update</p>
          <p className="mt-1">{latestPatientNote}</p>
        </div>
      ) : null}
      <SectionCard title="Prescription details" icon={FileText}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">File</dt><dd>{detail.originalFilename}</dd></div>
          <div><dt className="text-muted-foreground">Prescriber</dt><dd>{detail.prescriberName ?? "Not provided"}</dd></div>
          <div><dt className="text-muted-foreground">Facility</dt><dd>{detail.prescriberFacility ?? "Not provided"}</dd></div>
          <div><dt className="text-muted-foreground">Your note</dt><dd>{detail.patientNote ?? "None"}</dd></div>
        </dl>
        {canDownload(detail.status) ? (
          <Button className="mt-4" variant="outline" onClick={() => void onDownload()}>
            <Download className="h-4 w-4" /> Download clean document
          </Button>
        ) : null}
      </SectionCard>
      <SectionCard title="Status history" icon={Upload}>
        <ol className="space-y-3">
          {detail.history.map((entry) => (
            <li key={entry.id} className="border-l-2 pl-3 text-sm">
              <p className="font-medium">{entry.toStatus.replaceAll("_", " ")}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(entry.occurredAt)}</p>
              {entry.patientVisibleNote ? <p className="mt-1">{entry.patientVisibleNote}</p> : null}
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}

function canDownload(status: UploadRow["status"]): boolean {
  return ["CLEAN", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED"].includes(status);
}
