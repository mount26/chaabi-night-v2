import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

// Bootstraps the Angular application using the standalone API.  Standalone
// components do not require an NgModule.  We provide the router and animations
// services at bootstrap time.
bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }))
  ]
}).catch((err) => console.error(err));