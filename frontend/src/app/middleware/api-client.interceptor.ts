import {
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Frontend middleware: attaches a lightweight client hint header
 * for server-side tracing/diagnostics.
 */
export const apiClientInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const withHeader = req.clone({
    setHeaders: { 'x-fc-client': 'frontend-angular' },
  });
  return next(withHeader);
};
