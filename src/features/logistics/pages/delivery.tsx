"use client";

import { useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { useLogisticsContext } from "../use-logistics-context";
import { deliveryService } from "@/lib/services";
import type { Delivery, DeliveryStatus } from "@/types";
import { nextDeliveryStatuses } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
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

  // Resolve the delivery from context (or fetch fresh to capture latest status).
  useEffect(() => {
    if (!deliveryId) return;
    const fromCtx = deliveries.find((d) => d.id === deliveryId) ?? null;
    if (fromCtx) {
      setDelivery(fromCtx);
    } else if (!loading) {
      // Fallback fetch when navigated to directly (deep link).
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
  // Filter next statuses to the primary forward action (exclude cancelled/failed/returned
  // for cleaner UX; those states are reachable via the success-state paths or admin).
  const forwardNext = next.filter((s) => s !== "cancelled" && s !== "failed" && s !== "returned");
  const primaryNext = forwardNext[0] ?? null;
  const primaryAction = primaryNext ? NEXT_ACTION[primaryNext] : undefined;

  const currentIndex = DELIVERY_TIMELINE.findIndex((s) => s.status === delivery.status);
  const isAbnormalEnd = ["failed", "returned", "cancelled"].includes(delivery.status);
  const isDelivered = delivery.status === "delivered";

  return (
    <div>
      <PageHeader
        title={delivery.deliveryNumber}
        description={
          delivery.order
            ? `Linked order: ${delivery.order.orderNumber} (display only)`
            : "Delivery workflow"
        }
        breadcrumbs={[
          { label: "Dashboard", onClick: () => navigate("logistics", "dashboard") },
          { label: "Assignments", onClick: () => navigate("logistics", "assignments") },
          { label: delivery.deliveryNumber },
        ]}
        actions={
          <Button variant="outline" onClick={() => navigate("logistics", "assignments")}>
            <ArrowRight className="h-4 w-4 rotate-180 mr-1" /> Back
          </Button>
        }
      />

      {/* Status banner */}
      {isDelivered && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-800">Delivery completed</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                Package successfully handed over to {delivery.recipientName} and verified.
                {delivery.updatedAt && ` Completed at ${formatDateTime(delivery.updatedAt)}.`}
              </p>
              <p className="text-sm text-emerald-700 mt-1">
                Payout of <strong>{formatCurrency(delivery.payout)}</strong> will be added to your next settlement.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate("logistics", "history")}>
                  <History className="h-3.5 w-3.5 mr-1" /> View history
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("logistics", "earnings")}>
                  <Wallet className="h-3.5 w-3.5 mr-1" /> View earnings
                </Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("logistics", "assignments")}>
                  Next assignment
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isAbnormalEnd && (
        <Card className="mb-6 border-rose-200 bg-rose-50">
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pickup / drop-off details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Navigation className="h-4 w-4 text-emerald-600" /> Route details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem icon={MapPin} label="Pickup location" value={delivery.pickupLocation} />
                <DetailItem icon={Phone} label="Pickup contact" value={delivery.pickupContact} />
                <DetailItem icon={MapPin} label="Drop-off location" value={delivery.deliveryLocation} />
                <DetailItem icon={User} label="Recipient name" value={delivery.recipientName} />
                <DetailItem icon={Package} label="Package type" value={<span className="capitalize">{delivery.packageType.replace(/_/g, " ")}</span>} />
                <DetailItem icon={Hash} label="Delivery number" value={delivery.deliveryNumber} />
                {delivery.order && (
                  <DetailItem
                    icon={ClipboardList}
                    label="Linked order"
                    value={delivery.order.orderNumber}
                  />
                )}
              </div>
              {delivery.handlingInstruction && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Handling instruction
                  </p>
                  <p className="text-sm mt-1">{delivery.handlingInstruction}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Verification code */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Verification code
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-mono text-lg tracking-wider">
                    {isDelivered ? delivery.verificationCode : maskVerificationCode(delivery.verificationCode)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isDelivered
                      ? "Revealed for audit purposes — delivery already completed."
                      : "The recipient holds this code. Ask for it at delivery and enter it to confirm handover."}
                  </p>
                </div>
                {!isDelivered && delivery.status === "arrived_at_destination" && (
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={openCodeDialog}>
                    <ShieldCheck className="h-4 w-4 mr-1" /> Enter code
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action */}
          {!isDelivered && !isAbnormalEnd && (
            <Card className="border-emerald-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4 text-emerald-600" /> Next action
                </CardTitle>
              </CardHeader>
              <CardContent>
                {primaryAction ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{primaryAction.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Moves this delivery to &ldquo;{primaryAction.to.replace(/_/g, " ")}&rdquo;.
                        {primaryAction.needsCode && " Requires the recipient's verification code."}
                      </p>
                    </div>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 sm:min-w-[180px]"
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
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white mr-2" />
                          Updating…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> {primaryAction.label}
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No further action available for this delivery.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: timeline + payout */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PackageCheck className="h-4 w-4" /> Payout
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-emerald-700">{formatCurrency(delivery.payout)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isDelivered
                  ? "Earned — settles in your next payout."
                  : "Earned upon successful delivery."}
              </p>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Status timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4">
                {DELIVERY_TIMELINE.map((step, i) => {
                  const done = i < currentIndex || isDelivered;
                  const current = i === currentIndex;
                  const future = i > currentIndex;
                  return (
                    <li key={step.status} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${
                            done
                              ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                              : current
                              ? "bg-emerald-600 text-white"
                              : "bg-muted text-muted-foreground border"
                          }`}
                        >
                          {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                        </span>
                        {i < DELIVERY_TIMELINE.length - 1 && (
                          <span
                            className={`w-px flex-1 my-1 ${
                              done ? "bg-emerald-300" : "bg-border"
                            }`}
                            style={{ minHeight: 12 }}
                          />
                        )}
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium ${future ? "text-muted-foreground" : ""}`}>
                            {step.label}
                          </p>
                          {current && <StatusBadge status={step.status} />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.hint}</p>
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
            </CardContent>
          </Card>

          {/* Audit / meta */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Audit</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Operator" value={sessionName || "—"} />
              {delivery.createdAt && <Row label="Created" value={formatDateTime(delivery.createdAt)} />}
              {delivery.updatedAt && <Row label="Last update" value={formatDateTime(delivery.updatedAt)} />}
              <Row label="Current status" value={<StatusBadge status={delivery.status} />} />
            </CardContent>
          </Card>
        </div>
      </div>

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
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="text-sm font-medium mt-1 break-words">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
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
            <ShieldCheck className="h-5 w-5 text-emerald-600" /> Confirm delivery
          </DialogTitle>
          <DialogDescription>
            Ask <strong>{recipientName}</strong> for the verification code and enter it below
            to confirm the package has been handed over.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="verif-code" className="text-xs font-medium text-muted-foreground">
            Verification code
          </label>
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
          />
          <p className="text-xs text-muted-foreground">
            The code is case-sensitive. A wrong code will be rejected by the system.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={disabled}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={disabled || !code.trim()}
            onClick={() => onSubmit(code)}
          >
            {disabled ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white mr-2" />
                Confirming…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm delivery
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
