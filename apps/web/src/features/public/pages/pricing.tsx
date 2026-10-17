"use client";

import type { PublicServicePrice } from "@royal-palace/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader, LoadingState } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMinorCurrency } from "@/lib/format";
import { groupPublicPrices } from "@/lib/public-content";
import { publicDiscoveryService } from "@/lib/services";

const PRICE_PAGE_SIZE = 25;

export function PublicPricing() {
  const [prices, setPrices] = useState<readonly PublicServicePrice[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    publicDiscoveryService
      .prices({ limit: PRICE_PAGE_SIZE }, controller.signal)
      .then((response) => {
        setPrices(response.data);
        setCursor(response.pageInfo.endCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Pricing is unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadToken]);

  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await publicDiscoveryService.prices({ cursor, limit: PRICE_PAGE_SIZE });
      setPrices((current) => [...current, ...response.data]);
      setCursor(response.pageInfo.endCursor);
      setHasNextPage(response.pageInfo.hasNextPage);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Pricing is unavailable");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const groups = useMemo(() => groupPublicPrices(prices), [prices]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        title="Service costs"
        description="Current administrator-approved patient prices. Currency is shown exactly as configured for each service."
      />
      <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        The final payable amount is confirmed inside the relevant booking or order flow before
        payment. Availability, taxes, delivery and other qualified charges may vary by service and
        region.
      </div>
      {loading ? (
        <LoadingState label="Loading current service prices…" />
      ) : error && prices.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="font-medium text-destructive">Current prices could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-4" onClick={() => setReloadToken((value) => value + 1)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No public service prices are currently effective. Exact amounts will still be shown in
            an eligible booking or order before payment.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.category}>
              <h2 className="mb-3 font-semibold">{group.category}</h2>
              <Card>
                <CardContent className="divide-y p-0">
                  {group.prices.map((price) => (
                    <div
                      className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                      key={`${price.service.id}:${price.currency}:${price.effectiveFrom}`}
                    >
                      <div>
                        <p className="text-sm font-medium">{price.service.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Effective from {formatDate(price.effectiveFrom)}
                          {price.effectiveUntil
                            ? ` until ${formatDate(price.effectiveUntil)}`
                            : " until replaced"}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-muted-foreground">Listed patient price</p>
                        <p className="font-semibold tabular-nums">
                          {formatMinorCurrency(price.patientPriceMinor, price.currency)}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          ))}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {hasNextPage ? (
            <div className="flex justify-center">
              <Button disabled={loadingMore} onClick={loadMore} variant="outline">
                {loadingMore ? "Loading…" : "Load more prices"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
