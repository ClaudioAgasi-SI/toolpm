import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessioneService } from '../core/sessione.service';

/** Cornice della sezione Consuntivazione: sotto-menu e area delle pagine. */
@Component({
  selector: 'app-consuntivazione-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="sottomenu" aria-label="Consuntivazione">
      <a class="titolo-sezione" routerLink="." [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="attivo">Consuntivazione</a>
      @if (sessione.puo('consuntivare')) {
        <a routerLink="settimana" routerLinkActive="attivo">Il mio consuntivo</a>
      }
      @if (sessione.puo('gestireTipologieCosto')) {
        <a routerLink="tipologie" routerLinkActive="attivo">Tipologie di costo</a>
      }
      @if (sessione.puo('gestireTariffe')) {
        <a routerLink="tariffe" routerLinkActive="attivo">Tariffe</a>
        <a routerLink="da-valorizzare" routerLinkActive="attivo">Da valorizzare</a>
      }
    </nav>
    <router-outlet />
  `,
  styles: `
    .sottomenu {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      margin: -1rem -1.5rem 1rem;
      padding: 0 1.5rem;
      height: 42px;
      background: #eef1f7;
      border-bottom: 1px solid #d5dbe7;
      a { color: #44506a; text-decoration: none; padding: 4px 0; border-bottom: 2px solid transparent; }
      a.attivo, a:hover { color: #1f2a44; border-bottom-color: #1f6feb; }
    }
    .titolo-sezione { font-weight: 600; color: #1f2a44 !important; margin-right: 0.75rem; }
  `,
})
export class ConsuntivazioneLayout {
  protected readonly sessione = inject(SessioneService);
}
