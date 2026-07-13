import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const env = loadEnv();

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    // Per-key origin allowlist is enforced in AuthGuard; CORS reflects the
    // request origin so browsers can call the API. Tighten per deployment.
    origin: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['authorization', 'x-api-key', 'content-type', 'x-request-id'],
    maxAge: 600,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableShutdownHooks();

  await app.listen(env.port, '0.0.0.0');
}

void bootstrap();
