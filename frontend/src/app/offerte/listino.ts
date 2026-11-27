import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import { ComuniApiService } from '../comuni/comuni-api.service';
import type { VoceAnagrafica } from '../comuni/modelli';
import { messaggioErrore } from '../core/errori';
import { SessioneService } from '../core/sessione.service';
import { ElencoListino, type ModificaVoceListino } from './elenco-listino';
import { type DatiVoceListino, euroGiorno, type ListinoApplicabile, margineGiorno, type RuoloApplicabile, type VoceListino } from './modelli';
import { OfferteApiService } from './offerte-api.service';

/**
 * Listino di vendita (fase 5, blocco F1), sotto /offerte/listino.
 * - In alto si sceglie il listino (standard o di un cliente) e la data: la tabella mostra per ogni ruolo la
 *   tariffa giornaliera che un'offerta userebbe in quella data, con la provenienza (del cliente o standard), e
 *   segnala i ruoli senza tariffa di vendita o senza costo; mostra anche il costo giornaliero e il margine
 *   della giornata a listino (a tutti quelli che leggono il listino, decisione del 27/11/2026).
 * - Cliccando un ruolo si vedono i suoi periodi nel listino scelto; PMSenior e controller li gestiscono.
 */
@Component({
  selector: 'app-listino',
  imports: [FormsModule, RouterLink, ElencoListino],
  template: `
    <p class="briciole"><a routerLink="/offerte">Offerte e preventivi</a> ›</p>
    <header class="testata">
      <h1>Listino di vendita</h1>
      <div class="azioni">
        <label>
          Listino
          <select name="cliente" [ngModel]="cliente()" (ngModelChange)="scegliCliente($event)">
            <option value="">Standard</option>
            @for (c of clienti(); track c._id) {
              <option [value]="c._id">{{ c.codice }} — {{ c.ragioneSociale }}</option>
            }
          </select>
        </label>
        <label>In vigore al <input type="date" name="data" [ngModel]="data()" (ngModelChange)="cambiaData($event)" /></label>
      </div>
    </header>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    <p class="nota">
      @if (cliente()) {
        Listino dell'accordo con {{ nomeCliente(cliente()) }}: per i ruoli senza una sua tariffa vale lo standard.
      } @else {
        Tariffe giornaliere di vendita valide per tutti i clienti senza un listino proprio.
      }
      Le offerte usano le tariffe valide alla data della revisione.
    </p>

    @if (applicabile(); as a) {
      @if (a.senzaVendita || a.senzaCosto) {
        <p class="avvisi">
          @if (a.senzaVendita) {
            <span class="pallino" data-tono="attenzione">{{ a.senzaVendita }} {{ a.senzaVendita === 1 ? 'ruolo' : 'ruoli' }} senza tariffa di vendita</span>
          }
          @if (a.senzaCosto) {
            <span class="pallino" data-tono="attenzione">{{ a.senzaCosto }} {{ a.senzaCosto === 1 ? 'ruolo' : 'ruoli' }} senza tariffa di costo</span>
          }
          <span class="tenue">Un'offerta con questi ruoli non si può mandare in approvazione finché la tariffa manca.</span>
        </p>
      }
      <table class="elenco">
        <thead>
          <tr>
            <th>Ruolo</th>
            <th class="importo">Vendita</th>
            <th>Provenienza</th>
            <th class="importo">Costo ({{ a.oreGiorno }} h)</th>
            <th class="importo">Margine</th>
          </tr>
        </thead>
        <tbody>
          @for (r of a.ruoli; track r.ruoloId) {
            <tr class="cliccabile" [class.scelto]="ruoloScelto() === r.ruoloId" (click)="scegliRuolo(r.ruoloId)">
              <td><strong>{{ r.ruoloCodice }}</strong> {{ r.ruoloDescrizione }}</td>
              <td class="importo" [class.mancante]="r.vendita.centesimiGiorno === null">{{ euroGiorno(r.vendita.centesimiGiorno) }}</td>
              <td>
                @switch (r.vendita.fonte) {
                  @case ('cliente') { del cliente }
                  @case ('standard') { standard }
                  @default { <span class="mancante">senza tariffa</span> }
                }
              </td>
              <td class="importo" [class.mancante]="!r.costoPresente">{{ r.costoPresente ? euroGiorno(r.costoCentesimiGiorno) : 'manca' }}</td>
              <td class="importo">{{ margine(r) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="tenue">Nessun ruolo attivo: i ruoli si creano in Anagrafiche.</td></tr>
          }
        </tbody>
      </table>
      <p class="nota">Costo: tariffa standard del ruolo per la tipologia ordinaria × {{ a.oreGiorno }} ore. Margine della giornata venduta a listino, prima di sconti e contingenza.</p>
    }

    @if (ruoloScelto(); as id) {
      <h2>{{ nomeRuolo(id) }} — {{ cliente() ? 'listino di ' + nomeCliente(cliente()) : 'listino standard' }}</h2>
      <app-elenco-listino
        [voci]="vociDelRuolo()"
        [data]="data()"
        [modificabile]="modificabile()"
        (crea)="crea(id, $event)"
        (modifica)="modifica($event)"
        (elimina)="elimina($event)"
      />
    } @else {
      <p class="tenue">Clicca un ruolo per vederne {{ modificabile() ? 'e modificarne ' : '' }}i periodi.</p>
    }
  `,
  styles: `
    .briciole { margin: 0; font-size: 0.85rem; }
    .testata label { display: inline-flex; gap: 0.4rem; align-items: center; }
    .testata select { min-width: 14rem; }
    .avvisi { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .importo { text-align: right; font-variant-numeric: tabular-nums; }
    .mancante { color: #b4561f; }
    .cliccabile { cursor: pointer; }
    .cliccabile:hover td { background: #f4f7fc; }
    .scelto td { background: #e7f1fb; }
    h2 { font-size: 1.05rem; margin: 1.5rem 0 0.5rem; }
  `,
})
export class Listino {
  private readonly api = inject(OfferteApiService);
  private readonly comuni = inject(ComuniApiService);
  private readonly sessione = inject(SessioneService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elenco = viewChild(ElencoListino);

  protected readonly euroGiorno = euroGiorno;
  protected readonly modificabile = computed(() => this.sessione.puo('gestireListino'));
  protected readonly data = signal(new Date().toISOString().slice(0, 10));
  /** Id del cliente scelto; '' = listino standard. */
  protected readonly cliente = signal('');
  protected readonly ruoloScelto = signal<string | null>(null);
  protected readonly errore = signal('');
  protected readonly clienti = signal<VoceAnagrafica[]>([]);
  protected readonly ruoli = signal<VoceAnagrafica[]>([]);
  protected readonly voci = signal<VoceListino[]>([]);
  protected readonly applicabile = signal<ListinoApplicabile | null>(null);

  protected readonly vociDelRuolo = computed(() => this.voci().filter((v) => v.ruoloId === this.ruoloScelto()));

  constructor() {
    this.route.queryParamMap.subscribe((q) => {
      this.cliente.set(q.get('cliente') ?? '');
      this.ruoloScelto.set(q.get('ruolo'));
    });
    this.carica(this.comuni.voci('clienti', true), (c) => this.clienti.set(c));
    this.carica(this.comuni.voci('ruoli'), (r) => this.ruoli.set(r));
    effect(() => this.caricaVoci(this.cliente()));
    effect(() => this.caricaApplicabile(this.cliente(), this.data()));
  }

  protected nomeCliente(id: string) {
    return this.clienti().find((c) => c._id === id)?.ragioneSociale ?? '';
  }

  protected nomeRuolo(id: string) {
    const r = this.ruoli().find((x) => x._id === id);
    return r ? `${r.codice} — ${r.descrizione}` : '';
  }

  protected margine(r: RuoloApplicabile) {
    const m = margineGiorno(r.vendita.centesimiGiorno, r.costoCentesimiGiorno);
    return m === null ? '—' : `${m.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  protected scegliCliente(id: string) {
    this.errore.set('');
    this.router.navigate([], { queryParams: { cliente: id || null }, queryParamsHandling: 'merge' });
  }

  protected scegliRuolo(id: string) {
    this.errore.set('');
    this.router.navigate([], { queryParams: { ruolo: this.ruoloScelto() === id ? null : id }, queryParamsHandling: 'merge' });
  }

  protected cambiaData(d: string) {
    if (d) this.data.set(d);
  }

  protected crea(ruoloId: string, dati: DatiVoceListino) {
    this.esegui(this.api.creaVoceListino(ruoloId, this.cliente() || null, dati));
  }
  protected modifica(m: ModificaVoceListino) {
    this.esegui(this.api.modificaVoceListino(m.id, m.dati));
  }
  protected elimina(id: string) {
    this.esegui(this.api.eliminaVoceListino(id));
  }

  private caricaVoci(cliente: string) {
    this.carica(this.api.listino({ cliente: cliente || 'standard' }), (v) => this.voci.set(v));
  }

  private caricaApplicabile(cliente: string, data: string) {
    this.carica(this.api.listinoApplicabile(cliente || null, data), (a) => this.applicabile.set(a));
  }

  private carica<T>(richiesta: Observable<T>, fatto: (v: T) => void) {
    richiesta.subscribe({ next: fatto, error: (e) => this.errore.set(messaggioErrore(e)) });
  }

  /** Esegue una scrittura; se riesce svuota il form e ricarica periodi e tabella. */
  private esegui<T>(richiesta: Observable<T>) {
    this.errore.set('');
    richiesta.subscribe({
      next: () => {
        this.elenco()?.svuota();
        this.caricaVoci(this.cliente());
        this.caricaApplicabile(this.cliente(), this.data());
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }
}
