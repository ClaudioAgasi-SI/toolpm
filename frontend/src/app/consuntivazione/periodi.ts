import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import { type AnteprimaChiusura, type Mese, NOMI_STATO, type StatoRiga } from './modelli';
import { etichettaGiorno, totaleOre } from './ore';

const quante = (n: number) => `${n} ${n === 1 ? 'riga' : 'righe'}`;
const COLONNE: StatoRiga[] = ['bozza', 'inviata', 'approvataTL', 'respinta', 'approvata', 'chiusa'];
/** Intestazioni delle colonne: quante righe per stato. */
const TITOLI: Record<StatoRiga, string> = { bozza: 'In bozza', inviata: 'Inviate', approvataTL: 'Con via libera', respinta: 'Respinte', approvata: 'Approvate', chiusa: 'Chiuse' };

/**
 * Periodi (fase 3, blocco D4), pagina del controller: chiusura e riapertura dei mesi.
 * - Un mese per riga, dal più recente, con le righe per stato; si chiude in ordine e si riapre l'ultimo chiuso.
 * - Chiudi apre l'anteprima: senza righe non approvate si conferma; altrimenti l'elenco e la chiusura forzata con motivazione.
 * - Riapri chiede la motivazione. Sotto, i progetti con righe in attesa e nessun PM tra gli approvatori.
 */
