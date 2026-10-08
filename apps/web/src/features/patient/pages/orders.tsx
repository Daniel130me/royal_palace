"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Package, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  PageHeader,
  SectionCard,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type Quote = PrescriptionComponents["schemas"]["PharmacyQuote"];
type Order = PrescriptionComponents["schemas"]["PharmacyOrder"];

export function PatientOrders() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [quotePage, orderPage] = await Promise.all([
        productionPrescriptionService.patient.quotes(),
        productionPrescriptionService.patient.orders(),
      ]);
      setQuotes([...quotePage.data]);
      setOrders([...orderPage.data]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pharmacy activity could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(quote: Quote) {
    setBusyId(quote.id);
    try {
      const order = await productionPrescriptionService.patient.acceptQuote(
        quote.id,
        quote.version,
        crypto.randomUUID(),
      );
      toast.success("Quote accepted. Complete payment in the secure checkout flow.");
      navigate("patient", "order", { id: order.id });
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Quote could not be accepted");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Pharmacy orders" description="Review quotes and track accepted orders." />
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null ? (
        <EmptyState title="Could not load pharmacy activity" description={error} />
      ) : (
        <>
          <SectionCard title="Quotes awaiting your decision" icon={Receipt} dense>
            {quotes.filter((quote) => quote.status === "ACTIVE").length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No active quotes.</p>
            ) : (
              <ul className="divide-y">
                {quotes
                  .filter((quote) => quote.status === "ACTIVE")
                  .map((quote) => (
                    <li
                      key={quote.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{quote.quoteNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatMinorCurrency(quote.totalMinor, quote.currency)} · expires{" "}
                          {formatDate(quote.expiresAt)}
                        </p>
                      </div>
                      <Button onClick={() => accept(quote)} disabled={busyId === quote.id}>
                        Review and accept
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Orders" icon={Package} dense>
            {orders.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No accepted pharmacy orders.</p>
            ) : (
              <ul className="divide-y">
                {orders.map((order) => (
                  <li key={order.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/40"
                      onClick={() => navigate("patient", "order", { id: order.id })}
                    >
                      <div>
                        <p className="font-medium">{order.orderNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatMinorCurrency(order.quote.totalMinor, order.quote.currency)} ·{" "}
                          {formatDate(order.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={order.status.toLowerCase()} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
