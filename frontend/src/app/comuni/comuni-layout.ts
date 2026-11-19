import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessioneService } from '../core/sessione.service';

/** Cornice della sezione Anagrafiche (modulo Comuni): sotto-menu e area delle pagine. */
@Component({
  selector: 'app-comuni-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="sottomenu" aria-label="Anagrafiche">
      <span class="titolo-sezione">Anagrafiche</span>
      <a routerLink="progetti" routerLinkActive="attivo">Progetti</a>
      <a routerLink="risorse" routerLinkActive="attivo">Risorse</a>
      <a routerLink="clienti" routerLinkActive="attivo">Clienti</a>
      <a routerLink="centri-costo" routerLinkActive="attivo">Centri di costo</a>
      <a routerLink="ruoli" routerLinkActive="attivo">Ruoli</a>
      @if (sessione.haRuolo('admin')) {
        <a routerLink="utenti" routerLinkActive="attivo">Utenti</a>
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
    .titolo-sezione { font-weight: 600; color: #1f2a44; margin-right: 0.75rem; }
  `,
})
export class ComuniLayout {
  protected readonly sessione = inject(SessioneService);
}
