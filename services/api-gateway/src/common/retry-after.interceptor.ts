import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { type Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/** Adds a `Retry-After` header to 503 responses so clients back off gracefully. */
@Injectable()
export class RetryAfterInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err) => {
        if (err instanceof HttpException && err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE) {
          const res = context.switchToHttp().getResponse<Response>();
          if (!res.headersSent) res.setHeader('Retry-After', '1');
        }
        return throwError(() => err);
      }),
    );
  }
}
