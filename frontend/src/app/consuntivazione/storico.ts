import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import type { VoceStorico } from './modelli';
import { oggi, piuGiorni } from './ore';
import { descriviModifica, NOMI_COLLEZIONE, NOMI_OPERAZIONE, quando, valore } from './storico-testi';

/**
 * Storico delle modifiche (fase 3, blocco D5), per controller e PMSenior: chi ha fatto cosa e quando,
 * con i valori prima e dopo. Filtri per tipo di dato, operazione e periodo.
 */
@Component({
  selector: 'app-storico',
  imports: [FormsModule],
  template: `
    <header class="testata">
      <h1>Storico delle modifiche</h1>
      <div class="azioni filtri">
        <label>
          Dato
          <select name="collezione" [(ngModel)]="collezione" (ngModelChange)="carica()">
            <option value="">tutti</option>
            @for (c of collezioni; track c[0]) {
              <option [value]="c[0]">{{ c[1] }}</option>
            }
          </select>
        </label>
        <label>
          Operazione
          <select name="operazione" [(ngModel)]="operazione" (ngModelChange)="carica()">
            <option value="">tutte</option>
            @for (o of operazioni; track o[0]) {
              <option [value]="o[0]">{{ o[1] }}</option>
            }
          </select>
        </label>
        <label>dal <input type="date" name="da" [(ngModel)]="da" /></label>
        <label>al <input type="date" name="a" [(ngModel)]="a" /></label>
        <button type="button" (click)="carica()">Aggiorna</button>
      </div>
    </header>
    <p class="tenue">Ogni modifica a consuntivi, mesi, progetti, attività, tipologie e tariffe, con chi l'ha fatta. Lo storico non si modifica né si cancella.</p>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    @if (caricamento()) {
      <p class="tenue">Caricamento…</p>
    } @else if (!voci().length) {
      <p class="tenue">Nessuna modifica con questi filtri.</p>
    } @else {
      <table class="elenco">
        <thead><tr><th>Quando</th><th>Chi</th><th>Dato</th><th>Operazione</th><th>Dettaglio</th></tr></thead>
        <tbody>
          @for (v of voci(); track v._id) {
            <tr>
              <td class="quando">{{ quando(v.il) }}</td>
              <td>{{ v.nomeUtente }}</td>
              <td>{{ nomeCollezione(v.collezione) }} <strong>{{ v.documento }}</strong></td>
              <td>{{ nomeOperazione(v.operazione) }}</td>
              <td class="dettaglio">
                {{ dettaglio(v) }}
                @if (v.motivazione) {
                  <span class="motivazione">“{{ v.motivazione }}”</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (troncato()) {
        <p class="tenue">Mostrate le {{ voci().length }} più recenti: restringi il periodo o i filtri.</p>
      }
    }
  `,
  styles: `
    .filtri { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap;
      label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; color: #5a6478; }
    }
    .quando { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .dettaglio { font-size: 0.85rem; max-width: 40rem; }
    .motivazione { color: #d1242f; margin-left: 0.3rem; }
  `,
})
export class Storico {
  private readonly api = inject(ConsuntivazioneApiService);
  protected readonly collezioni = Object.entries(NOMI_COLLEZIONE);
  protected readonly operazioni = Object.entries(NOMI_OPERAZIONE);
  protected readonly quando = quando;

  protected collezione = '';
  protected operazione = '';
  protected da = piuGiorni(oggi(), -30);
  protected a = oggi();
  protected readonly voci = signal<VoceStorico[]>([]);
  protected readonly troncato = signal(false);
  protected readonly caricamento = signal(true);
  protected readonly errore = signal('');

  constructor() {
    this.carica();
  }

  protected carica() {
    this.caricamento.set(true);
    this.errore.set('');
    this.api.storico({ collezione: this.collezione, operazione: this.operazione, da: this.da, a: this.a }).subscribe({
      next: (r) => {
        this.voci.set(r.voci);
        this.troncato.set(r.troncato);
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }

  protected nomeCollezione(c: string) {
    return NOMI_COLLEZIONE[c] ?? c;
  }

  protected nomeOperazione(o: string) {
    return NOMI_OPERAZIONE[o] ?? o;
  }

  /** Per le voci su più righe (invio, ricalcolo...) il numero di righe; per le altre i campi cambiati. */
  protected dettaglio(v: VoceStorico) {
    if (Array.isArray(v.prima)) {
      const n = v.righeIds.length;
      const righe = `${n} ${n === 1 ? 'riga' : 'righe'}`;
      if (v.operazione === 'ricalcolo') {
        const somma = (x: unknown) => (Array.isArray(x) ? x.reduce((s: number, e: { costo?: number | null }) => s + (e.costo ?? 0), 0) : 0);
        return `${righe}: costo ${valore('costo', somma(v.prima))} → ${valore('costo', somma(v.dopo))}`;
      }
      return righe;
    }
    if (v.collezione === 'consuntivi' && v.righeIds.length && !['correzione', 'cancellazione'].includes(v.operazione)) {
      return `${v.righeIds.length} ${v.righeIds.length === 1 ? 'riga' : 'righe'}`;
    }
    return descriviModifica(v.prima, v.dopo);
  }
}
