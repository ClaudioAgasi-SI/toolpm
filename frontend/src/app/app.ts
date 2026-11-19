import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessioneService } from './core/sessione.service';
import { SEZIONI } from './sezioni';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly sessione = inject(SessioneService);
  readonly sezioni = SEZIONI;
}
