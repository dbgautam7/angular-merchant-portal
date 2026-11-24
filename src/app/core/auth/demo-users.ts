import { InjectionToken } from '@angular/core';
import { User } from '../models';

/**
 * Demo accounts offered on the login page. app.config provides them from the mock backend's
 * seed data, so the login feature never imports mock code. With no provider the list is empty.
 */
export const DEMO_USERS = new InjectionToken<readonly User[]>('DEMO_USERS', {
  factory: () => [],
});
