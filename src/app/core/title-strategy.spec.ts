import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { AppTitleStrategy } from './title-strategy';

@Component({ template: '' })
class Page {}

describe('AppTitleStrategy', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'titled', title: 'Applications', component: Page },
          { path: 'untitled', component: Page },
        ]),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
      ],
    }),
  );

  it('adds the app name to each page title, and uses it alone when a route has none', async () => {
    const router = TestBed.inject(Router);
    const title = TestBed.inject(Title);

    await router.navigateByUrl('/titled');
    expect(title.getTitle()).toBe('Applications · Merchant Portal');

    await router.navigateByUrl('/untitled');
    expect(title.getTitle()).toBe('Merchant Portal');
  });
});
