import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { WorkerServiceConfig } from "@royal-palace/config/environment";

import { SERVICE_CONFIG } from "../tokens.js";
import {
  notificationRetryDelayMs,
  NotificationRecipientError,
  NotificationTemplateError,
  requireEmailRecipient,
  renderNotification,
} from "./notification-policy.js";
import {
  NotificationProviderError,
  SyntheticNotificationProvider,
  type NotificationProvider,
} from "./notification-provider.js";
import { PostgresNotificationJobs, type NotificationJob } from "./postgres-notification-jobs.js";

const POLL_INTERVAL_MS = 5_000;
const DEAD_LETTER_SWEEP_INTERVAL_MS = 60_000;

@Injectable()
export class NotificationDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly jobs: PostgresNotificationJobs;
  private readonly logger = new Logger(NotificationDeliveryWorker.name);
  private readonly provider: NotificationProvider;
  private lastSweepAt = 0;
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: WorkerServiceConfig) {
    this.jobs = new PostgresNotificationJobs(config);
    this.provider = new SyntheticNotificationProvider();
  }

  onModuleInit(): void {
    if (
      this.config.appEnvironment !== "test" &&
      this.config.notificationDelivery.mode !== "disabled"
    ) {
      void this.tick();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    await this.jobs.close();
  }

  async runOnce(): Promise<boolean> {
    if (this.config.notificationDelivery.mode === "disabled") return false;
    if (Date.now() - this.lastSweepAt >= DEAD_LETTER_SWEEP_INTERVAL_MS) {
      const count = await this.jobs.deadLetterExhaustedLeases();
      if (count > 0) this.logger.error({ count, event: "notification_dead_letter_sweep" });
      this.lastSweepAt = Date.now();
    }
    const job = await this.jobs.claim();
    if (job === null) return false;
    await this.deliver(job);
    return true;
  }

  private async deliver(job: NotificationJob): Promise<void> {
    try {
      const destination = requireEmailRecipient(job);
      const message = renderNotification(job);
      const result = await this.provider.send({
        ...message,
        channel: job.channel,
        deliveryId: job.deliveryId,
        destination,
        recipientPrincipalId: job.recipientPrincipalId,
      });
      const committed = await this.jobs.markDelivered(job, result);
      if (!committed) this.logger.warn({ event: "notification_delivery_lease_lost" });
    } catch (error) {
      await this.recordFailure(job, error);
    }
  }

  private async recordFailure(job: NotificationJob, error: unknown): Promise<void> {
    const providerError = error instanceof NotificationProviderError ? error : null;
    const permanent =
      error instanceof NotificationTemplateError ||
      error instanceof NotificationRecipientError ||
      providerError?.kind === "PERMANENT";
    const errorCode =
      error instanceof NotificationTemplateError
        ? error.code
        : error instanceof NotificationRecipientError
          ? error.code
          : (providerError?.code ?? "NOTIFICATION_PROVIDER_UNAVAILABLE");
    const outcome = permanent
      ? "PERMANENT_FAILURE"
      : providerError?.kind === "UNKNOWN"
        ? "UNKNOWN"
        : "TRANSIENT_FAILURE";
    const backoffMs = permanent ? null : notificationRetryDelayMs(job.attemptNumber);
    const committed = await this.jobs.fail(job, { backoffMs, errorCode, outcome });
    if (!committed) {
      this.logger.warn({ event: "notification_delivery_lease_lost" });
      return;
    }
    if (backoffMs === null) {
      this.logger.error({ errorCode, event: "notification_delivery_dead_letter" });
    }
  }

  private async tick(): Promise<void> {
    try {
      await this.runOnce();
    } catch {
      this.logger.error({ event: "notification_delivery_poll_failed" });
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), POLL_INTERVAL_MS);
    }
  }
}
