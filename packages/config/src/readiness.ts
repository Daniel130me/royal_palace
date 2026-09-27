import net from "node:net";

import { Redis } from "ioredis";
import { Pool } from "pg";

import type { ServiceConfig } from "./environment.js";

export interface DependencyCheck {
  name: "clamav" | "object-storage" | "postgresql" | "redis-queue";
  status: "down" | "up";
}

export interface ReadinessResult {
  checks: readonly DependencyCheck[];
  ready: boolean;
}

export interface DependencyReadiness {
  check(): Promise<ReadinessResult>;
}

export class RuntimeDependencies implements DependencyReadiness {
  private readonly pool: Pool;
  private readonly redis: Redis;
  private redisConnectionAttempt?: Promise<void>;

  constructor(private readonly config: ServiceConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: config.dependencyTimeoutMs,
      idleTimeoutMillis: 10_000,
      max: 2,
      query_timeout: config.dependencyTimeoutMs,
    });
    this.redis = new Redis(config.redisUrl, {
      connectTimeout: config.dependencyTimeoutMs,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
    });
  }

  async check(): Promise<ReadinessResult> {
    const checks = await Promise.all([
      this.checkPostgres(),
      this.checkRedisQueue(),
      this.checkObjectStorage(),
      this.checkClamAv(),
    ]);

    return {
      checks,
      ready: checks.every((check) => check.status === "up"),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.pool.end(), this.closeRedis()]);
  }

  private async checkPostgres(): Promise<DependencyCheck> {
    return this.asCheck("postgresql", async () => {
      await this.pool.query("SELECT 1");
    });
  }

  private async checkRedisQueue(): Promise<DependencyCheck> {
    return this.asCheck("redis-queue", async () => {
      if (this.redis.status === "wait") await this.connectRedis();
      const response = await this.redis.ping();
      if (response !== "PONG") throw new Error("Unexpected Redis PING response");
    });
  }

  private async checkObjectStorage(): Promise<DependencyCheck> {
    return this.asCheck("object-storage", async () => {
      const healthUrl = new URL("/minio/health/live", this.config.objectStorage.endpoint);
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(this.config.dependencyTimeoutMs),
      });
      if (!response.ok) throw new Error("Object storage health endpoint is unavailable");
    });
  }

  private async checkClamAv(): Promise<DependencyCheck> {
    return this.asCheck(
      "clamav",
      () =>
        new Promise<void>((resolve, reject) => {
          const socket = net.createConnection({
            host: this.config.clamav.host,
            port: this.config.clamav.port,
          });

          socket.setTimeout(this.config.dependencyTimeoutMs);
          socket.once("connect", () => socket.write("zPING\0"));
          socket.once("data", (data) => {
            socket.destroy();
            if (data.toString("utf8").includes("PONG")) {
              resolve();
              return;
            }
            reject(new Error("Unexpected ClamAV PING response"));
          });
          socket.once("timeout", () => {
            socket.destroy();
            reject(new Error("ClamAV readiness timed out"));
          });
          socket.once("error", (error) => {
            socket.destroy();
            reject(error);
          });
          socket.once("close", () => reject(new Error("ClamAV closed without a PONG response")));
        }),
    );
  }

  private async asCheck(
    name: DependencyCheck["name"],
    operation: () => Promise<void>,
  ): Promise<DependencyCheck> {
    try {
      await operation();
      return { name, status: "up" };
    } catch {
      return { name, status: "down" };
    }
  }

  private async closeRedis(): Promise<void> {
    if (this.redis.status === "wait" || this.redis.status === "end") return;
    await this.redis.quit();
  }

  private async connectRedis(): Promise<void> {
    if (this.redisConnectionAttempt === undefined) {
      this.redisConnectionAttempt = this.redis.connect();
    }

    const attempt = this.redisConnectionAttempt;
    try {
      await attempt;
    } finally {
      if (this.redisConnectionAttempt === attempt) this.redisConnectionAttempt = undefined;
    }
  }
}
