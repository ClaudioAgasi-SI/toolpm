import { Component, effect, inject, input, signal } from '@angular/core';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import type { CronologiaRiga as Cronologia } from './modelli';
import { descriviModifica, NOMI_OPERAZIONE, quando } from './storico-testi';

/** Cronologia di una riga di consuntivo (fase 3, blocco D5): inviata, via libera, approvata, respinta... */
@Component({
  selector: 'app-cronologia-riga',
  template: `
    <section class="cronologia" aria-label="Cronologia della riga">
      @if (errore()) {
        <p class="errore">{{ errore() }}</p>
      } @else if (!dati()) {
        <p class="tenue">Caricamento…</p>
      } @else if (!dati()!.voci.length) {
        <p class="tenue">Nessun passaggio registrato: la riga è ancora in bozza.</p>
      } @else {
        <ol>
          @for (v of dati()!.voci; track $index) {
            <li>
              <span class="quando">{{ quando(v.il) }}</span>
              <strong>{{ nomeOperazione(v.operazione) }}</strong>
              <span class="tenue">— {{ v.nomeUtente }}</span>
              @if (v.motivazione) {
                <span class="motivazione">“{{ v.motivazione }}”</span>
              }
              @if (dettaglio(v); as d) {
                <div class="tenue dettaglio">{{ d }}</div>
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: `
    .cronologia { font-size: 0.85rem; margin: 0.35rem 0; }
    ol { margin: 0; padding-left: 1.2rem; }
    li { margin: 0.15rem 0; }
    .quando { font-variant-numeric: tabular-nums; margin-right: 0.4rem; color: #5a6478; }
    .motivazione { margin-left: 0.4rem; color: #d1242f; }
    .dettaglio { font-size: 0.8rem; }
  `,
})
export class CronologiaRiga {
  private readonly api = inject(ConsuntivazioneApiService);
  readonly rigaId = input.required<string>();
  protected readonly dati = signal<Cronologia | null>(null);
  protected readonly errore = signal('');
  protected readonly quando = quando;

  constructor() {
    effect(() => {
      const id = this.rigaId();
      this.dati.set(null);
      this.errore.set('');
      this.api.cronologiaRiga(id).subscribe({ next: (d) => this.dati.set(d), error: (e) => this.errore.set(messaggioErrore(e)) });
    });
  }

  protected nomeOperazione(op: string) {
    return NOMI_OPERAZIONE[op] ?? op;
  }

  protected dettaglio(v: Cronologia['voci'][number]) {
    // Le voci di stato dicono già tutto con il nome; le altre mostrano i campi cambiati.
    if (['invio', 'ritiro', 'viaLibera', 'approvazione', 'rifiuto'].includes(v.operazione)) return '';
    return descriviModifica(v.prima, v.dopo);
  }
}
