import { Component } from '@angular/core';

import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  // The root component no longer defines a module; it's bootstrapped via
  // bootstrapApplication in main.ts.
  title = 'Chaabi Night V2';
}