@Component({
  selector: 'app-periodi',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="testata">
      <h1>Periodi</h1>
      <div class="azioni"><button type="button" (click)="carica()">Aggiorna</button></div>
    </header>
    <p class="tenue">
      Chiudere un mese ferma le sue ore: nessuno le modifica, le invia o le approva finché non lo riapri. I mesi si chiudono in ordine
      e si riaprono a partire dall'ultimo chiuso.
    </p>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    @if (messaggio()) {
      <p class="ok">{{ messaggio() }}</p>
    }

    @if (anteprima(); as ap) {
      <section class="pannello" aria-label="Chiusura del mese">
        <h2>Chiudere {{ ap.nome }}?</h2>
        @if (ap.bloccoOrdine) {
          <p class="errore">{{ ap.bloccoOrdine }}</p>
        } @else if (!ap.nonApprovate) {
          <p>Tutte le righe sono approvate: {{ quante(ap.conteggi.approvata) }} diventeranno chiuse.</p>
          <div class="pulsanti">
            <button type="button" class="primario" [disabled]="lavoro()" (click)="chiudi(ap.mese, false)">Chiudi il mese</button>
            <button type="button" (click)="anteprima.set(null)">Annulla</button>
          </div>
        } @else {
          <p>
            Ci sono ancora <strong>{{ quante(ap.nonApprovate) }} non approvate</strong>
            ({{ riepilogo(ap) }}). Falle approvare, oppure chiudi comunque: resteranno nel loro stato, ferme e fuori dai costi, finché non riapri il mese.
          </p>
          <table class="elenco">
            <thead><tr><th>Giorno</th><th>Risorsa</th><th>Progetto</th><th class="numero">Ore</th><th>Stato</th></tr></thead>
            <tbody>
              @for (r of ap.righe; track $index) {
                <tr><td>{{ etichettaGiorno(r.data) }}</td><td>{{ r.risorsa }}</td><td>{{ r.progetto }}</td><td class="numero">{{ totaleOre(r.minuti) }}</td><td>{{ nomiStato[r.stato] }}</td></tr>
              }
            </tbody>
          </table>
          @if (ap.troncato) {
            <p class="tenue">Mostrate le prime {{ ap.righe.length }}.</p>
          }
          <label class="motivazione">
            Motivazione della chiusura forzata
            <textarea name="motivazioneChiusura" rows="2" maxlength="500" [(ngModel)]="motivazione"></textarea>
          </label>
          <div class="pulsanti">
            <button type="button" class="pericolo" [disabled]="lavoro() || !motivazione.trim()" (click)="chiudi(ap.mese, true)">Chiudi comunque</button>
            <button type="button" (click)="anteprima.set(null)">Annulla</button>
          </div>
        }
      </section>
    }

    @if (riapertura(); as m) {
      <section class="pannello" aria-label="Riapertura del mese">
        <h2>Riaprire {{ m.nome }}?</h2>
        <p>Le righe chiuse tornano approvate; le ore del mese tornano modificabili secondo il loro stato.</p>
        <label class="motivazione">
          Motivazione
          <textarea name="motivazioneRiapertura" rows="2" maxlength="500" [(ngModel)]="motivazione"></textarea>
        </label>
        <div class="pulsanti">
          <button type="button" class="primario" [disabled]="lavoro() || !motivazione.trim()" (click)="riapri(m.mese)">Riapri il mese</button>
          <button type="button" (click)="riapertura.set(null)">Annulla</button>
        </div>
      </section>
    }

    @if (caricamento()) {
      <p class="tenue">Caricamento…</p>
    } @else {
      <table class="elenco mesi">
        <thead>
          <tr>
            <th>Mese</th>
            <th>Stato</th>
            @for (c of colonne; track c) {
              <th class="numero">{{ titoli[c] }}</th>
            }
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (m of mesi(); track m.mese) {
            <tr [attr.data-mese]="m.mese" [class.chiuso]="m.stato === 'chiuso'">
              <td class="nome-mese"><strong>{{ m.nome }}</strong></td>
              <td>
                @if (m.stato === 'chiuso') {
                  Chiuso{{ m.chiusura?.forzata ? ' (forzato)' : '' }}
                  <div class="tenue piccolo">{{ data(m.chiusura?.il) }}{{ m.chiusura?.motivazione ? ': ' + m.chiusura?.motivazione : '' }}</div>
                } @else {
                  Aperto
                  @if (m.riapertura) {
                    <div class="tenue piccolo">riaperto il {{ data(m.riapertura.il) }}: {{ m.riapertura.motivazione }}</div>
                  }
                }
              </td>
              @for (c of colonne; track c) {
                <td class="numero" [class.da-fare]="m.stato === 'aperto' && c !== 'approvata' && c !== 'chiusa' && m.conteggi[c] > 0">{{ m.conteggi[c] || '' }}</td>
              }
              <td class="azioni-riga">
                @if (m.chiudibile) {
                  <button type="button" (click)="apriAnteprima(m)">Chiudi…</button>
                }
                @if (m.riapribile) {
                  <button type="button" (click)="apriRiapertura(m)">Riapri…</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (senzaPM().length) {
        <h2>Progetti con righe in attesa e nessun PM tra gli approvatori</h2>
        <p class="tenue">Le loro righe le può approvare solo un PMSenior: aggiungi un PM al progetto.</p>
        <ul>
          @for (p of senzaPM(); track p._id) {
            <li><a [routerLink]="['/comuni/progetti', p._id]">{{ p.codice }} — {{ p.titolo }}</a></li>
          }
        </ul>
      }
    }
  `,
  styles: `
    .ok { color: #1a7f37; }
    .numero { text-align: right; font-variant-numeric: tabular-nums; }
    .da-fare { color: #b4561f; font-weight: 600; }
    .piccolo { font-size: 0.8rem; }
    .nome-mese { text-transform: capitalize; }
    tr.chiuso td { background: #f6f7f9; }
    .azioni-riga { white-space: nowrap; text-align: right; }
    .pannello { border: 1px solid #d5dbe7; background: #fbfcfe; border-radius: 6px; padding: 8px 14px; margin: 0.75rem 0;
      h2 { font-size: 1.05rem; margin: 0.25rem 0; }
    }
    .motivazione { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem; textarea { max-width: 48rem; } }
    .pulsanti { display: flex; gap: 0.5rem; margin: 0.5rem 0; }
    button.pericolo { background: #d1242f; border-color: #d1242f; color: #fff; }
    button:disabled { opacity: 0.5; }
    h2 { font-size: 1.05rem; margin-top: 1.5rem; }
  `,
})
export class Periodi {
  private readonly api = inject(ConsuntivazioneApiService);

  protected readonly colonne = COLONNE;
  protected readonly titoli = TITOLI;
  protected readonly nomiStato = NOMI_STATO;
  protected readonly etichettaGiorno = etichettaGiorno;
  protected readonly totaleOre = totaleOre;
  protected readonly quante = quante;

  protected readonly mesi = signal<Mese[]>([]);
  protected readonly senzaPM = signal<{ _id: string; codice: string; titolo: string }[]>([]);
  protected readonly anteprima = signal<AnteprimaChiusura | null>(null);
  protected readonly riapertura = signal<Mese | null>(null);
  protected readonly caricamento = signal(true);
  protected readonly lavoro = signal(false);
  protected readonly errore = signal('');
  protected readonly messaggio = signal('');
  protected motivazione = '';

  constructor() {
    this.carica();
  }

  protected carica() {
    this.caricamento.set(true);
    this.api.periodi().subscribe({
      next: (e) => {
        this.mesi.set(e.mesi);
        this.senzaPM.set(e.progettiSenzaPM);
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }

  protected data(il?: string) {
    return il ? new Date(il).toLocaleDateString('it-IT') : '';
  }

  protected riepilogo(ap: AnteprimaChiusura) {
    return (['bozza', 'inviata', 'approvataTL', 'respinta'] as StatoRiga[])
      .filter((s) => ap.conteggi[s])
      .map((s) => `${NOMI_STATO[s].toLowerCase()}: ${ap.conteggi[s]}`)
      .join(', ');
  }

  protected apriAnteprima(m: Mese) {
    this.pulisci();
    this.riapertura.set(null);
    this.api.anteprimaChiusura(m.mese).subscribe({ next: (a) => this.anteprima.set(a), error: (e) => this.errore.set(messaggioErrore(e)) });
  }

  protected apriRiapertura(m: Mese) {
    this.pulisci();
    this.anteprima.set(null);
    this.riapertura.set(m);
  }

  protected chiudi(mese: string, forzata: boolean) {
    this.lavoro.set(true);
    this.api.chiudiMese(mese, forzata, forzata ? this.motivazione.trim() : undefined).subscribe({
      next: (r) => {
        this.fine(`${r.nome} chiuso: ${quante(r.righeChiuse)} approvate ora chiuse${r.nonApprovate ? `, ${quante(r.nonApprovate)} non approvate ferme` : ''}.`);
        this.anteprima.set(null);
      },
      error: (e) => this.sbaglio(e),
    });
  }

  protected riapri(mese: string) {
    this.lavoro.set(true);
    this.api.riapriMese(mese, this.motivazione.trim()).subscribe({
      next: (r) => {
        this.fine(`${r.nome} riaperto: ${quante(r.righeRiaperte)} tornate approvate.`);
        this.riapertura.set(null);
      },
      error: (e) => this.sbaglio(e),
    });
  }

  private pulisci() {
    this.errore.set('');
    this.messaggio.set('');
    this.motivazione = '';
  }

  private fine(testo: string) {
    this.lavoro.set(false);
    this.messaggio.set(testo);
    this.motivazione = '';
    this.carica();
  }

  private sbaglio(e: unknown) {
    this.lavoro.set(false);
    this.errore.set(messaggioErrore(e));
  }
}
