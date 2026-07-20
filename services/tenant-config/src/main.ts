import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { loadEnv } from './config/env';

// BigInt (audit_log.id) is not JSON-serializable by default.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  // Admin Console (S11) is a browser SPA that calls this API directly with the
  // admin token. Reflect the request origin (the admin token still gates writes).
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['authorization', 'x-admin-token', 'x-admin-actor', 'content-type'],
    maxAge: 600,
  });
  app.enableShutdownHooks();

  const env = loadEnv();
  await app.listen(env.port, '0.0.0.0');
}

void bootstrap();
