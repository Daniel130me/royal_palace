"use client";

import { useMemo } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, relativeDay } from "@/lib/format";
import {
  FileText, ShoppingCart, AlertTriangle, Package, CheckCircle2,
  CalendarClock, Wallet, Receipt, ArrowRight, Clock,
} from "lucide-react";

const NEAR_EXPIRY_DAYS = 90;
const LOW_STOCK_THRESHOLD = 10;

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function PharmacyDashboard() {
  const {
    profile, loading, error, refresh,
    prescriptions, orders, products, settlements,
  } = usePharmacyContext();
  const { sessionName } = useNav();

  // New prescriptions (issued / awaiting_pharmacy)
  const newRx = useMemo(
    () => prescriptions.filter((p) => ["issued", "awaiting_pharmacy"].includes(p.status)),
    [prescriptions]
  );

  // Orders awaiting acceptance (paid / prescription_under_review)
  const awaitingAcceptance = useMemo(
    () => orders.filter((o) => ["paid", "prescription_under_review"].includes(o.status)),
    [orders]
  );
  const clarificationOrders = useMemo(
    () => orders.filter((o) => o.status === "clarification_required"),
    [orders]
  );
  const preparingOrders = useMemo(
    () => orders.filter((o) => o.status === "preparing"),
    [orders]
  );
  const readyOrders = useMemo(
    () => orders.filter((o) => o.status === "ready_for_pickup"),
    [orders]
  );

  const lowStock = useMemo(
    () => products.filter((p) => p.stockQuantity < LOW_STOCK_THRESHOLD && p.status === "active"),
    [products]
  );
  const nearExpiry = useMemo(
    () =>
      products
        .filter((p) => p.status === "active" && daysUntil(p.expiryDate) <= NEAR_EXPIRY_DAYS)
        .sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate)),
    [products]
  );

  // Today's sales & commission (orders created today)
  const todayOrders = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return orders.filter((o) => (o.createdAt ?? "").slice(0, 10) === todayStr);
  }, [orders]);
  const todaySales = todayOrders.reduce((s, o) => s + o.subtotal, 0);
  const todayCommission = todayOrders.reduce((s, o) => s + o.commissionTotal, 0);

  // Pending settlements
  const pendingSettlements = settlements.filter((s) => s.status === "pending");
  const pendingSettlementNet = pendingSettlements.reduce((s, x) => s + x.netAmount, 0);

  if (loading) return <LoadingState label="Loading your dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const firstName = profile?.name?.split(" ")[0] ?? sessionName?.split(" ")[0] ?? "Pharmacy";

  return (
    <div>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={profile ? `${profile.name} · ${profile.city}, ${profile.state}` : "Pharmacy dashboard"}
        actions={
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("pharmacy", "prescriptions")}>
            <FileText className="h-4 w-4 mr-1" /> Review prescriptions
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="New prescriptions"
          value={newRx.length}
          icon={FileText}
          tone="info"
          hint="Awaiting your review"
          onClick={() => navigate("pharmacy", "prescriptions")}
        />
        <MetricCard
          label="Orders to accept"
          value={awaitingAcceptance.length}
          icon={ShoppingCart}
          tone="warning"
          hint="Paid · under review"
          onClick={() => navigate("pharmacy", "orders")}
        />
        <MetricCard
          label="Preparing"
          value={preparingOrders.length}
          icon={Package}
          tone="info"
          onClick={() => navigate("pharmacy", "orders")}
        />
        <MetricCard
          label="Ready for pickup"
          value={readyOrders.length}
          icon={CheckCircle2}
          tone="success"
          onClick={() => navigate("pharmacy", "orders")}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Today's sales"
          value={formatCurrency(todaySales)}
          icon={Wallet}
          tone="success"
          hint={`${todayOrders.length} order(s) today`}
        />
        <MetricCard
          label="Commission today"
          value={formatCurrency(todayCommission)}
          icon={Receipt}
          tone="info"
          hint={`${profile?.commissionPct ?? 0}% platform rate`}
        />
        <MetricCard
          label="Low stock"
          value={lowStock.length}
          icon={AlertTriangle}
          tone="danger"
          hint="< 10 units"
          onClick={() => navigate("pharmacy", "inventory")}
        />
        <MetricCard
          label="Pending settlement"
          value={formatCurrency(pendingSettlementNet)}
          icon={CalendarClock}
          tone="warning"
          hint={`${pendingSettlements.length} period(s)`}
          onClick={() => navigate("pharmacy", "settlements")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: new prescriptions + awaiting acceptance */}
        <div className="lg:col-span-2 space-y-6">
          {/* New prescriptions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-sky-500" /> New prescriptions
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("pharmacy", "prescriptions")}>View all</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {newRx.length === 0 ? (
                <EmptyState icon={FileText} title="No new prescriptions" description="Prescriptions sent to your pharmacy will appear here." />
              ) : (
                newRx.slice(0, 6).map((rx) => (
                  <div key={rx.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{rx.prescriptionNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : "—"} ·{" "}
                        {rx.provider ? `Dr. ${rx.provider.lastName}` : "—"} ·{" "}
                        {rx.items?.length ?? 0} item(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={rx.status} />
                      <Button size="sm" variant="outline" onClick={() => navigate("pharmacy", "prescription", { id: rx.id })}>Review</Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Orders awaiting acceptance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-amber-500" /> Orders awaiting acceptance
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("pharmacy", "orders")}>View all</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {awaitingAcceptance.length === 0 ? (
                <EmptyState icon={ShoppingCart} title="No orders awaiting acceptance" description="Paid orders will appear here for your review." />
              ) : (
                awaitingAcceptance.slice(0, 6).map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · {formatCurrency(o.total)} · {relativeDay(o.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={o.status} />
                      <Button size="sm" variant="outline" onClick={() => navigate("pharmacy", "order", { id: o.id })}>Open</Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Preparing + ready for pickup */}
          {(preparingOrders.length > 0 || readyOrders.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-emerald-500" /> Active fulfilment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[...preparingOrders, ...readyOrders].slice(0, 6).map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · {o.items?.length ?? 0} item(s)
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate("pharmacy", "order", { id: o.id })}>
                      Continue <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: low stock, near expiry, clarification, settlements */}
        <div className="space-y-6">
          {/* Clarification required */}
          {clarificationOrders.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Clarification required
                </p>
                <p className="text-sm mt-1">{clarificationOrders.length} order(s) waiting for your response.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("pharmacy", "orders")}>
                  Review <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Low stock */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" /> Low stock
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("pharmacy", "inventory")}>All inventory</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {lowStock.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">All products well stocked.</p>
              ) : (
                lowStock.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.strength} · {p.dosageForm}</p>
                    </div>
                    <span className={`font-semibold ${p.stockQuantity === 0 ? "text-rose-600" : "text-amber-600"}`}>
                      {p.stockQuantity} left
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Near expiry */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-500" /> Near expiry
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("pharmacy", "inventory")}>View</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {nearExpiry.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">No products expiring soon.</p>
              ) : (
                nearExpiry.slice(0, 6).map((p) => {
                  const days = daysUntil(p.expiryDate);
                  return (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">Batch {p.batch ?? "—"}</p>
                      </div>
                      <span className={`font-medium ${days < 30 ? "text-rose-600" : "text-amber-600"}`}>
                        {days < 0 ? "Expired" : `${formatDate(p.expiryDate)}`}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Settlement snapshot */}
          {profile && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-sky-500" /> Platform commission
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform rate</span>
                  <span className="font-medium">{profile.commissionPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Set by</span>
                  <span className="text-xs">Royal Palace (admin)</span>
                </div>
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => navigate("pharmacy", "commissions")}>
                  View commission reports
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
