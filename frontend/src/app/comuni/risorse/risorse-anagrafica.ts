import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { messaggioErrore } from '../../core/errori';
import { SessioneService } from '../../core/sessione.service';
import { ComuniApiService } from '../comuni-api.service';
import type { RisorsaAnagrafica, VoceAnagrafica } from '../modelli';

/** Elenco delle risorse con i dati anagrafici (email, ruolo attuale, orario, uscita). */
@Component({
  selector: 'app-risorse-anagrafica',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="testata">
      <h1>Risorse</h1>
      <div class="azioni">
        <label><input type="checkbox" [ngModel]="soloAttive()" (ngModelChange)="soloAttive.set($event)" /> solo in forza</label>
        <input type="search" placeholder="Cerca per nome o email…" [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" />
        @if (sessione.puo('gestireRisorse')) {
          <a class="bottone primario" routerLink="/comuni/risorse/nuova">+ Nuova risorsa</a>
        }
      </div>
    </header>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    <table class="elenco">
      <thead>
        <tr><th>Cognome e nome</th><th>Email</th><th>Cellulare</th><th>Ruolo</th><th>Ore/giorno</th><th>Uscita</th><th></th></tr>
      </thead>
      <tbody>
        @for (r of filtrate(); track r._id) {
          <tr [class.disattivo]="uscita(r)">
            <td><a [routerLink]="['/comuni/risorse', r._id]">{{ r.cognome }} {{ r.nome }}</a></td>
            <td>
              @if (r.email) {
                {{ r.email }}
              } @else {
                <span class="tenue">da completare</span>
              }
            </td>
            <td>{{ r.cellulare }}</td>
            <td>{{ ruoloAttuale(r) }}</td>
            <td>{{ r.oreContrattualiGiorno }}</td>
            <td>{{ r.dataUscita?.slice(0, 10) }}</td>
            <td><a [routerLink]="['/pianificatore/risorse', r._id]">Skill e pianificazione</a></td>
          </tr>
        } @empty {
          <tr><td colspan="7" class="tenue">{{ caricato() ? 'Nessuna risorsa.' : 'Caricamento…' }}</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class RisorseAnagrafica {
  private readonly api = inject(ComuniApiService);
  protected readonly sessione = inject(SessioneService);

  protected readonly risorse = signal<RisorsaAnagrafica[]>([]);
  private readonly ruoli = signal<Map<string, VoceAnagrafica>>(new Map());
  protected readonly filtro = signal('');
  protected readonly soloAttive = signal(true);
  protected readonly errore = signal('');
  protected readonly caricato = signal(false);

  protected readonly filtrate = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    return this.risorse()
      .filter((r) => !this.soloAttive() || !this.uscita(r))
      .filter((r) => !f || `${r.cognome} ${r.nome} ${r.email ?? ''}`.toLowerCase().includes(f));
  });

  constructor() {
    forkJoin({ risorse: this.api.risorse(), ruoli: this.api.voci('ruoli') }).subscribe({
      next: ({ risorse, ruoli }) => {
        this.risorse.set(risorse);
        this.ruoli.set(new Map(ruoli.map((r) => [r._id, r])));
        this.caricato.set(true);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected uscita(r: RisorsaAnagrafica) {
    return !!r.dataUscita && r.dataUscita.slice(0, 10) < new Date().toISOString().slice(0, 10);
  }

  /** Ruolo con la decorrenza più recente non futura. */
  protected ruoloAttuale(r: RisorsaAnagrafica) {
    const oggi = new Date().toISOString().slice(0, 10);
    const voce = [...r.storicoRuoli].reverse().find((s) => s.dal.slice(0, 10) <= oggi);
    return voce ? (this.ruoli().get(voce.ruoloId)?.descrizione ?? '') : '';
  }
}
