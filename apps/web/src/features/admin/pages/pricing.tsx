"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicService, ServicePriceResponse } from "@royal-palace/contracts";
import { History, Pencil, Tag } from "lucide-react";
import { toast } from "sonner";

import { CompactListItem } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionServicePricingService, publicDiscoveryService } from "@/lib/services";

interface PricedService extends PublicService {
  prices: readonly ServicePriceResponse[];
}

export function AdminPricing() {
  const [services, setServices] = useState<readonly PricedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<PricedService | null>(null);
  const [historyFor, setHistoryFor] = useState<PricedService | null>(null);
  const [currency, setCurrency] = useState("");
  const [patientPrice, setPatientPrice] = useState("");
  const [providerPayout, setProviderPayout] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [hospitalCatalogue, pharmacyCatalogue, laboratoryCatalogue, priceList] =
        await Promise.all([
          publicDiscoveryService.services("HOSPITAL"),
          publicDiscoveryService.services("PHARMACY"),
          publicDiscoveryService.services("LABORATORY"),
          productionServicePricingService.list(),
        ]);
      const catalogue = new Map(
        [...hospitalCatalogue.data, ...pharmacyCatalogue.data, ...laboratoryCatalogue.data].map(
          (service) => [service.id, service],
        ),
      );
      const byService = new Map<string, ServicePriceResponse[]>();
      for (const price of priceList.data) {
        const current = byService.get(price.service.id) ?? [];
        current.push(price);
        byService.set(price.service.id, current);
      }
      setServices(
        [...catalogue.values()].map((service) => ({
          ...service,
          prices: (byService.get(service.id) ?? []).toSorted(
            (a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
          ),
        })),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load service pricing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const categories = useMemo(
    () => ["all", ...new Set(services.map((service) => service.category))],
    [services],
  );
  const filtered =
    category === "all" ? services : services.filter((service) => service.category === category);
  const activeCount = services.filter((service) => activePrice(service) !== undefined).length;

  const openEdit = (service: PricedService) => {
    const active = activePrice(service);
    const selectedCurrency = active?.currency ?? "";
    setEditing(service);
    setCurrency(selectedCurrency);
    setPatientPrice(
      active === undefined ? "" : minorToDecimal(active.patientPriceMinor, selectedCurrency),
    );
    setProviderPayout(
      active === undefined ? "" : minorToDecimal(active.providerPayoutMinor, selectedCurrency),
    );
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    if (editing === null) return;
    try {
      const normalizedCurrency = currency.trim().toUpperCase();
      const patientPriceMinor = decimalToMinor(patientPrice, normalizedCurrency);
      const providerPayoutMinor = decimalToMinor(providerPayout, normalizedCurrency, true);
      if (compareMinor(providerPayoutMinor, patientPriceMinor) > 0) {
        toast.error("Provider payout cannot exceed the patient price.");
        return;
      }
      setSubmitting(true);
      const draft = await productionServicePricingService.create({
        currency: normalizedCurrency,
        effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`).toISOString(),
        patientPriceMinor,
        providerPayoutMinor,
        serviceId: editing.id,
      });
      await productionServicePricingService.activate(draft.id, draft.version);
      toast.success(`Pricing activated for ${editing.name}.`);
      setEditing(null);
      await load();
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Failed to update pricing");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={3} />
      </div>
    );
  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pricing"
        description="Admin-controlled patient prices and provider payouts. Every change preserves an immutable history."
        breadcrumbs={[
          { label: "Admin", onClick: () => navigate("admin", "dashboard") },
          { label: "Pricing" },
        ]}
        actions={
          <span className="text-xs text-muted-foreground">
            <strong className="text-foreground">{activeCount}</strong> active prices
          </span>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={category === value ? "default" : "outline"}
            onClick={() => setCategory(value)}
          >
            {value === "all" ? "All" : value}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No services"
          description="No active services are available in this category."
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {filtered.map((service) => {
            const active = activePrice(service);
            return (
              <CompactListItem
                key={service.id}
                leading={
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Tag className="h-4 w-4 text-primary" />
                  </div>
                }
                title={service.name}
                subtitle={
                  active === undefined
                    ? "No active price"
                    : `${formatMinorCurrency(active.patientPriceMinor, active.currency)} patient · ${formatMinorCurrency(active.providerPayoutMinor, active.currency)} provider payout`
                }
                trailing={
                  <div className="flex items-center gap-2">
                    {active && <StatusBadge status="active" />}
                    {service.prices.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          setHistoryFor(service);
                        }}
                        aria-label={`View ${service.name} price history`}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(service);
                      }}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Set price
                    </Button>
                  </div>
                }
                onClick={() => openEdit(service)}
              />
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set pricing — {editing?.name}</DialogTitle>
            <DialogDescription>
              A new governed price is created and activated. The previous active price is retired,
              not overwritten.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency (ISO 4217)" id="currency">
              <Input
                id="currency"
                value={currency}
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                placeholder="e.g. USD"
              />
            </Field>
            <Field label="Effective from" id="effectiveFrom">
              <Input
                id="effectiveFrom"
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </Field>
            <Field label={`Patient price (${currency || "currency"})`} id="patientPrice">
              <Input
                id="patientPrice"
                inputMode="decimal"
                value={patientPrice}
                onChange={(event) => setPatientPrice(event.target.value)}
              />
            </Field>
            <Field label={`Provider payout (${currency || "currency"})`} id="providerPayout">
              <Input
                id="providerPayout"
                inputMode="decimal"
                value={providerPayout}
                onChange={(event) => setProviderPayout(event.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? "Activating…" : "Create and activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyFor !== null} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{historyFor?.name} history</DialogTitle>
            <DialogDescription>
              Approved commercial terms are retained for audit and booking snapshots.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {historyFor?.prices.map((price) => (
              <div key={price.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {formatMinorCurrency(price.patientPriceMinor, price.currency)}
                  </span>
                  <StatusBadge status={price.status.toLowerCase()} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Provider payout {formatMinorCurrency(price.providerPayoutMinor, price.currency)} ·
                  Effective {formatDate(price.effectiveFrom)}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ children, id, label }: { children: ReactNode; id: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function activePrice(service: PricedService) {
  return service.prices.find((price) => price.status === "ACTIVE");
}

function currencyDigits(currency: string) {
  try {
    return (
      new Intl.NumberFormat("en", { currency, style: "currency" }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    throw new Error("Enter a valid three-letter currency code");
  }
}

function decimalToMinor(value: string, currency: string, allowZero = false) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Enter a valid three-letter currency code");
  const digits = currencyDigits(currency);
  const match = value.trim().match(new RegExp(`^(\\d+)(?:\\.(\\d{1,${digits}}))?$`));
  if (match === null) throw new Error(`Enter an amount with no more than ${digits} decimal places`);
  const minor = normalizeMinor(`${match[1] ?? "0"}${(match[2] ?? "").padEnd(digits, "0")}`);
  if (!allowZero && minor === "0") throw new Error("Patient price must be greater than zero");
  return minor;
}

function minorToDecimal(value: string, currency: string) {
  const digits = currencyDigits(currency);
  if (digits === 0) return value;
  return `${value.slice(0, -digits) || "0"}.${value.slice(-digits).padStart(digits, "0")}`;
}

function normalizeMinor(value: string) {
  return value.replace(/^0+(?=\d)/, "") || "0";
}

function compareMinor(left: string, right: string) {
  const normalizedLeft = normalizeMinor(left);
  const normalizedRight = normalizeMinor(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length > normalizedRight.length ? 1 : -1;
  }
  return normalizedLeft.localeCompare(normalizedRight);
}
