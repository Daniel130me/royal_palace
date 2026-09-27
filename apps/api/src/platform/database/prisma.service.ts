import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ServiceConfig } from "@royal-palace/config/environment";

import { PrismaClient } from "../../generated/prisma/client.js";
import { SERVICE_CONFIG } from "../../tokens.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(SERVICE_CONFIG) config: ServiceConfig) {
    // Runtime configuration is validated before Nest starts; passing it explicitly
    // avoids a second, unvalidated read from process.env inside the data boundary.
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
