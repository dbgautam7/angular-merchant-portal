import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { mockApiInterceptor } from './core/mock/mock-api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // withComponentInputBinding: route params such as :id are bound straight to input() signals.
    provideRouter(routes, withComponentInputBinding()),
    // The in-memory mock backend must stay LAST in the chain: it acts as the server.
    provideHttpClient(withInterceptors([mockApiInterceptor])),
  ],
};
