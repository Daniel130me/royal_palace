"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { uploadedPrescriptionService, pharmacyService } from "@/lib/services";
import type { UploadedPrescription, UploadedPrescriptionStatus, Pharmacy } from "@/types";
import { PageHeader, EmptyState, SkeletonGrid, SectionCard } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import {
  Upload, Plus, FileText, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

type UploadsTab = "all" | "active" | "reviewed";

const ACTIVE_STATUSES: UploadedPrescriptionStatus[] = ["uploaded", "under_review"];
const REVIEWED_STATUSES: UploadedPrescriptionStatus[] = ["accepted", "rejected"];

export function PatientUploads() {
  const { profile } = usePatientContext();
  const [uploads, setUploads] = useState<UploadedPrescription[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<UploadsTab>("all");

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    uploadedPrescriptionService.list(profile.id)
      .then((rows) => {
        if (cancelled) return;
        setUploads(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load uploads"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => {
    let cancelled = false;
    pharmacyService.list().then((p) => { if (!cancelled) setPharmacies(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const pharmacyName = useMemo(() => {
    const map = new Map<string, string>();
    pharmacies.forEach((p) => map.set(p.id, p.name));
    return (id?: string | null) => (id ? (map.get(id) ?? "Selected pharmacy") : null);
  }, [pharmacies]);

  const counts = useMemo(() => ({
    all: uploads.length,
    active: uploads.filter((u) => ACTIVE_STATUSES.includes(u.status)).length,
    reviewed: uploads.filter((u) => REVIEWED_STATUSES.includes(u.status)).length,
  }), [uploads]);

  const rows = uploads.filter((u) =>
    tab === "all" ? true :
    tab === "active" ? ACTIVE_STATUSES.includes(u.status) :
    REVIEWED_STATUSES.includes(u.status)
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="My uploaded prescriptions"
        description="Paper prescriptions you've photographed and sent for review."
        actions={
          <Button size="sm" onClick={() => navigate("patient", "upload-prescription")} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Upload
          </Button>
        }
      />

      <SegmentedControl<UploadsTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: "In progress", badge: counts.active || undefined },
          { value: "reviewed", label: "Reviewed", badge: counts.reviewed || undefined },
          { value: "all", label: "All" },
        ]}
      />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : error ? (
        <EmptyState title="Could not load uploads" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Upload}
          title={tab === "all" ? "No uploads yet" : "Nothing here"}
          description={
            tab === "all"
              ? "Tap Upload to photograph a paper prescription and send it to a pharmacy."
              : "Uploads in this category will appear here."
          }
          action={
            <Button onClick={() => navigate("patient", "upload-prescription")} className="bg-emerald-600 hover:bg-emerald-700">
              <Upload className="h-4 w-4" /> Upload prescription
            </Button>
          }
          compact
        />
      ) : (
        <div className="space-y-3">
          {rows.map((u) => (
            <UploadRow
              key={u.id}
              upload={u}
              pharmacyLabel={pharmacyName(u.pharmacyId)}
            />
          ))}
        </div>
      )}

      <SectionCard title="What is this?" icon={AlertCircle}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Got a paper prescription from an offline doctor or clinic? Photograph it here and we&apos;ll
          send it to a pharmacy for review. Once approved, you can place your order and have medicines
          delivered to your door.
        </p>
      </SectionCard>
    </div>
  );
}

function UploadRow({ upload, pharmacyLabel }: { upload: UploadedPrescription; pharmacyLabel: string | null }) {
  const tone = uploadTone(upload.status);
  const statusIcon = renderUploadIcon(upload.status);
  return (
    <ExpandableCard
      leading={
        <div className={`rounded-lg p-2 ring-1 ${tone.ring} ${tone.bg}`}>
          {statusIcon}
        </div>
      }
      title={upload.uploadNumber}
      subtitle={`${upload.prescriberName ?? "Unknown prescriber"} · ${formatDate(upload.createdAt)}`}
      trailing={
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={upload.status} size="sm" />
          <span className="text-[10px] text-muted-foreground">{formatDateTime(upload.createdAt)}</span>
        </div>
      }
    >
      <div className="space-y-3">
        {upload.dataUrl && (
          <img src={upload.dataUrl} alt="Uploaded prescription" className="w-full max-h-72 object-contain rounded-xl border bg-white" />
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Prescriber" value={upload.prescriberName ?? "—"} />
          <Detail label="Facility" value={upload.prescriberFacility ?? "—"} />
          <Detail label="Pharmacy" value={pharmacyLabel ?? "Not yet assigned"} />
          <Detail label="Reviewed" value={upload.reviewedAt ? formatDate(upload.reviewedAt) : "—"} />
        </div>

        {upload.notes ? (
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Notes to pharmacy</p>
            <p className="whitespace-pre-wrap leading-relaxed">{upload.notes}</p>
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          <span className="truncate">{upload.fileName}</span>
          <span>· {upload.fileType}</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => navigate("patient", "upload-prescription")}>
            <Plus className="h-3.5 w-3.5" /> Upload another
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("patient", "prescriptions")}>
            <FileText className="h-3.5 w-3.5" /> My prescriptions
          </Button>
        </div>
      </div>
    </ExpandableCard>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium leading-tight mt-0.5">{value}</p>
    </div>
  );
}

function uploadTone(status: UploadedPrescriptionStatus): { bg: string; ring: string; text: string } {
  switch (status) {
    case "uploaded":
      return { bg: "bg-sky-50", ring: "ring-sky-100", text: "text-sky-600" };
    case "under_review":
      return { bg: "bg-amber-50", ring: "ring-amber-100", text: "text-amber-600" };
    case "accepted":
      return { bg: "bg-emerald-50", ring: "ring-emerald-100", text: "text-emerald-600" };
    case "rejected":
      return { bg: "bg-rose-50", ring: "ring-rose-100", text: "text-rose-600" };
    default:
      return { bg: "bg-muted", ring: "ring-border", text: "text-muted-foreground" };
  }
}

function uploadIcon(status: UploadedPrescriptionStatus): React.ReactNode {
  const cls = "h-4 w-4";
  switch (status) {
    case "uploaded":
      return <Clock className={cls} />;
    case "under_review":
      return <AlertCircle className={cls} />;
    case "accepted":
      return <CheckCircle2 className={cls} />;
    case "rejected":
      return <AlertCircle className={cls} />;
    default:
      return <FileText className={cls} />;
  }
}

// Apply tone-coloured class via wrapper; returns node already wrapped with tone.
function renderUploadIcon(status: UploadedPrescriptionStatus): React.ReactNode {
  const tone = uploadTone(status);
  const inner = uploadIcon(status);
  // Wrap with tone text class via cloneElement-like approach: simpler — apply tone to inner by wrapping in span.
  return <span className={tone.text}>{inner}</span>;
}
