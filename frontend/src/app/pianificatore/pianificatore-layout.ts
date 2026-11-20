import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessioneService } from '../core/sessione.service';

/** Cornice della sezione Pianificatore: sotto-menu e area delle pagine. */
@Component({
  selector: 'app-pianificatore-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="sottomenu" aria-label="Pianificatore risorse">
      <span class="titolo-sezione">Pianificatore risorse allocate</span>
      <a routerLink="pianificazione" routerLinkActive="attivo">Pianificazione</a>
      <a routerLink="risorse" routerLinkActive="attivo">Risorse</a>
      <a routerLink="anagrafiche" routerLinkActive="attivo">Anagrafiche</a>
      @if (miaRisorsa(); as id) {
        <a [routerLink]="['risorse', id]" routerLinkActive="attivo">Le mie competenze</a>
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
export class PianificatoreLayout {
  private readonly sessione = inject(SessioneService);
  /** Risorsa dell'utente collegato: ognuno cura le proprie skill e certificazioni. */
  protected readonly miaRisorsa = computed(() => this.sessione.utente()?.risorsaId ?? null);
}
