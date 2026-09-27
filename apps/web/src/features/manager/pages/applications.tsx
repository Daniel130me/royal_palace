"use client";

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManagerStatusBadge } from "../components/manager-shared";
import { formatDate } from "@/lib/format";
import { RefreshCw } from "lucide-react";

type SafeApplication = { id: string; applicationNumber: string; enrollmentType: string; status: string; submittedAt: string; reviewedAt?: string | null; reviewerNote?: string | null };
type Response = { data: SafeApplication[]; meta: { total: number; statusCounts: Record<string, number> } };

export function ManagerApplications() {
  const [res, setRes] = useState<Response | null>(null); const [error, setError] = useState<string | null>(null); const [status, setStatus] = useState("all");
  const load = useCallback(() => managerService.applications({ status, pageSize: "50" }).then((v) => setRes(v as unknown as Response)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load enrollment status.")), [status]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />; if (!res) return <LoadingState label="Loading enrollment status…" />;
  return <div><PageHeader title="Enrollment status" description="Track applications by reference only. Admin and support staff retain the submitted personal and organization details." actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button>} />
    <div className="flex gap-2 flex-wrap mb-4">{["all", "submitted", "under_review", "information_required", "approved", "rejected"].map((s) => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)} className="capitalize">{s.replaceAll("_", " ")} ({s === "all" ? res.meta.total : res.meta.statusCounts[s] ?? 0})</Button>)}</div>
    <div className="grid md:grid-cols-2 gap-3">{res.data.map((item) => <Card key={item.id}><CardContent className="p-4 flex items-start justify-between gap-3"><div><p className="font-semibold">{item.applicationNumber}</p><p className="text-sm capitalize">{item.enrollmentType.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">Submitted {formatDate(item.submittedAt)}</p>{item.reviewerNote ? <p className="text-xs mt-2">Admin note: {item.reviewerNote}</p> : null}</div><ManagerStatusBadge status={item.status} /></CardContent></Card>)}</div>
    {!res.data.length ? <p className="text-sm text-muted-foreground text-center p-8">No enrollment applications match this filter.</p> : null}
  </div>;
}
