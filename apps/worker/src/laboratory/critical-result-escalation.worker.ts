import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { WorkerServiceConfig } from "@royal-palace/config/environment";

import { SERVICE_CONFIG } from "../tokens.js";
import { PostgresCriticalResultJobs } from "./postgres-critical-result-jobs.js";

const POLL_INTERVAL_MS = 5_000;

@Injectable()
export class CriticalResultEscalationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly jobs: PostgresCriticalResultJobs;
  private readonly logger = new Logger(CriticalResultEscalationWorker.name);
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: WorkerServiceConfig) {
    this.jobs = new PostgresCriticalResultJobs(config);
  }

  onModuleInit(): void {
    if (this.config.appEnvironment !== "test") void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    await this.jobs.close();
  }

  async runOnce(): Promise<number> {
    return this.jobs.escalateDue();
  }

  private async tick(): Promise<void> {
    try {
      const count = await this.runOnce();
      if (count > 0) this.logger.warn({ count, event: "critical_laboratory_results_escalated" });
    } catch {
      this.logger.error({ event: "critical_laboratory_result_escalation_failed" });
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), POLL_INTERVAL_MS);
    }
  }
}
