"use client";

import { useMemo } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard, MiniMetric } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, SectionCard, EmptyState, SkeletonGrid, ErrorState,
} from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, relativeDay } from "@/lib/format";
import {
  FileText, ShoppingCart, AlertTriangle, Package, CheckCircle2,
  CalendarClock, Wallet, Receipt, ArrowRight, Pill, Clock,
  Building2, TrendingUp,
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

  const newRx = useMemo(
    () => prescriptions.filter((p) => ["issued", "awaiting_pharmacy"].includes(p.status)),
    [prescriptions]
  );
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

  const todayOrders = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return orders.filter((o) => (o.createdAt ?? "").slice(0, 10) === todayStr);
  }, [orders]);
  const todaySales = todayOrders.reduce((s, o) => s + o.subtotal, 0);
  const todayCommission = todayOrders.reduce((s, o) => s + o.commissionTotal, 0);

  const pendingSettlements = settlements.filter((s) => s.status === "pending");
  const pendingSettlementNet = pendingSettlements.reduce((s, x) => s + x.netAmount, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
        <SkeletonGrid count={4} />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 h-72 bg-muted/40 animate-pulse rounded-2xl" />
          <div className="h-72 bg-muted/40 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const firstName = profile?.name?.split(" ")[0] ?? sessionName?.split(" ")[0] ?? "Pharmacy";

  const quickActions = [
    { label: "New Rx", sub: "Review", icon: FileText, page: "prescriptions", tone: "text-sky-600" as const },
    { label: "Orders", sub: "Fulfil", icon: ShoppingCart, page: "orders", tone: "text-amber-600" as const },
    { label: "Inventory", sub: "Stock", icon: Package, page: "inventory", tone: "text-emerald-600" as const },
    { label: "Products", sub: "Catalogue", icon: Pill, page: "products", tone: "text-violet-600" as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={profile ? `${profile.name} · ${profile.city}, ${profile.state}` : "Pharmacy dashboard"}
        actions={
          <Button onClick={() => navigate("pharmacy", "prescriptions")}>
            <FileText className="h-4 w-4" /> Review prescriptions
          </Button>
        }
      />

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickActions.map((a) => (
          <button
            key={a.label}
            onClick={() => navigate("pharmacy", a.page as any)}
            className="group rounded-2xl border border-border/80 bg-card p-4 text-left shadow-soft hover:shadow-soft-md hover:border-primary/30 transition-all tap-highlight-none"
          >
            <div className="rounded-xl bg-muted/60 p-2 w-fit group-hover:bg-primary/10 transition-colors">
              <a.icon className={`h-5 w-5 ${a.tone}`} />
            </div>
            <p className="text-sm font-semibold mt-2.5 leading-tight">{a.label}</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{a.sub}</p>
          </button>
        ))}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="New Rx" value={newRx.length} icon={FileText} tone="info" hint="Awaiting review" onClick={() => navigate("pharmacy", "prescriptions")} />
        <MetricCard label="Orders to accept" value={awaitingAcceptance.length} icon={ShoppingCart} tone="warning" hint="Paid · under review" onClick={() => navigate("pharmacy", "orders")} />
        <MetricCard label="Preparing" value={preparingOrders.length} icon={Package} tone="info" onClick={() => navigate("pharmacy", "orders")} />
        <MetricCard label="Ready for pickup" value={readyOrders.length} icon={CheckCircle2} tone="success" onClick={() => navigate("pharmacy", "orders")} />
      </div>

      {/* Finance row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Today's sales" value={formatCurrency(todaySales)} icon={Wallet} tone="success" hint={`${todayOrders.length} order(s) today`} />
        <MetricCard label="Commission today" value={formatCurrency(todayCommission)} icon={Receipt} tone="info" hint={`${profile?.commissionPct ?? 0}% platform rate`} />
        <MetricCard label="Low stock" value={lowStock.length} icon={AlertTriangle} tone="danger" hint="< 10 units" onClick={() => navigate("pharmacy", "inventory")} />
        <MetricCard label="Pending settlement" value={formatCurrency(pendingSettlementNet)} icon={CalendarClock} tone="warning" hint={`${pendingSettlements.length} period(s)`} onClick={() => navigate("pharmacy", "settlements")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Left: queues */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard
            title="New prescriptions"
            icon={FileText}
            action={<Button variant="ghost" size="sm" onClick={() => navigate("pharmacy", "prescriptions")}>View all <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>}
            dense
          >
            {newRx.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={FileText} title="No new prescriptions" description="Prescriptions sent to your pharmacy will appear here." compact />
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {newRx.slice(0, 6).map((rx) => (
                  <li key={rx.id}>
                    <button
                      onClick={() => navigate("pharmacy", "prescription", { id: rx.id })}
                      className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-accent/40 transition-colors tap-highlight-none"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 ring-1 ring-sky-100 shrink-0">
                        <FileText className="h-4 w-4 text-sky-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{rx.prescriptionNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : "—"} · Dr. {rx.provider?.lastName ?? "—"} · {rx.items?.length ?? 0} item(s)
                        </p>
                      </div>
                      <StatusBadge status={rx.status} size="sm" />
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Orders awaiting acceptance"
            icon={ShoppingCart}
            action={<Button variant="ghost" size="sm" onClick={() => navigate("pharmacy", "orders")}>View all <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>}
            dense
          >
            {awaitingAcceptance.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={ShoppingCart} title="No orders awaiting acceptance" description="Paid orders will appear here for your review." compact />
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {awaitingAcceptance.slice(0, 6).map((o) => (
                  <li key={o.id}>
                    <button
                      onClick={() => navigate("pharmacy", "order", { id: o.id })}
                      className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-accent/40 transition-colors tap-highlight-none"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 ring-1 ring-amber-100 shrink-0">
                        <ShoppingCart className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{o.orderNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · {formatCurrency(o.total)} · {relativeDay(o.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={o.status} size="sm" />
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {(preparingOrders.length > 0 || readyOrders.length > 0) && (
            <SectionCard
              title="Active fulfilment"
              icon={Package}
              description="Orders being prepared or ready for pickup"
              dense
            >
              <ul className="divide-y divide-border/60">
                {[...preparingOrders, ...readyOrders].slice(0, 6).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · {o.items?.length ?? 0} item(s)
                      </p>
                    </div>
                    <StatusBadge status={o.status} size="sm" />
                    <Button size="sm" variant="outline" onClick={() => navigate("pharmacy", "order", { id: o.id })}>
                      Continue <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>

        {/* Right: alerts */}
        <div className="space-y-6">
          {clarificationOrders.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-100 p-2 shrink-0">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Clarification required</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                    {clarificationOrders.length} order(s) waiting for your response.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3 border-amber-300 text-amber-700 hover:bg-amber-100" onClick={() => navigate("pharmacy", "orders")}>
                    Review <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Low stock — amber-tinted alert card */}
          <SectionCard
            title="Low stock"
            description="Below 10 units"
            icon={AlertTriangle}
            action={
              lowStock.length > 0 ? (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 h-6">{lowStock.length}</Badge>
              ) : undefined
            }
            dense
          >
            {lowStock.length === 0 ? (
              <div className="p-5 text-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium">All products well stocked.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                {lowStock.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.strength} · {p.dosageForm}</p>
                    </div>
                    <span className={`text-sm font-bold ${p.stockQuantity === 0 ? "text-rose-600" : "text-amber-600"}`}>
                      {p.stockQuantity} left
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Near expiry — amber-tinted alert card */}
          <SectionCard
            title="Near expiry"
            description="Within 90 days"
            icon={CalendarClock}
            action={
              nearExpiry.length > 0 ? (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 h-6">{nearExpiry.length}</Badge>
              ) : undefined
            }
            dense
          >
            {nearExpiry.length === 0 ? (
              <div className="p-5 text-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium">No products expiring soon.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                {nearExpiry.slice(0, 8).map((p) => {
                  const days = daysUntil(p.expiryDate);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">Batch {p.batch ?? "—"}</p>
                      </div>
                      <span className={`text-xs font-medium ${days < 30 ? "text-rose-600" : "text-amber-600"}`}>
                        {days < 0 ? "Expired" : formatDate(p.expiryDate)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          {profile && (
            <SectionCard title="Platform commission" icon={Receipt}>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <MiniMetric label="Platform rate" value={`${profile.commissionPct}%`} tone="info" />
                <MiniMetric label="Set by" value="Admin" />
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("pharmacy", "commissions")}>
                <TrendingUp className="h-3.5 w-3.5 mr-1" /> View commission reports
              </Button>
            </SectionCard>
          )}

          {profile && (
            <SectionCard title="Pharmacy" icon={Building2}>
              <dl className="text-sm space-y-2.5">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Pharmacy No.</dt>
                  <dd className="font-medium font-mono text-xs">{profile.pharmacyNumber}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Verification</dt>
                  <dd><StatusBadge status={profile.verificationStatus} size="sm" /></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Rating</dt>
                  <dd className="font-medium">★ {profile.rating.toFixed(1)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium text-right">{profile.phone}</dd>
                </div>
              </dl>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
