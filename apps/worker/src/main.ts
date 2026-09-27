import "reflect-metadata";

import type { IncomingMessage } from "node:http";

import { loadServiceConfig } from "@royal-palace/config/environment";
import {
  createLoggerOptions,
  createServiceLogger,
  REQUEST_ID_HEADER,
  resolveRequestContext,
  StructuredLogger,
  TRACEPARENT_HEADER,
} from "@royal-palace/config/observability";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";

import { AppModule } from "./app.module.js";

const LISTEN_HOST = "0.0.0.0";

async function bootstrap(): Promise<void> {
  const config = loadServiceConfig("worker");
  const serviceLogger = createServiceLogger(config);
  const adapter = new FastifyAdapter({
    disableRequestLogging: true,
    genReqId(request: IncomingMessage) {
      return resolveRequestContext(request.headers).requestId;
    },
    logger: createLoggerOptions(config),
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config),
    adapter,
    {
      bufferLogs: true,
      logger: new StructuredLogger(serviceLogger),
    },
  );
  const server = app.getHttpAdapter().getInstance() as FastifyInstance;

  server.addHook("onRequest", (request, reply, done) => {
    const context = resolveRequestContext({
      ...request.headers,
      [REQUEST_ID_HEADER]: request.id,
    });
    request.log = request.log.child({ traceId: context.traceId });
    reply.header(REQUEST_ID_HEADER, context.requestId);
    reply.header(TRACEPARENT_HEADER, context.traceparent);
    request.log.info({ req: request }, "request received");
    done();
  });
  server.addHook("onResponse", (request, reply, done) => {
    request.log.info({ res: reply, responseTime: reply.elapsedTime }, "request completed");
    done();
  });

  app.enableShutdownHooks();
  await app.listen({ host: LISTEN_HOST, port: config.port });
}

void bootstrap();
