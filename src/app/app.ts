import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** App shell: skip link, top navigation and the routed outlet. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="visually-hidden-focusable" href="#main">Skip to content</a>
    <nav class="navbar navbar-expand navbar-dark bg-dark">
      <div class="container">
        <a class="navbar-brand" routerLink="/">Merchant Portal</a>
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <a
              class="nav-link"
              routerLink="/applications"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
              >Applications</a
            >
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="/applications/new" routerLinkActive="active"
              >New application</a
            >
          </li>
        </ul>
      </div>
    </nav>
    <main id="main" class="container py-4"><router-outlet /></main>
  `,
})
export class App {}
