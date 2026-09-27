"use client";

import { useEffect, useState } from "react";
import { pharmacyService } from "@/lib/services";
import type { Pharmacy } from "@/types";
import { PageHeader, EmptyState, SkeletonGrid } from "@/components/healthcare/page-header";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { navigate } from "@/lib/nav";
import { MapPin, Star, ShieldCheck, Search, Pill } from "lucide-react";
import { initials } from "@/lib/format";

export function PatientPharmacies() {
  const [items, setItems] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "verified">("all");

  useEffect(() => {
    let cancelled = false;
    pharmacyService.list().then((rows) => {
      if (cancelled) return;
      setItems(rows);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = items.filter((p) => {
    if (filter === "verified" && p.verificationStatus !== "approved") return false;
    if (q && !`${p.name} ${p.city} ${p.state} ${p.address}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Find a pharmacy"
        description="Browse verified pharmacies. Order OTC medicines directly or send your prescription."
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="h-11 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="Search pharmacy name, city or address…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <SegmentedControl
        value={filter}
        onChange={(v) => setFilter(v as "all" | "verified")}
        options={[
          { value: "all", label: "All" },
          { value: "verified", label: "Verified" },
        ]}
      />

      {loading ? (
        <SkeletonGrid count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Pill} title="No pharmacies found" description="Try a different search." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((p) => (
            <CompactListItem
              key={p.id}
              leading={
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-amber-50 text-amber-700 text-xs font-semibold">
                    {initials(p.name)}
                  </AvatarFallback>
                </Avatar>
              }
              title={p.name}
              subtitle={`${p.address}`}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    {p.verificationStatus === "approved" && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />}
                    <span className="flex items-center gap-0.5 text-xs"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{p.city}</Badge>
                </div>
              }
              onClick={() => navigate("patient", "pharmacy", { id: p.id })}
              chevron
            />
          ))}
        </div>
      )}
    </div>
  );
}
