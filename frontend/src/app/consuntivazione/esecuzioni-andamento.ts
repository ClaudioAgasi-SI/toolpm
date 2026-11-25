import { Component, DestroyRef, inject, signal } from '@angular/core';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import type { EsecuzioneBatch, StatoEsecuzione, StatoEsecuzioni } from './modelli';

const ESITO: Record<StatoEsecuzione, string> = {
  inCorso: 'In corso',
  completata: 'Completata',
  completataConAvvisi: 'Completata con avvisi',
  fallita: 'Fallita',
  interrotta: 'Interrotta',
};
const TONO: Record<StatoEsecuzione, string> = { inCorso: 'linea', completata: 'bene', completataConAvvisi: 'attenzione', fallita: 'male', interrotta: 'male' };

/**
 * Procedura notturna dell'andamento EVM nella pagina Periodi (fase 4, blocco E3; decisioni 12 e 13): ultima
 * esecuzione con esito, motivo, giorni elaborati e avvisi; "Esegui ora"; le esecuzioni recenti.
 */
@Component({
  selector: 'app-esecuzioni-andamento',
  template: `
    <section class="riquadro-batch" aria-label="Andamento EVM">
      <header class="riga">
        <h2>Andamento degli indicatori (procedura notturna)</h2>
        <button type="button" (click)="esegui()" [disabled]="lavoro() || stato()?.ultima?.stato === 'inCorso'">Esegui ora</button>
      </header>
      <p class="tenue piccolo">
        Ogni notte alle 2:00 (e all'avvio del sistema) salva gli indicatori di ogni progetto In corso per i giorni mancanti fino a ieri,
        ripartendo dall'ultimo giorno completato.
      </p>
      @if (errore()) {
        <p class="errore">{{ errore() }}</p>
      }
      @if (stato(); as s) {
        <p>
          Dati aggiornati al <strong>{{ s.aggiornatoAl ? giorno(s.aggiornatoAl) : '—' }}</strong>.
          @if (s.avviso) {
            <span class="avviso-testo">{{ s.avviso }}</span>
          }
        </p>
        @if (s.ultima; as u) {
          <dl class="ultima">
            <dt>Ultima esecuzione</dt>
            <dd>
              <span class="pallino" [attr.data-tono]="tono[u.stato]">{{ esito[u.stato] }}</span>
              {{ quando(u.inizio) }}{{ u.fine ? ' – ' + ora(u.fine) : '' }} · {{ chi(u.avviataDa) }}
            </dd>
            <dt>Giorni elaborati</dt>
            <dd>{{ u.giorniElaborati ? u.giorniElaborati + (u.daGiorno ? ' (dal ' + giorno(u.daGiorno) + ')' : '') : (u.stato === 'inCorso' ? '0' : 'nessuno: i dati erano già aggiornati') }}</dd>
            @if (u.motivo) {
              <dt>Motivo</dt>
              <dd>{{ u.motivo }}</dd>
            }
            @if (u.avvisi.length) {
              <dt>Avvisi</dt>
              <dd>
                <ul>
                  @for (a of u.avvisi; track $index) {
                    <li>{{ a }}</li>
                  }
                </ul>
              </dd>
            }
          </dl>
        }
        @if (s.recenti.length > 1) {
          <details>
            <summary class="piccolo">Esecuzioni recenti</summary>
            <table class="elenco piccolo">
              <thead><tr><th>Inizio</th><th>Esito</th><th>Avviata da</th><th class="numero">Giorni</th><th>Fino al</th><th>Motivo</th></tr></thead>
              <tbody>
                @for (e of s.recenti; track e._id) {
                  <tr>
                    <td>{{ quando(e.inizio) }}</td>
                    <td><span class="pallino" [attr.data-tono]="tono[e.stato]">{{ esito[e.stato] }}</span></td>
                    <td>{{ chi(e.avviataDa) }}</td>
                    <td class="numero">{{ e.giorniElaborati }}</td>
                    <td>{{ e.ultimoGiornoCompletato ? giorno(e.ultimoGiornoCompletato) : '—' }}</td>
                    <td>{{ e.motivo ?? '' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </details>
        }
      }
    </section>
  `,
  styles: `
    .riquadro-batch { border: 1px solid #d5dbe7; background: #fbfcfe; border-radius: 6px; padding: 8px 14px; margin: 1.5rem 0 0.75rem; }
    .riga { display: flex; justify-content: space-between; align-items: center; gap: 1rem; h2 { font-size: 1.05rem; margin: 0.25rem 0; } }
    .piccolo { font-size: 0.8rem; }
    .numero { text-align: right; font-variant-numeric: tabular-nums; }
    .avviso-testo { color: #9a5b00; margin-left: 0.35rem; }
    .ultima { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 1rem; margin: 0.25rem 0;
      dt { color: #5a6478; } dd { margin: 0; } ul { margin: 0; padding-left: 1.1rem; } }
    button:disabled { opacity: 0.5; }
  `,
})
export class EsecuzioniAndamento {
  private readonly api = inject(ConsuntivazioneApiService);
  protected readonly esito = ESITO;
  protected readonly tono = TONO;
  protected readonly stato = signal<StatoEsecuzioni | null>(null);
  protected readonly lavoro = signal(false);
  protected readonly errore = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.carica();
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  protected carica() {
    this.api.esecuzioniBatch().subscribe({
      next: (s) => {
        this.stato.set(s);
        // Mentre è in corso, si aggiorna da sola ogni 3 secondi.
        if (this.timer) clearTimeout(this.timer);
        if (s.ultima?.stato === 'inCorso') this.timer = setTimeout(() => this.carica(), 3000);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected esegui() {
    this.lavoro.set(true);
    this.errore.set('');
    this.api.eseguiAndamentoOra().subscribe({
      next: () => {
        this.lavoro.set(false);
        this.carica();
      },
      error: (e) => {
        this.lavoro.set(false);
        this.errore.set(messaggioErrore(e));
        this.carica();
      },
    });
  }

  protected giorno(d: string) {
    return new Date(d).toLocaleDateString('it-IT', { timeZone: 'UTC' });
  }

  protected quando(d: string) {
    return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  protected ora(d: string) {
    return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  protected chi(avviataDa: EsecuzioneBatch['avviataDa']) {
    if (avviataDa === 'notturna') return 'notturna';
    if (avviataDa === 'avvio') return 'all\'avvio';
    return 'Esegui ora';
  }
}
