import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";

const DEFAULT_API_PORT = 4000;
const LISTEN_HOST = "0.0.0.0";

function resolvePort(value: string | undefined): number {
  const port = value === undefined ? DEFAULT_API_PORT : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  app.enableShutdownHooks();
  await app.listen({ host: LISTEN_HOST, port: resolvePort(process.env.PORT) });
}

void bootstrap();
