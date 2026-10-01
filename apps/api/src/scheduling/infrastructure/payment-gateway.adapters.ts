import { createHmac, timingSafeEqual } from "node:crypto";

import type { ApiServiceConfig } from "@royal-palace/config/environment";
import { z } from "zod";

import type {
  PaymentGateway,
  ProviderPaymentObservation,
  VerifiedPaymentEvent,
} from "../domain/scheduling-payment.types.js";

const SIGNATURE_HEADER = "x-rp-payment-signature";
const syntheticEventSchema = z
  .object({
    amountMinor: z.string().regex(/^\d+$/).max(19).optional(),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/)
      .optional(),
    eventId: z.string().trim().min(1).max(255),
    eventType: z.enum([
      "PENDING",
      "SUCCEEDED",
      "FAILED",
      "EXPIRED",
      "CANCELLED",
      "REVERSED",
      "PARTIALLY_REFUNDED",
      "REFUNDED",
      "DISPUTED",
    ]),
    occurredAt: z.iso.datetime({ offset: true }),
    paymentReference: z.string().trim().min(1).max(64),
    providerPaymentReference: z.string().trim().min(1).max(255),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.amountMinor === undefined) !== (value.currency === undefined)) {
      context.addIssue({
        code: "custom",
        message: "amount and currency must be provided together",
      });
    }
    if (
      ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "REVERSED", "DISPUTED"].includes(
        value.eventType,
      ) &&
      value.amountMinor === undefined
    ) {
      context.addIssue({ code: "custom", message: "financial events require amount and currency" });
    }
  });

export class PaymentGatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}

export class DisabledPaymentGateway implements PaymentGateway {
  readonly providerCode = "DISABLED";

  createHostedCheckout(): Promise<never> {
    return Promise.reject(
      new PaymentGatewayError("payment_gateway_disabled", "Payment checkout is unavailable"),
    );
  }

  retrievePayment(): Promise<never> {
    return Promise.reject(
      new PaymentGatewayError("payment_gateway_disabled", "Payment reconciliation is unavailable"),
    );
  }

  verifyWebhook(): never {
    throw new PaymentGatewayError("payment_gateway_disabled", "Payment webhooks are unavailable");
  }
}

/**
 * Local-only deterministic adapter. It proves the hosted-checkout and authenticated-webhook
 * contracts without pretending to be a production payment processor.
 */
export class SyntheticPaymentGateway implements PaymentGateway {
  readonly providerCode = "SYNTHETIC";

  constructor(private readonly config: ApiServiceConfig["paymentGateway"]) {}

  async createHostedCheckout(input: {
    amountMinor: bigint;
    currency: string;
    idempotencyKey: string;
    paymentReference: string;
  }) {
    const baseUrl = this.config.checkoutBaseUrl;
    if (baseUrl === undefined)
      throw new PaymentGatewayError("invalid_gateway_config", "Checkout is unavailable");
    const referenceDigest = createHmac("sha256", "synthetic-checkout-reference")
      .update(`${input.paymentReference}:${input.idempotencyKey}`)
      .digest("hex")
      .slice(0, 32);
    const checkoutUrl = new URL(baseUrl);
    checkoutUrl.searchParams.set("reference", input.paymentReference);
    return {
      checkoutUrl: checkoutUrl.toString(),
      expiresAt: new Date(Date.now() + this.config.checkoutTtlSeconds * 1000),
      providerPaymentReference: `synthetic-payment-${referenceDigest}`,
      providerSessionReference: `synthetic-session-${referenceDigest}`,
    };
  }

  retrievePayment(_providerPaymentReference: string): Promise<ProviderPaymentObservation> {
    return Promise.reject(
      new PaymentGatewayError(
        "synthetic_reconciliation_unavailable",
        "Synthetic provider state is supplied only through signed test webhooks",
      ),
    );
  }

  verifyWebhook(input: {
    headers: Readonly<Record<string, string | string[] | undefined>>;
    rawBody: Buffer;
  }): VerifiedPaymentEvent {
    const signature = singleHeader(input.headers[SIGNATURE_HEADER]);
    if (signature === undefined) throw invalidSignature();
    const separator = signature.indexOf(".");
    if (separator <= 0) throw invalidSignature();
    const keyId = signature.slice(0, separator);
    const receivedHex = signature.slice(separator + 1);
    const encodedKey = this.config.webhookSigningKeys[keyId];
    if (encodedKey === undefined || !/^[a-f0-9]{64}$/i.test(receivedHex)) throw invalidSignature();
    const expected = createHmac("sha256", Buffer.from(encodedKey, "base64"))
      .update(input.rawBody)
      .digest();
    const received = Buffer.from(receivedHex, "hex");
    if (received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
      throw invalidSignature();
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(input.rawBody.toString("utf8"));
    } catch {
      throw new PaymentGatewayError("invalid_webhook_payload", "Webhook payload is invalid");
    }
    const parsed = syntheticEventSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new PaymentGatewayError("invalid_webhook_payload", "Webhook payload is invalid");
    }
    return {
      ...(parsed.data.amountMinor === undefined
        ? {}
        : { amountMinor: BigInt(parsed.data.amountMinor) }),
      ...(parsed.data.currency === undefined
        ? {}
        : { currency: parsed.data.currency.toUpperCase() }),
      eventId: parsed.data.eventId,
      eventType: parsed.data.eventType,
      occurredAt: new Date(parsed.data.occurredAt),
      paymentReference: parsed.data.paymentReference,
      providerCode: this.providerCode,
      providerPaymentReference: parsed.data.providerPaymentReference,
      signatureKeyId: keyId,
    };
  }
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function invalidSignature(): PaymentGatewayError {
  return new PaymentGatewayError("invalid_webhook_signature", "Webhook authentication failed");
}
