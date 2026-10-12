"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import {
  AlertCircle,
  Lock,
  Minus,
  Pill,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  PageHeader,
  SectionCard,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMinorCurrency } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type CatalogItem = PrescriptionComponents["schemas"]["PatientPharmacyCatalogItem"];
type Filter = "all" | "otc" | "rx";
const DIRECT_QUOTE_TTL_SECONDS = 15 * 60;

export function PatientPharmacyDetail() {
  const { view } = useNav();
  const pharmacyId = view.params.id;
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pharmacyId === undefined) return;
    const controller = new AbortController();
    setLoading(true);
    productionPrescriptionService.patient
      .pharmacyCatalogItems(pharmacyId)
      .then((page) => setItems([...page.data]))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Catalogue could not be loaded");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [pharmacyId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (filter === "otc" && !item.directOrderEligible) return false;
      if (filter === "rx" && !item.prescriptionRequired && !item.controlledMedication) return false;
      return (
        normalized.length === 0 ||
        [item.name, item.genericName, item.brandName, item.category.name]
          .filter((value): value is string => value !== null)
          .some((value) => value.toLocaleLowerCase().includes(normalized))
      );
    });
  }, [filter, items, query]);

  const cartLines = items.flatMap((item) => {
    const quantity = cart[item.id];
    return quantity === undefined ? [] : [{ item, quantity }];
  });
  const currencies = new Set(cartLines.map(({ item }) => item.currency));
  const currency = cartLines[0]?.item.currency;
  const subtotalMinor = cartLines.reduce(
    (total, { item, quantity }) => total + BigInt(item.unitPriceMinor) * BigInt(quantity),
    BigInt(0),
  );

  function changeQuantity(item: CatalogItem, delta: number) {
    if (!item.directOrderEligible) return;
    setCart((current) => {
      const nextQuantity = Math.min(999, Math.max(0, (current[item.id] ?? 0) + delta));
      const next = { ...current };
      if (nextQuantity === 0) delete next[item.id];
      else next[item.id] = nextQuantity;
      return next;
    });
  }

  async function createQuote() {
    if (pharmacyId === undefined || cartLines.length === 0 || currencies.size !== 1) return;
    setSubmitting(true);
    try {
      await productionPrescriptionService.patient.createDirectQuote(
        pharmacyId,
        {
          lines: cartLines.map(({ item, quantity }) => ({ catalogItemId: item.id, quantity })),
          validForSeconds: DIRECT_QUOTE_TTL_SECONDS,
        },
        crypto.randomUUID(),
      );
      toast.success("Secure quote created. Review it before payment.");
      navigate("patient", "orders");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Quote could not be created");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <SkeletonGrid count={5} />;
  if (pharmacyId === undefined || error !== null) {
    return <EmptyState title="Pharmacy catalogue unavailable" description={error ?? undefined} />;
  }

  return (
    <div className="space-y-5 pb-28">
      <PageHeader
        back
        title={view.params.name || "Pharmacy catalogue"}
        description={view.params.location || "Browse available pharmacy products."}
      />
      <SectionCard>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 ring-1 ring-amber-100">
            <Pill className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <p className="font-semibold">{view.params.name || "Verified pharmacy"}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified organization
            </p>
          </div>
        </div>
      </SectionCard>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search medicines and products…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={[
          { label: "All", value: "all" },
          { label: "OTC (direct)", value: "otc" },
          { label: "Rx only", value: "rx" },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState compact icon={Pill} title="No matching products" />
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card">
          {filtered.map((item) => {
            const quantity = cart[item.id] ?? 0;
            const restricted = !item.directOrderEligible;
            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {item.name}
                      {item.strength === null ? "" : ` ${item.strength}`}
                    </p>
                    <Badge
                      variant="outline"
                      className={restricted ? "text-rose-700" : "text-emerald-700"}
                    >
                      {restricted ? <Lock className="mr-1 h-3 w-3" /> : null}
                      {restricted ? "Rx" : "OTC"}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.category.name} · {item.dosageForm.name}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-primary">
                    {formatMinorCurrency(item.unitPriceMinor, item.currency)}
                  </p>
                </div>
                {restricted ? (
                  <span className="max-w-28 text-right text-xs text-muted-foreground">
                    {item.available ? "Prescription required" : "Unavailable"}
                  </span>
                ) : quantity === 0 ? (
                  <Button size="sm" variant="outline" onClick={() => changeQuantity(item, 1)}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      size="iconSm"
                      variant="outline"
                      onClick={() => changeQuantity(item, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
                    <Button size="iconSm" variant="outline" onClick={() => changeQuantity(item, 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        Prescription-only products cannot enter a direct cart. Use a platform prescription or the
        prescription-upload flow when available.
      </div>

      {cartLines.length > 0 && currency !== undefined ? (
        <div className="fixed inset-x-0 bottom-16 z-30 mx-auto flex max-w-xl items-center justify-between gap-4 border-t bg-background/95 p-4 shadow-lg backdrop-blur md:bottom-0 md:rounded-t-xl md:border-x">
          <div>
            <p className="text-xs text-muted-foreground">{cartLines.length} cart item(s)</p>
            <p className="font-semibold">
              {formatMinorCurrency(subtotalMinor.toString(), currency)}
            </p>
          </div>
          <Button disabled={submitting || currencies.size !== 1} onClick={() => void createQuote()}>
            <ShoppingCart className="h-4 w-4" />
            {submitting ? "Creating quote…" : "Review secure quote"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
