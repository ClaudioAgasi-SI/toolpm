import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, messaggioErrore } from '../api.service';
import { Risorsa } from '../models';

@Component({
  selector: 'app-risorse-elenco',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="testata">
      <h1>Risorse</h1>
      <div class="azioni">
        <input type="search" placeholder="Cerca per nome o skill…" [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" />
        <a class="bottone primario" routerLink="/pianificatore/risorse/nuova">+ Nuova risorsa</a>
      </div>
    </header>

    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }

    <table class="elenco">
      <thead>
        <tr><th>Cognome e nome</th><th>Skill tecniche</th><th>Skill funzionali / ambito</th><th>Mesi pianificati</th></tr>
      </thead>
      <tbody>
        @for (r of filtrate(); track r._id) {
          <tr>
            <td><a [routerLink]="['/pianificatore/risorse', r._id]">{{ r.cognome }} {{ r.nome }}</a></td>
            <td>
              @for (s of r.skillTecnici; track $index) {
                <span class="etichetta">{{ s.skillName }} <small>{{ s.rate }}</small></span>
              }
            </td>
            <td>
              @for (s of r.skillFunzionali.concat(r.skillAmbiti); track $index) {
                <span class="etichetta">{{ s.skillName }} <small>{{ s.rate }}</small></span>
              }
            </td>
            <td>{{ mesiPianificati(r) }}</td>
          </tr>
        } @empty {
          <tr><td colspan="4">{{ caricato() ? 'Nessuna risorsa trovata.' : 'Caricamento…' }}</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    .testata { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    .azioni { display: flex; gap: 0.5rem; }
    .elenco { width: 100%; border-collapse: collapse; }
    .elenco th, .elenco td { text-align: left; padding: 8px; border-bottom: 1px solid var(--bordo); vertical-align: top; }
    .elenco th { font-size: 0.85rem; color: var(--testo-tenue); }
  `,
})
export class RisorseElenco {
  private readonly api = inject(ApiService);
  protected readonly risorse = signal<Risorsa[]>([]);
  protected readonly filtro = signal('');
  protected readonly errore = signal('');
  protected readonly caricato = signal(false);

  protected readonly filtrate = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    if (!f) return this.risorse();
    return this.risorse().filter((r) =>
      [r.cognome, r.nome, ...[...r.skillTecnici, ...r.skillFunzionali, ...r.skillAmbiti].map((s) => s.skillName)]
        .join(' ')
        .toLowerCase()
        .includes(f),
    );
  });

  constructor() {
    this.api.risorse().subscribe({
      next: (r) => {
        this.risorse.set(r);
        this.caricato.set(true);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  /** Numero di mesi con almeno un'allocazione reale (esclude i segnaposto). */
  protected mesiPianificati(r: Risorsa): number {
    return new Set(r.planned.filter((p) => (p.percentualeAllocazione ?? 0) > 0).map((p) => p.mese)).size;
  }
}
