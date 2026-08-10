"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate, useNav } from "@/lib/nav";
import { providerService } from "@/lib/services";
import type { Provider } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { formatDate } from "@/lib/format";
import { Stethoscope, Search, MapPin, Star, ArrowRight, BadgeCheck } from "lucide-react";

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Approved", value: "approved" },
  { label: "Submitted", value: "submitted" },
  { label: "Under review", value: "under_review" },
  { label: "Suspended", value: "suspended" },
  { label: "Rejected", value: "rejected" },
  { label: "Info requested", value: "additional_information_requested" },
];

export function AdminProviders() {
  const { view } = useNav();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(
    view.params.status ?? "all"
  );

  const load = () => {
    providerService.list()
      .then(setProviders)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load providers"))
      .finally(() => setLoading(false));
  };

  const refetch = () => {
    setLoading(true);
    setError(null);
    load();
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((p) => {
      if (statusFilter !== "all" && p.verificationStatus !== statusFilter) return false;
      if (!q) return true;
      const haystack = `${p.firstName} ${p.lastName} ${p.specialty} ${p.city} ${p.providerNumber}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [providers, search, statusFilter]);

  return (
    <div>
      <PageHeader
        title="Providers"
        description="Verify, search and manage healthcare providers on the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Providers" }]}
      />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
            <div className="space-y-1.5">
              <Label htmlFor="search" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, specialty, city, provider number…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Verification status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? <LoadingState label="Loading providers…" /> :
       error ? <ErrorState message={error} onRetry={refetch} /> :
       filtered.length === 0 ? (
         <EmptyState
           icon={Stethoscope}
           title="No providers found"
           description="Try adjusting your search or filter."
         />
       ) : (
         <Card>
           <CardContent className="p-0">
             <div className="divide-y">
               {filtered.map((p) => {
                 const days = Math.ceil((new Date(p.licenceExpiry).getTime() - Date.now()) / 86400000);
                 return (
                   <button
                     key={p.id}
                     onClick={() => navigate("admin", "provider", { id: p.id })}
                     className="w-full text-left p-4 hover:bg-accent transition-colors flex items-center gap-4"
                   >
                     <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
                       <Stethoscope className="h-5 w-5 text-primary" />
                     </div>
                     <div className="min-w-0 flex-1">
                       <div className="flex items-center gap-2 flex-wrap">
                         <p className="font-semibold truncate">{p.title} {p.firstName} {p.lastName}</p>
                         <StatusBadge status={p.verificationStatus} />
                         {p.verificationStatus === "approved" && (
                           <BadgeCheck className="h-4 w-4 text-emerald-600" />
                         )}
                       </div>
                       <p className="text-sm text-muted-foreground truncate">{p.specialty} · {p.professionalTitle}</p>
                       <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                         <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.city}, {p.state}</span>
                         <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" /> {p.rating.toFixed(1)} ({p.reviewCount})</span>
                         <span>Licence expires {formatDate(p.licenceExpiry)} {days < 90 ? <span className={days < 30 ? "text-rose-600 font-medium" : "text-amber-600 font-medium"}>· {days < 0 ? `expired ${Math.abs(days)}d ago` : `${days}d left`}</span> : null}</span>
                       </div>
                     </div>
                     <div className="shrink-0">
                       <Button variant="ghost" size="sm">
                         View <ArrowRight className="h-3.5 w-3.5 ml-1" />
                       </Button>
                     </div>
                   </button>
                 );
               })}
             </div>
           </CardContent>
         </Card>
       )}
    </div>
  );
}
