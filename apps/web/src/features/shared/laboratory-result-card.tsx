"use client";

import type { LaboratoryResultResponse } from "@royal-palace/contracts";
import { AlertTriangle, Download, FileText, FlaskConical } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ExpandableCard } from "@/components/healthcare/compact-list";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type AttachmentDownload = (resultId: string, attachmentId: string) => Promise<{ url: string }>;

export function LaboratoryResultCard({
  actions,
  defaultOpen = false,
  downloadAttachment,
  result,
  showPatient = false,
}: {
  actions?: ReactNode;
  defaultOpen?: boolean;
  downloadAttachment: AttachmentDownload;
  result: LaboratoryResultResponse;
  showPatient?: boolean;
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const critical = result.summaryFlag === "CRITICAL";
  const abnormal = result.summaryFlag !== "NORMAL";
  const subtitle = [
    showPatient ? result.patient.displayName : result.laboratory.displayName,
    result.resultNumber,
    result.publishedAt ? formatDate(result.publishedAt) : result.status.replaceAll("_", " "),
  ].join(" · ");

  async function download(attachmentId: string) {
    setDownloadingId(attachmentId);
    try {
      const signed = await downloadAttachment(result.id, attachmentId);
      window.location.assign(signed.url);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The attachment could not be opened");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <ExpandableCard
      className={cn(critical && "border-rose-200 bg-rose-50/30")}
      defaultOpen={defaultOpen}
      leading={
        <div
          className={cn(
            "rounded-lg p-2 ring-1",
            critical
              ? "bg-rose-50 ring-rose-100"
              : abnormal
                ? "bg-amber-50 ring-amber-100"
                : "bg-emerald-50 ring-emerald-100",
          )}
        >
          {critical ? (
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          ) : (
            <FlaskConical
              className={cn("h-4 w-4", abnormal ? "text-amber-600" : "text-emerald-600")}
            />
          )}
        </div>
      }
      subtitle={subtitle}
      title={result.service.name}
      trailing={<StatusBadge size="sm" status={result.summaryFlag.toLowerCase()} />}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          {result.components.map((component) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-border/60 bg-muted/30 p-2.5"
              key={component.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{component.name}</p>
                <p className="text-xs text-muted-foreground">
                  Reference: {component.referenceRange ?? "Not supplied"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {component.value} {component.unit ?? ""}
                </p>
                <StatusBadge size="sm" status={component.flag.toLowerCase()} />
              </div>
            </div>
          ))}
        </div>

        {result.interpretation && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Interpretation
            </p>
            <p className="text-sm leading-relaxed">{result.interpretation}</p>
          </div>
        )}

        {result.attachments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Attachments
            </p>
            {result.attachments.map((attachment) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5"
                key={attachment.id}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{attachment.originalFilename}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {attachment.status.toLowerCase().replaceAll("_", " ")}
                    </p>
                  </div>
                </div>
                {attachment.status === "CLEAN" && (
                  <Button
                    aria-label={`Download ${attachment.originalFilename}`}
                    disabled={downloadingId === attachment.id}
                    onClick={() => void download(attachment.id)}
                    size="sm"
                    variant="ghost"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {actions}
      </div>
    </ExpandableCard>
  );
}
