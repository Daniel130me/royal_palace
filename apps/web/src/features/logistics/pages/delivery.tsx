"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Hash,
  History,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  EmptyState,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { navigate, useNav } from "@/lib/nav";
import { productionLogisticsService } from "@/lib/services";

import {
  DELIVERY_TIMELINE,
  formatAddress,
  formatDateTime,
  NEXT_ACTION,
  statusForBadge,
} from "../delivery-helpers";
import type { LogisticsDelivery, LogisticsHistoryItem } from "../logistics-types";
import { isTerminalLogisticsStatus } from "../logistics-types";
import { useLogisticsContext } from "../use-logistics-context";

export function LogisticsDeliveryDetail() {
  const { view, sessionName } = useNav();
  const deliveryId = view.params.id;
  const {
    deliveries,
    error: queueError,
    logisticsId,
    refresh,
    transition,
    verifyRecipientCode,
  } = useLogisticsContext();
  const [delivery, setDelivery] = useState<LogisticsDelivery | null>(null);
  const [history, setHistory] = useState<LogisticsHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!deliveryId || !logisticsId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const queued = deliveries.find((item) => item.id === deliveryId);
    void Promise.all([
      queued ?? productionLogisticsService.organization.get(logisticsId, deliveryId),
      productionLogisticsService.organization.history(logisticsId, deliveryId),
    ])
      .then(([item, historyPage]) => {
        if (!active) return;
        setDelivery(item);
        setHistory(historyPage.data);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "The delivery could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deliveries, deliveryId, logisticsId]);

  async function progress() {
    if (!delivery) return;
    const action = NEXT_ACTION[delivery.status];
    if (!action) return;
    if (action.to === "DELIVERED") {
      setCode("");
      setDialogOpen(true);
      return;
    }
    setBusy(true);
    try {
      const updated = await transition(delivery, action.to);
      setDelivery(updated);
      toast.success(`${delivery.deliveryNumber} updated.`);
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The delivery could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelivery() {
    if (!delivery || !/^\d{8}$/.test(code)) {
      toast.error("Enter the 8-digit code provided by the recipient.");
      return;
    }
    setBusy(true);
    try {
      const updated = await verifyRecipientCode(delivery, code);
      setDelivery(updated);
      setCode("");
      setDialogOpen(false);
      toast.success("Recipient code verified and delivery completed.");
      await refresh();
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "The recipient code could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!deliveryId)
    return (
      <EmptyState
        icon={Package}
        title="No delivery selected"
        description="Choose a delivery from Assignments."
        action={
          <Button onClick={() => navigate("logistics", "assignments")}>Go to assignments</Button>
        }
      />
    );
  if (loading && delivery === null) return <LoadingState label="Loading delivery…" />;
  if ((error ?? queueError) !== null && delivery === null)
    return (
      <ErrorState
        message={error ?? queueError ?? "The delivery could not be loaded."}
        onRetry={() => void refresh()}
      />
    );
  if (!delivery)
    return (
      <EmptyState
        icon={Package}
        title="Delivery not found"
        description="It may no longer be assigned to this organization."
        action={
          <Button onClick={() => navigate("logistics", "assignments")}>Back to assignments</Button>
        }
      />
    );

  const action = NEXT_ACTION[delivery.status];
  const delivered = delivery.status === "DELIVERED";
  const terminalException = isTerminalLogisticsStatus(delivery.status) && !delivered;
  const historyByStatus = new Map(history.map((item) => [item.toStatus, item]));

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <PageHeader
        title={delivery.deliveryNumber}
        description={`Order ${delivery.orderNumber} · ${delivery.handoffReference}`}
        back
        actions={<StatusBadge status={statusForBadge(delivery.status)} />}
      />

      {delivered && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-start gap-3 p-4">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800">Delivery completed</p>
              <p className="mt-0.5 text-sm text-emerald-700">
                Recipient proof was verified. The verification code is never displayed or retained
                in plaintext.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("logistics", "history")}
                >
                  <History className="h-3.5 w-3.5" /> History
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("logistics", "earnings")}
                >
                  <Wallet className="h-3.5 w-3.5" /> Earnings
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {terminalException && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold capitalize text-rose-800">
                Delivery {delivery.status.replaceAll("_", " ").toLowerCase()}
              </p>
              <p className="mt-0.5 text-sm text-rose-700">
                This terminal delivery cannot be reopened. Contact support with the delivery number
                if review is required.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Route details" icon={MapPin}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Detail
                icon={MapPin}
                label="Pickup"
                value={`${delivery.pickupLocationName} · ${formatAddress(delivery.pickupAddress)}`}
              />
              <Detail
                icon={Phone}
                label="Pickup contact"
                value={`${delivery.pickupContactName} · ${delivery.pickupContactPhoneE164}`}
              />
              <Detail
                icon={MapPin}
                label="Drop-off"
                value={formatAddress(delivery.deliveryAddress)}
              />
              <Detail
                icon={User}
                label="Recipient"
                value={`${delivery.recipientName} · ${delivery.recipientPhoneE164}`}
              />
              <Detail icon={Hash} label="Delivery number" value={delivery.deliveryNumber} />
              <Detail icon={ClipboardList} label="Order" value={delivery.orderNumber} />
            </div>
            {delivery.deliveryInstruction && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-700">Delivery instruction</p>
                <p className="mt-1 text-sm">{delivery.deliveryInstruction}</p>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Recipient verification"
            icon={ShieldCheck}
            description="The recipient owns the code; it is never shown to the courier."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-2xl font-bold tracking-[0.3em]">••••••••</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  At the destination, ask the recipient for their 8-digit code. Failed attempts are
                  rate-limited and audited.
                </p>
              </div>
              {delivery.status === "ARRIVED_AT_DESTINATION" && (
                <Button
                  onClick={() => {
                    setCode("");
                    setDialogOpen(true);
                  }}
                >
                  <ShieldCheck className="h-4 w-4" /> Enter code
                </Button>
              )}
            </div>
          </SectionCard>

          {!isTerminalLogisticsStatus(delivery.status) && (
            <SectionCard title="Next action" icon={Truck}>
              {action ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Uses optimistic concurrency and the authenticated courier assignment.
                    </p>
                  </div>
                  <Button disabled={busy} onClick={() => void progress()}>
                    {busy ? "Updating…" : action.label}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No action is available to this courier.
                </p>
              )}
            </SectionCard>
          )}
        </div>

        <div className="space-y-6">
          <SectionCard title="Earnings" icon={Wallet}>
            <p className="text-sm font-medium">Finance-controlled</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Any payable amount appears only after an immutable finance fact is recorded. Delivery
              status alone never calculates earnings.
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => navigate("logistics", "earnings")}
            >
              View earnings
            </Button>
          </SectionCard>
          <SectionCard title="Status timeline" icon={Truck}>
            <ol className="space-y-4">
              {DELIVERY_TIMELINE.map((step, index) => {
                const evidence = historyByStatus.get(step.status);
                const done = evidence !== undefined || delivered;
                const current = step.status === delivery.status;
                return (
                  <li key={step.status} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ring-2 ${done ? "bg-emerald-500 text-white ring-emerald-500" : current ? "bg-primary text-primary-foreground ring-primary/30" : "bg-muted text-muted-foreground ring-border"}`}
                      >
                        {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </span>
                      {index < DELIVERY_TIMELINE.length - 1 && (
                        <span
                          className={`my-1 min-h-3 w-px flex-1 ${done ? "bg-emerald-300" : "bg-border"}`}
                        />
                      )}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {evidence ? formatDateTime(evidence.occurredAt) : step.hint}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {terminalException && (
              <>
                <Separator className="my-4" />
                <p className="text-sm font-medium text-rose-700">
                  Terminal exception: {delivery.status.replaceAll("_", " ").toLowerCase()}
                </p>
              </>
            )}
          </SectionCard>
          <SectionCard title="Audit" icon={ClipboardList}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Operator</dt>
                <dd>{sessionName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Last update</dt>
                <dd>{formatDateTime(delivery.updatedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Version</dt>
                <dd>{delivery.version}</dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Confirm delivery
            </DialogTitle>
            <DialogDescription>
              Ask {delivery.recipientName} for the 8-digit recipient code. Never request it before
              handover.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="recipient-code">Recipient code</Label>
            <Input
              id="recipient-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              className="font-mono text-lg tracking-[0.3em]"
            />
            <p className="text-xs text-muted-foreground">
              Attempts are limited. The code is submitted securely and never displayed after
              verification.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || code.length !== 8} onClick={() => void confirmDelivery()}>
              {busy ? "Verifying…" : "Verify and complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <p className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}
