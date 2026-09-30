import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PublicPractitionerDiscoveryService } from "../src/discovery/application/public-practitioner-discovery.service.js";
import {
  PUBLIC_PRACTITIONER_DISCOVERY_REPOSITORY,
  type PublicPractitionerDiscoveryRepository,
} from "../src/discovery/domain/public-practitioner-discovery.types.js";
import { PublicPractitionerDiscoveryController } from "../src/discovery/presentation/public-practitioner-discovery.controller.js";

const repository: PublicPractitionerDiscoveryRepository = {
  findPractitionerById: vi.fn(),
  listPractitioners: vi.fn().mockResolvedValue({
    data: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  }),
  listProfessions: vi.fn().mockResolvedValue([]),
  listSpecialties: vi.fn().mockResolvedValue([]),
};

@Module({
  controllers: [PublicPractitionerDiscoveryController],
  providers: [
    PublicPractitionerDiscoveryService,
    { provide: PUBLIC_PRACTITIONER_DISCOVERY_REPOSITORY, useValue: repository },
  ],
})
class PublicPractitionerDiscoveryTestModule {}

describe("public practitioner discovery HTTP boundary", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      PublicPractitionerDiscoveryTestModule,
      new FastifyAdapter(),
      { logger: false },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it("validates and delegates global practitioner filters", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/practitioners?profession=medicine&specialty=cardiology&country=ca&location=Toronto&language=en&mode=VIDEO&limit=25",
    });

    expect(response.statusCode).toBe(200);
    expect(repository.listPractitioners).toHaveBeenCalledWith({
      countryCode: "CA",
      languageTag: "en",
      limit: 25,
      location: "Toronto",
      professionCode: "medicine",
      serviceMode: "VIDEO",
      specialtyCode: "cardiology",
    });
  });

  it("rejects unknown and malformed filters", async () => {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/v1/public/practitioners?unknown=value" }),
      app.inject({ method: "GET", url: "/v1/public/practitioners?country=CAN" }),
      app.inject({ method: "GET", url: "/v1/public/practitioners?language=not_a_tag" }),
      app.inject({ method: "GET", url: "/v1/public/practitioners?limit=51" }),
      app.inject({ method: "GET", url: "/v1/public/specialties?profession=medicine" }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([400, 400, 400, 400, 400]);
  });
});
