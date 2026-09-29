import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PublicDiscoveryService } from "../src/discovery/application/public-discovery.service.js";
import {
  PUBLIC_DISCOVERY_REPOSITORY,
  type PublicDiscoveryRepository,
} from "../src/discovery/domain/public-discovery.types.js";
import { PublicDiscoveryController } from "../src/discovery/presentation/public-discovery.controller.js";

const repository: PublicDiscoveryRepository = {
  findOrganizationById: vi.fn(),
  listOrganizations: vi.fn().mockResolvedValue({
    data: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  }),
  listServices: vi.fn().mockResolvedValue([]),
};

@Module({
  controllers: [PublicDiscoveryController],
  providers: [
    PublicDiscoveryService,
    { provide: PUBLIC_DISCOVERY_REPOSITORY, useValue: repository },
  ],
})
class PublicDiscoveryTestModule {}

describe("public discovery HTTP boundary", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      PublicDiscoveryTestModule,
      new FastifyAdapter(),
      { logger: false },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it("accepts bounded filters and delegates them to the application service", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/hospitals?service=emergency-care&country=ng&location=Lagos&limit=25",
    });

    expect(response.statusCode).toBe(200);
    expect(repository.listOrganizations).toHaveBeenCalledWith({
      countryCode: "NG",
      limit: 25,
      location: "Lagos",
      organizationType: "HOSPITAL",
      serviceCode: "emergency-care",
    });
  });

  it.each([
    ["pharmacies", "PHARMACY"],
    ["laboratories", "LABORATORY"],
  ] as const)("maps /%s to the correct organization type", async (path, organizationType) => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/public/${path}?country=ca&location=Toronto`,
    });

    expect(response.statusCode).toBe(200);
    expect(repository.listOrganizations).toHaveBeenLastCalledWith({
      countryCode: "CA",
      limit: 20,
      location: "Toronto",
      organizationType,
    });
  });

  it("rejects unknown, malformed, and oversized query input", async () => {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/v1/public/hospitals?unknown=value" }),
      app.inject({ method: "GET", url: "/v1/public/hospitals?emergencyAvailable=maybe" }),
      app.inject({ method: "GET", url: "/v1/public/hospitals?limit=51" }),
      app.inject({ method: "GET", url: "/v1/public/hospitals?country=NGA" }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([400, 400, 400, 400]);
  });
});
