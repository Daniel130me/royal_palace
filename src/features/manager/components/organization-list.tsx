"use client";

// Shared list page for My Pharmacies / My Laboratories (plan §3.3).
// Searchable + verification-filtered; one component keeps the two portals
// visually identical.

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrganizationCard, ManagerEmptyState } from "./manager-shared";
import { navigate } from "@/lib/nav";
import { Search, RefreshCw } from "lucide-react";
import type { ManagerOrganization } from "@/types";

export function OrganizationListPage({ type }: { type: "pharmacy" | "laboratory" }) {
  const [items, setItems] = useState<ManagerOrganization[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [verification, setVerification] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await managerService.organizations({
        type,
        search,
        verification,
        pageSize: "100",
      });
      setItems(res.data);
      setTotal(res.meta.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load portfolio.");
    } finally {
      setLoading(false);
    }
  }, [type, search, verification]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200); // debounce search typing
    return () => clearTimeout(t);
  }, [load]);

  const title = type === "pharmacy" ? "My Pharmacies" : "My Laboratories";

  return (
    <div>
      <PageHeader
        title={title}
        description={`Organizations currently assigned to you (${total}). Acquisition attribution is preserved even after reassignment.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${type === "pharmacy" ? "pharmacies" : "laboratories"}…`}
            className="pl-9"
            aria-label={`Search ${title}`}
          />
        </div>
        <div className="flex gap-2">
          {["all", "approved", "pending"].map((v) => (
            <Button
              key={v}
              size="sm"
              variant={verification === v ? "default" : "outline"}
              onClick={() => setVerification(v)}
              className="capitalize"
            >
              {v === "all" ? "All" : v}
            </Button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <LoadingState label={`Loading ${title.toLowerCase()}…`} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <ManagerEmptyState
          title={`No ${type === "pharmacy" ? "pharmacies" : "laboratories"} found`}
          description="Try adjusting your search or filters, or onboard a new organization."
          actionLabel="Onboard organization"
          onAction={() => navigate("manager", "onboard")}
        />
      ) : (
        <div className="grid gap-3">
          {items.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  );
}
