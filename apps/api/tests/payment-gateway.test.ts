import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SyntheticPaymentGateway } from "../src/scheduling/infrastructure/payment-gateway.adapters.js";
import type { PaymentGatewayError } from "../src/scheduling/infrastructure/payment-gateway.adapters.js";
import { testConfig } from "./test-config.js";

function signedEvent(overrides: Record<string, unknown> = {}) {
  const payload = Buffer.from(
    JSON.stringify({
      amountMinor: "12500",
      currency: "usd",
      eventId: "event-1",
      eventType: "SUCCEEDED",
      occurredAt: "2026-10-01T10:00:00.000Z",
      paymentReference: "payment_0199a18e-a400-7000-8000-000000000001",
      providerPaymentReference: "synthetic-payment-1",
      ...overrides,
    }),
  );
  const keyId = testConfig.paymentGateway.activeWebhookKeyId!;
  const key = Buffer.from(testConfig.paymentGateway.webhookSigningKeys[keyId]!, "base64");
  const digest = createHmac("sha256", key).update(payload).digest("hex");
  return { headers: { "x-rp-payment-signature": `${keyId}.${digest}` }, rawBody: payload };
}

describe("SyntheticPaymentGateway", () => {
  const gateway = new SyntheticPaymentGateway(testConfig.paymentGateway);

  it("authenticates the exact raw body and normalizes money without floating point", () => {
    expect(gateway.verifyWebhook(signedEvent())).toMatchObject({
      amountMinor: 12_500n,
      currency: "USD",
      eventId: "event-1",
      eventType: "SUCCEEDED",
      providerCode: "SYNTHETIC",
    });
  });

  it("rejects an altered payload and does not reflect secret material", () => {
    const event = signedEvent();
    event.rawBody = Buffer.from(event.rawBody.toString("utf8").replace("12500", "12501"));
    expect(() => gateway.verifyWebhook(event)).toThrowError(
      expect.objectContaining<Partial<PaymentGatewayError>>({ code: "invalid_webhook_signature" }),
    );
  });

  it("requires amount and currency on financial events", () => {
    expect(() =>
      gateway.verifyWebhook(signedEvent({ amountMinor: undefined, currency: undefined })),
    ).toThrowError(
      expect.objectContaining<Partial<PaymentGatewayError>>({ code: "invalid_webhook_payload" }),
    );
  });

  it("creates the same provider session for an idempotent retry", async () => {
    const request = {
      amountMinor: 12_500n,
      currency: "USD",
      idempotencyKey: "checkout-request-1",
      paymentReference: "payment_0199a18e-a400-7000-8000-000000000001",
    };
    const first = await gateway.createHostedCheckout(request);
    const second = await gateway.createHostedCheckout(request);
    expect(first.providerSessionReference).toBe(second.providerSessionReference);
    expect(new URL(first.checkoutUrl).searchParams.get("reference")).toBe(request.paymentReference);
  });
});
