import { randomUUID } from 'node:crypto';

import { Module, type Provider } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { APP_ENV, type AppEnv, loadEnv } from './config/env';
import {
  EMBEDDING_CLIENT,
  FakeEmbeddingClient,
  HttpEmbeddingClient,
} from './embedding/embedding.client';
import { HealthController } from './health/health.controller';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { SEARCH_BACKEND } from './search/backend';
import { EsSearchBackend } from './search/es.backend';
import { FakeSearchBackend } from './search/fake.backend';
import { SearchController } from './search/search.controller';
import { SearchService } from './search/search.service';

const env = loadEnv();

const backendProvider: Provider = env.useFake
  ? { provide: SEARCH_BACKEND, useClass: FakeSearchBackend }
  : { provide: SEARCH_BACKEND, useFactory: (e: AppEnv) => new EsSearchBackend(e), inject: [APP_ENV] };

const embeddingProvider: Provider = env.useFake
  ? { provide: EMBEDDING_CLIENT, useFactory: () => new FakeEmbeddingClient() }
  : {
      provide: EMBEDDING_CLIENT,
      useFactory: (e: AppEnv) => new HttpEmbeddingClient(e.embeddingServiceUrl, e.embeddingTimeoutMs),
      inject: [APP_ENV],
    };

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.logLevel,
        genReqId: (req) =>
          (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
        autoLogging: true,
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
  ],
  controllers: [SearchController, HealthController, MetricsController],
  providers: [
    { provide: APP_ENV, useValue: env },
    backendProvider,
    embeddingProvider,
    MetricsService,
    SearchService,
  ],
})
export class AppModule {}
