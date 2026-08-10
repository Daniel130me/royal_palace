"use client";

import { useMemo } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, EmptyState, SkeletonGrid, ErrorState,
} from "@/components/healthcare/page-header";
import { StatTile, CompactListItem } from "@/components/healthcare/compact-list";
import { formatCurrency, formatDate, relativeDay, initials } from "@/lib/format";
import {
  FileText, ShoppingCart, AlertTriangle, Package, CheckCircle2,
  CalendarClock, Wallet, Receipt, ArrowRight, Pill, Clock,
  Building2, TrendingUp, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  const pendingSettlements = settlements.filter((s) => s.status === "pending");
  const pendingSettlementNet = pendingSettlements.reduce((s, x) => s + x.netAmount, 0);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-24 bg-muted/40 animate-pulse rounded-2xl" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const firstName = profile?.name?.split(" ")[0] ?? sessionName?.split(" ")[0] ?? "Pharmacy";
  const actionNeededCount = newRx.length + awaitingAcceptance.length + clarificationOrders.length + preparingOrders.length + readyOrders.length;

  return (
    <div className="space-y-5">
      {/* Greeting + pharmacy tag */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground leading-tight">Welcome back,</p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight truncate">{firstName} 👋</h1>
          {profile && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{profile.name} · {profile.city}, {profile.state}</p>
          )}
        </div>
        <Button size="sm" onClick={() => navigate("pharmacy", "prescriptions")} className="shrink-0">
          <FileText className="h-4 w-4" /> Review Rx
        </Button>
      </div>

      {/* Hero: orders needing action */}
      {actionNeededCount > 0 ? (
        <button
          onClick={() => navigate("pharmacy", "orders")}
          className="w-full rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-left shadow-soft transition-all hover:shadow-soft-md active:scale-[0.99] tap-highlight-none"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-xl bg-amber-100 p-2.5 shrink-0">
                <ShoppingCart className="h-5 w-5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-900 leading-tight">
                  {actionNeededCount} order{actionNeededCount === 1 ? "" : "s"} need action
                </p>
                <p className="text-xs text-amber-700 mt-0.5 truncate">
                  {awaitingAcceptance.length} to accept · {preparingOrders.length} preparing · {readyOrders.length} ready
                  {clarificationOrders.length > 0 && ` · ${clarificationOrders.length} clarification`}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-amber-700 shrink-0" />
          </div>
        </button>
      ) : (
        <button
          onClick={() => navigate("pharmacy", "prescriptions")}
          className="w-full rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-left text-white shadow-soft-md active:scale-[0.99] transition-transform tap-highlight-none"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-50/90">All caught up</p>
              <p className="text-xl font-bold mt-1">Review new prescriptions</p>
              <p className="text-xs text-emerald-100/80 mt-1">{newRx.length} new Rx awaiting review</p>
            </div>
            <div className="rounded-full bg-white/20 p-3">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>
        </button>
      )}

      {/* StatTiles row */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="New Rx" value={newRx.length} icon={FileText} tone="info" onClick={() => navigate("pharmacy", "prescriptions")} />
        <StatTile label="To accept" value={awaitingAcceptance.length} icon={ShoppingCart} tone="warning" onClick={() => navigate("pharmacy", "orders")} />
        <StatTile label="Preparing" value={preparingOrders.length} icon={Package} tone="info" onClick={() => navigate("pharmacy", "orders")} />
        <StatTile label="Sales today" value={formatCurrency(todaySales)} icon={Wallet} tone="success" onClick={() => navigate("pharmacy", "commissions")} />
      </div>

      {/* Alert cards: low stock + near expiry */}
      {(lowStock.length > 0 || nearExpiry.length > 0) && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => navigate("pharmacy", "inventory")}
            className={cn(
              "flex flex-col gap-1 rounded-xl border bg-card p-3 text-left transition-all hover:shadow-soft tap-highlight-none active:scale-[0.98]",
              lowStock.length > 0 ? "border-amber-200 bg-amber-50/40" : "border-border/60"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-amber-700 leading-none">Low stock</span>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <span className="text-lg font-bold leading-none tracking-tight text-amber-700">{lowStock.length}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">Below {LOW_STOCK_THRESHOLD} units</span>
          </button>
          <button
            onClick={() => navigate("pharmacy", "inventory")}
            className={cn(
              "flex flex-col gap-1 rounded-xl border bg-card p-3 text-left transition-all hover:shadow-soft tap-highlight-none active:scale-[0.98]",
              nearExpiry.length > 0 ? "border-amber-200 bg-amber-50/40" : "border-border/60"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-amber-700 leading-none">Near expiry</span>
              <CalendarClock className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <span className="text-lg font-bold leading-none tracking-tight text-amber-700">{nearExpiry.length}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">Within {NEAR_EXPIRY_DAYS} days</span>
          </button>
        </div>
      )}

      {/* Action needed: compact list */}
      {(awaitingAcceptance.length > 0 || newRx.length > 0 || preparingOrders.length > 0 || readyOrders.length > 0) && (
        <div className="space-y-2">
          <SectionLabel>Action needed</SectionLabel>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {awaitingAcceptance.slice(0, 2).map((o) => (
              <CompactListItem
                key={o.id}
                leading={<div className="rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100"><ShoppingCart className="h-4 w-4 text-amber-600" /></div>}
                title={o.orderNumber}
                subtitle={`${o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · ${formatCurrency(o.total)} · ${relativeDay(o.createdAt)}`}
                trailing={<StatusBadge status={o.status} size="sm" />}
                onClick={() => navigate("pharmacy", "order", { id: o.id })}
                chevron
              />
            ))}
            {newRx.slice(0, 2).map((rx) => (
              <CompactListItem
                key={rx.id}
                leading={<div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100"><FileText className="h-4 w-4 text-sky-600" /></div>}
                title={rx.prescriptionNumber}
                subtitle={`${rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : "—"} · Dr. ${rx.provider?.lastName ?? "—"} · ${rx.items?.length ?? 0} item(s)`}
                trailing={<StatusBadge status={rx.status} size="sm" />}
                onClick={() => navigate("pharmacy", "prescription", { id: rx.id })}
                chevron
              />
            ))}
            {preparingOrders.slice(0, 1).map((o) => (
              <CompactListItem
                key={o.id}
                leading={<div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100"><Package className="h-4 w-4 text-sky-600" /></div>}
                title={`Preparing · ${o.orderNumber}`}
                subtitle={`${o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · ${o.items?.length ?? 0} item(s)`}
                trailing={<StatusBadge status={o.status} size="sm" />}
                onClick={() => navigate("pharmacy", "order", { id: o.id })}
                chevron
              />
            ))}
            {readyOrders.slice(0, 1).map((o) => (
              <CompactListItem
                key={o.id}
                leading={<div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>}
                title={`Ready for pickup · ${o.orderNumber}`}
                subtitle={`${o.patient ? `${o.patient.firstName} ${o.patient.lastName}` : "—"} · awaiting logistics`}
                trailing={<StatusBadge status={o.status} size="sm" />}
                onClick={() => navigate("pharmacy", "order", { id: o.id })}
                chevron
              />
            ))}
          </div>
        </div>
      )}

      {/* Clarification required — amber alert */}
      {clarificationOrders.length > 0 && (
        <button
          onClick={() => navigate("pharmacy", "orders")}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left flex items-center gap-3 hover:bg-amber-100/60 transition-colors tap-highlight-none"
        >
          <div className="rounded-lg bg-amber-100 p-2 shrink-0">
            <Clock className="h-4 w-4 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">Clarification required</p>
            <p className="text-xs text-amber-700 truncate">{clarificationOrders.length} order(s) awaiting your response</p>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-700 shrink-0" />
        </button>
      )}

      {/* Finance quick row */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Commission today" value={formatCurrency(todayOrders.reduce((s, o) => s + o.commissionTotal, 0))} icon={Receipt} tone="info" />
        <StatTile label="Pending settle" value={formatCurrency(pendingSettlementNet)} icon={CalendarClock} tone="warning" onClick={() => navigate("pharmacy", "settlements")} />
      </div>

      {/* Pharmacy quick info */}
      {profile && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-xl bg-primary/10 p-2 shrink-0">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{profile.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{profile.pharmacyNumber}</p>
            </div>
            <StatusBadge status={profile.verificationStatus} size="sm" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rating</p>
              <p className="text-sm font-bold">★ {profile.rating.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Commission</p>
              <p className="text-sm font-bold text-emerald-700">{profile.commissionPct}%</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</p>
              <p className="text-sm font-bold text-amber-700">{pendingSettlements.length}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => navigate("pharmacy", "commissions")}>
            <TrendingUp className="h-3.5 w-3.5 mr-1" /> View commission reports
          </Button>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{children}</p>;
}
