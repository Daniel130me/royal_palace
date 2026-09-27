"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import { deliveryService } from "@/lib/services";
import type { Delivery, DeliveryStatus } from "@/types";
import { nextDeliveryStatuses } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SectionCard, BottomActionBar, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import {
  formatCurrency,
  formatDateTime,
  DELIVERY_TIMELINE,
  NEXT_ACTION,
  maskVerificationCode,
} from "../delivery-helpers";
import { toast } from "sonner";
import {
  MapPin, User, Phone, Package, ShieldCheck, Wallet, Hash,
  CheckCircle2, AlertTriangle, ArrowRight, Truck, History,
  PackageCheck, ClipboardList, Navigation,
} from "lucide-react";

export function LogisticsDeliveryDetail() {
  const { view, sessionName } = useNav();
  const deliveryId = view.params.id;
  const { logisticsId, deliveries, loading, error, refresh } = useLogisticsContext();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [codeValue, setCodeValue] = useState("");

  useEffect(() => {
    if (!deliveryId) return;
    const fromCtx = deliveries.find((d) => d.id === deliveryId) ?? null;
    if (fromCtx) {
      setDelivery(fromCtx);
    } else if (!loading) {
      deliveryService.get(deliveryId).then(setDelivery).catch(() => setDelivery(null));
    }
  }, [deliveryId, deliveries, loading]);

  async function progress(to: DeliveryStatus, verificationCode = "") {
    if (!delivery || !logisticsId) return;
    setBusy(true);
    try {
      const updated = await deliveryService.progress(delivery.id, to, verificationCode, logisticsId);
      setDelivery(updated);
      toast.success(`Delivery ${delivery.deliveryNumber} → "${to.replace(/_/g, " ")}".`);
      await refresh();
      if (to === "delivered") {
        toast.success("Recipient notified. Linked pharmacy order marked delivered.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update delivery.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelivered(enteredCode: string) {
    if (!enteredCode.trim()) {
      toast.error("Please enter the verification code provided by the recipient.");
      return;
    }
    setShowCodeDialog(false);
    await progress("delivered", enteredCode.trim());
  }

  function openCodeDialog() {
    setCodeValue("");
    setShowCodeDialog(true);
  }

  if (!deliveryId) {
    return (
      <EmptyState
        icon={Package}
        title="No delivery selected"
        description="Pick a delivery from your assignments to view its full workflow."
        action={<Button onClick={() => navigate("logistics", "assignments")}>Go to assignments</Button>}
      />
    );
  }

  if (loading && !delivery) {
    return <LoadingState label="Loading delivery…" />;
  }
  if (error && !delivery) {
    return <ErrorState message={error} onRetry={() => refresh()} />;
  }
  if (!delivery) {
    return (
      <EmptyState
        icon={Package}
        title="Delivery not found"
        description="This delivery may have been removed or is no longer assigned to your account."
        action={<Button onClick={() => navigate("logistics", "assignments")}>Back to assignments</Button>}
      />
    );
  }

  const next = nextDeliveryStatuses(delivery.status) as DeliveryStatus[];
  const forwardNext = next.filter((s) => s !== "cancelled" && s !== "failed" && s !== "returned");
  const primaryNext = forwardNext[0] ?? null;
  const primaryAction = primaryNext ? NEXT_ACTION[primaryNext] : undefined;

  const currentIndex = DELIVERY_TIMELINE.findIndex((s) => s.status === delivery.status);
  const isAbnormalEnd = ["failed", "returned", "cancelled"].includes(delivery.status);
  const isDelivered = delivery.status === "delivered";
  const needsCodeNow = primaryAction?.needsCode ?? false;

  return (
    <div className="pb-28 lg:pb-0 space-y-6">
      <PageHeader
        title={delivery.deliveryNumber}
        description={
          delivery.order
            ? `Linked order: ${delivery.order.orderNumber} (display only)`
            : "Delivery workflow"
        }
        back
        actions={<StatusBadge status={delivery.status} />}
      />

      {/* Status banner */}
      {isDelivered && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-800">Delivery completed</p>
              <p className="text-sm text-emerald-700 mt-0.5 leading-relaxed">
                Package successfully handed over to {delivery.recipientName} and verified.
                {delivery.updatedAt && ` Completed at ${formatDateTime(delivery.updatedAt)}.`}
              </p>
              <p className="text-sm text-emerald-700 mt-1">
                Payout of <strong>{formatCurrency(delivery.payout)}</strong> will be added to your next settlement.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate("logistics", "history")}>
                  <History className="h-3.5 w-3.5" /> View history
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("logistics", "earnings")}>
                  <Wallet className="h-3.5 w-3.5" /> View earnings
                </Button>
                <Button size="sm" onClick={() => navigate("logistics", "assignments")}>
                  Next assignment
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isAbnormalEnd && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-800 capitalize">
                Delivery {delivery.status}
              </p>
              <p className="text-sm text-rose-700 mt-0.5">
                This delivery was not completed successfully. Contact support if you believe this is an error.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Route details" icon={Navigation}>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem icon={MapPin} label="Pickup location" value={delivery.pickupLocation} />
              <DetailItem icon={Phone} label="Pickup contact" value={delivery.pickupContact} />
              <DetailItem icon={MapPin} label="Drop-off location" value={delivery.deliveryLocation} />
              <DetailItem icon={User} label="Recipient name" value={delivery.recipientName} />
              <DetailItem icon={Package} label="Package type" value={<span className="capitalize">{delivery.packageType.replace(/_/g, " ")}</span>} />
              <DetailItem icon={Hash} label="Delivery number" value={delivery.deliveryNumber} />
              {delivery.order && (
                <DetailItem icon={ClipboardList} label="Linked order" value={delivery.order.orderNumber} />
              )}
            </div>
            {delivery.handlingInstruction && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mt-4">
                <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Handling instruction
                </p>
                <p className="text-sm mt-1">{delivery.handlingInstruction}</p>
              </div>
            )}
          </SectionCard>

          {/* Verification code — prominent on desktop */}
          <SectionCard
            title="Verification code"
            icon={ShieldCheck}
            description={isDelivered ? "Revealed for audit" : "Recipient holds this code"}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-mono text-2xl tracking-wider font-bold">
                  {isDelivered ? delivery.verificationCode : maskVerificationCode(delivery.verificationCode)}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md">
                  {isDelivered
                    ? "Revealed for audit purposes — delivery already completed."
                    : "The recipient holds this code. Ask for it at delivery and enter it to confirm handover."}
                </p>
              </div>
              {!isDelivered && delivery.status === "arrived_at_destination" && (
                <Button onClick={openCodeDialog} className="shrink-0">
                  <ShieldCheck className="h-4 w-4" /> Enter code
                </Button>
              )}
            </div>
          </SectionCard>

          {/* Next action card */}
          {!isDelivered && !isAbnormalEnd && (
            <SectionCard title="Next action" icon={Truck}>
              {primaryAction ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{primaryAction.label}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Moves this delivery to &ldquo;{primaryAction.to.replace(/_/g, " ")}&rdquo;.
                      {primaryAction.needsCode && " Requires the recipient's verification code."}
                    </p>
                  </div>
                  <Button
                    className="sm:min-w-[180px]"
                    disabled={busy}
                    onClick={() => {
                      if (primaryAction.needsCode) {
                        openCodeDialog();
                      } else {
                        progress(primaryAction.to);
                      }
                    }}
                  >
                    {busy ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Updating…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> {primaryAction.label}
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No further action available for this delivery.
                </p>
              )}
            </SectionCard>
          )}
        </div>

        {/* Right: timeline + payout */}
        <div className="space-y-6">
          <SectionCard title="Payout" icon={PackageCheck}>
            <p className="text-3xl font-bold text-emerald-700 tabular-nums">{formatCurrency(delivery.payout)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isDelivered ? "Earned — settles in your next payout." : "Earned upon successful delivery."}
            </p>
          </SectionCard>

          <SectionCard title="Status timeline" icon={Truck}>
            <ol className="relative space-y-4">
              {DELIVERY_TIMELINE.map((step, i) => {
                const done = i < currentIndex || isDelivered;
                const current = i === currentIndex;
                const future = i > currentIndex;
                return (
                  <li key={step.status} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ring-2 ${
                          done
                            ? "bg-emerald-500 text-white ring-emerald-500"
                            : current
                            ? "bg-primary text-primary-foreground ring-primary/30"
                            : "bg-muted text-muted-foreground ring-border"
                        }`}
                      >
                        {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                      </span>
                      {i < DELIVERY_TIMELINE.length - 1 && (
                        <span
                          className={`w-px flex-1 my-1 ${done ? "bg-emerald-300" : "bg-border"}`}
                          style={{ minHeight: 12 }}
                        />
                      )}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${future ? "text-muted-foreground" : ""}`}>
                          {step.label}
                        </p>
                        {current && (
                          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px] h-5">
                            Current
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.hint}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {isAbnormalEnd && (
              <>
                <Separator className="my-4" />
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-sm font-medium capitalize">
                    Ended abnormally: {delivery.status}
                  </p>
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard title="Audit" icon={ClipboardList}>
            <dl className="text-sm space-y-2.5">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Operator</dt><dd className="font-medium">{sessionName || "—"}</dd></div>
              {delivery.createdAt && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Created</dt><dd>{formatDateTime(delivery.createdAt)}</dd></div>}
              {delivery.updatedAt && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last update</dt><dd>{formatDateTime(delivery.updatedAt)}</dd></div>}
              <div className="flex justify-between gap-3 items-center"><dt className="text-muted-foreground">Current status</dt><dd><StatusBadge status={delivery.status} size="sm" /></dd></div>
            </dl>
          </SectionCard>
        </div>
      </div>

      {/* Mobile bottom action bar — verification code prominent */}
      {!isDelivered && !isAbnormalEnd && primaryAction && (
        <BottomActionBar>
          <div className="space-y-2">
            {needsCodeNow && (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  autoComplete="off"
                  placeholder="Enter recipient's verification code"
                  value={codeValue}
                  onChange={(e) => setCodeValue(e.target.value)}
                  className="font-mono tracking-wider text-base"
                />
              </div>
            )}
            <Button
              className="w-full"
              disabled={busy || (needsCodeNow && !codeValue.trim())}
              onClick={() => {
                if (needsCodeNow) {
                  confirmDelivered(codeValue);
                } else {
                  progress(primaryAction.to);
                }
              }}
            >
              {busy ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Updating…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> {primaryAction.label}
                  {needsCodeNow && <ShieldCheck className="h-4 w-4 ml-1" />}
                </>
              )}
            </Button>
          </div>
        </BottomActionBar>
      )}

      {/* Verification code dialog */}
      <VerificationCodeDialog
        open={showCodeDialog}
        onOpenChange={setShowCodeDialog}
        recipientName={delivery.recipientName}
        disabled={busy}
        code={codeValue}
        onCodeChange={setCodeValue}
        onSubmit={confirmDelivered}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function DetailItem({
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
      <p className="text-xs text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="text-sm font-medium mt-1 break-words">{value}</p>
    </div>
  );
}

function VerificationCodeDialog({
  open,
  onOpenChange,
  recipientName,
  disabled,
  code,
  onCodeChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  disabled: boolean;
  code: string;
  onCodeChange: (v: string) => void;
  onSubmit: (code: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Confirm delivery
          </DialogTitle>
          <DialogDescription>
            Ask <strong>{recipientName}</strong> for the verification code and enter it below
            to confirm the package has been handed over.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="verif-code" className="text-xs font-medium text-muted-foreground">
            Verification code
          </Label>
          <Input
            id="verif-code"
            autoFocus
            autoComplete="off"
            placeholder="e.g. RP-1234"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit(code);
            }}
            disabled={disabled}
            className="text-lg font-mono tracking-wider"
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            The code is case-sensitive. A wrong code will be rejected by the system.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={disabled}>
            Cancel
          </Button>
          <Button
            disabled={disabled || !code.trim()}
            onClick={() => onSubmit(code)}
          >
            {disabled ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Confirming…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" /> Confirm delivery
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
