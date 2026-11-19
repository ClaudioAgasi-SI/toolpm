import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { messaggioErrore } from '../../core/errori';
import { SessioneService } from '../../core/sessione.service';
import { ComuniApiService } from '../comuni-api.service';
import { etichettaStato, type Progetto, type RisorsaAnagrafica, STATI_PROGETTO, type VoceAnagrafica } from '../modelli';

/** Elenco dei progetti, con filtro per stato e "solo i miei". */
@Component({
  selector: 'app-progetti-elenco',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="testata">
      <h1>Progetti</h1>
      <div class="azioni">
        <select [ngModel]="stato()" (ngModelChange)="stato.set($event)" aria-label="Stato">
          <option value="">Tutti gli stati</option>
          @for (s of stati; track s.valore) {
            <option [value]="s.valore">{{ s.etichetta }}</option>
          }
        </select>
        <label><input type="checkbox" [ngModel]="soloMiei()" (ngModelChange)="soloMiei.set($event); carica()" /> solo quelli che gestisco</label>
        <input type="search" placeholder="Cerca codice, titolo, cliente…" [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" />
        @if (sessione.puo('creareProgetto')) {
          <a class="bottone primario" routerLink="/comuni/progetti/nuovo">+ Nuovo progetto</a>
        }
      </div>
    </header>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    <table class="elenco">
      <thead>
        <tr><th>Codice</th><th>Titolo</th><th>Cliente</th><th>Centro di costo</th><th>Stato</th><th>Completamento</th><th>PM</th><th>TL</th></tr>
      </thead>
      <tbody>
        @for (p of filtrati(); track p._id) {
          <tr>
            <td><a [routerLink]="['/comuni/progetti', p._id]"><strong>{{ p.codice }}</strong></a></td>
            <td>{{ p.titolo }}</td>
            <td>{{ nomeVoce(clienti(), p.clienteId) || '—' }}</td>
            <td>{{ nomeVoce(centri(), p.centroCostoId) }}</td>
            <td><span class="stato" [class]="p.stato">{{ etichettaStato(p.stato) }}</span></td>
            <td><span class="barra-percentuale"><span [style.width.%]="p.percentualeCompletamento"></span></span>{{ p.percentualeCompletamento }}%</td>
            <td>{{ nomi(p, 'PM') }}</td>
            <td>{{ nomi(p, 'TL') }}</td>
          </tr>
        } @empty {
          <tr><td colspan="8" class="tenue">{{ caricato() ? 'Nessun progetto.' : 'Caricamento…' }}</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class ProgettiElenco {
  private readonly api = inject(ComuniApiService);
  protected readonly sessione = inject(SessioneService);
  protected readonly stati = STATI_PROGETTO;
  protected readonly etichettaStato = etichettaStato;

  protected readonly progetti = signal<Progetto[]>([]);
  protected readonly clienti = signal<VoceAnagrafica[]>([]);
  protected readonly centri = signal<VoceAnagrafica[]>([]);
  private readonly risorse = signal<Map<string, RisorsaAnagrafica>>(new Map());
  protected readonly stato = signal('');
  protected readonly soloMiei = signal(false);
  protected readonly filtro = signal('');
  protected readonly errore = signal('');
  protected readonly caricato = signal(false);

  protected readonly filtrati = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    return this.progetti()
      .filter((p) => !this.stato() || p.stato === this.stato())
      .filter((p) => !f || `${p.codice} ${p.titolo} ${this.nomeVoce(this.clienti(), p.clienteId)}`.toLowerCase().includes(f));
  });

  constructor() {
    forkJoin({ clienti: this.api.voci('clienti'), centri: this.api.voci('centri-costo'), risorse: this.api.risorse() }).subscribe({
      next: ({ clienti, centri, risorse }) => {
        this.clienti.set(clienti);
        this.centri.set(centri);
        this.risorse.set(new Map(risorse.map((r) => [r._id!, r])));
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
    this.carica();
  }

  protected carica() {
    this.api.progetti({ gestibili: this.soloMiei() }).subscribe({
      next: (p) => {
        this.progetti.set(p);
        this.caricato.set(true);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected nomeVoce(voci: VoceAnagrafica[], id?: string | null) {
    const v = id ? voci.find((x) => x._id === id) : undefined;
    return v ? (v.ragioneSociale ?? v.descrizione ?? v.codice) : '';
  }

  protected nomi(p: Progetto, profilo: 'TL' | 'PM') {
    return p.approvatori
      .filter((a) => a.profilo === profilo)
      .map((a) => {
        const r = this.risorse().get(a.risorsaId);
        return r ? `${r.cognome} ${r.nome}` : '?';
      })
      .join(', ');
  }
}
