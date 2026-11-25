import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Schede dei report (fase 4): costi e pianificato contro consuntivato. */
@Component({
  selector: 'app-report-schede',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="schede" aria-label="Report">
      <a routerLink="/consuntivazione/report/costi" routerLinkActive="attiva">Costi</a>
      <a routerLink="/consuntivazione/report/pianificato" routerLinkActive="attiva">Pianificato e consuntivato</a>
    </nav>
  `,
  styles: `
    .schede { display: flex; gap: 1.25rem; border-bottom: 1px solid #dde2ea; margin: 0 0 0.75rem; }
    a { padding: 0.35rem 0; color: #3d4556; text-decoration: none; border-bottom: 2px solid transparent; }
    a.attiva { color: #1c63b7; border-bottom-color: #1c63b7; font-weight: 600; }
  `,
})
export class ReportSchede {}
