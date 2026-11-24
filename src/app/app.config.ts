import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { DEMO_USERS } from './core/auth/demo-users';
import { mockApiInterceptor } from './core/mock/mock-api.interceptor';
import { USERS } from './core/mock/mock-db';
import { AppTitleStrategy } from './core/title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // withComponentInputBinding: route params such as :id are bound straight to input() signals.
    provideRouter(routes, withComponentInputBinding()),
    // Page titles: "Applications · Merchant Portal".
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // Order matters: auth attaches/refreshes tokens first; the mock backend stays LAST (it is the server).
    provideHttpClient(withInterceptors([authInterceptor, mockApiInterceptor])),
    // Mock-only wiring. To use a real API, remove this provider and mockApiInterceptor.
    { provide: DEMO_USERS, useValue: USERS },
  ],
};
