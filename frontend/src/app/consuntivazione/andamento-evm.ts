import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import { ETICHETTA_COSTI, ETICHETTA_TEMPI, indice } from './evm-testi';
import { type FasciaGrafico, GraficoLinee, type SerieGrafico } from './grafico-linee';
import type { AndamentoEvm, PuntoEvm, VistaReport } from './modelli';
import { euro, gg } from './report-testi';

/** Colori delle serie (palette categoriale validata: blu, arancio, acqua; nomi anche a fine linea e in legenda). */
const COLORI = ['#257de0', '#f47230', '#00b894'];

/**
 * Andamento nel tempo degli indicatori EVM (fase 4, blocco E3; RF-31, decisione 13): PV, EV e AC
 * (in euro a chi li vede, altrimenti in giorni) e SPI/CPI con le fasce delle soglie, dalla procedura notturna.
 */
@Component({
  selector: 'app-andamento-evm',
  imports: [GraficoLinee],
  template: `
    <section class="blocco" aria-label="Andamento nel tempo">
      <h2>Andamento nel tempo</h2>
      @if (errore()) {
        <p class="errore">{{ errore() }}</p>
      }
      @if (dati(); as d) {
        <p class="tenue piccolo">
          {{ d.aggiornatoAl ? 'Andamento aggiornato al ' + giorno(d.aggiornatoAl) + '.' : 'Andamento non ancora calcolato.' }}
          Un punto per giorno, calcolato ogni notte{{ d.vista === 'provvisoria' ? ', con le ore non ancora approvate (dati provvisori)' : '' }}.
        </p>
        @if (d.avviso) {
          <p class="avviso">{{ d.avviso }}</p>
        }
        @if (!d.serie.length) {
          <p class="tenue">Nessun dato nel periodo: l'andamento si registra ogni notte per i progetti In corso con una stima.</p>
        } @else {
          <app-grafico-linee [titolo]="'Valore pianificato, guadagnato e costo effettivo (' + (inEuro() ? 'euro' : 'giorni') + ')'" [date]="date()" [serie]="valori()" [formato]="formatoValori()" />
          <app-grafico-linee titolo="Indici di tempi (SPI) e costi (CPI)" [date]="date()" [serie]="indici()" [formato]="formatoIndice" [fasce]="fasce()" [includi]="[0, 1.2]" />
          <details>
            <summary class="piccolo">Vedi i dati in tabella</summary>
            <table class="elenco piccolo">
              <thead>
                <tr><th>Giorno</th><th class="numero">Completato</th><th class="numero">PV</th><th class="numero">EV</th><th class="numero">AC</th><th class="numero">SPI</th><th class="numero">CPI</th><th>Tempi</th><th>Costi</th></tr>
              </thead>
              <tbody>
                @for (p of righeTabella(); track p.data) {
                  <tr>
                    <td>{{ giorno(p.data) }}</td>
                    <td class="numero">{{ p.percentuale }}%</td>
                    <td class="numero">{{ formatoValori()(p.v?.pv ?? null) }}</td>
                    <td class="numero">{{ formatoValori()(p.v?.ev ?? null) }}</td>
                    <td class="numero">{{ formatoValori()(p.v?.ac ?? null) }}</td>
                    <td class="numero">{{ indice(p.v?.spi) }}</td>
                    <td class="numero">{{ indice(p.v?.cpi) }}</td>
                    <td>{{ ETICHETTA_TEMPI[p.statoTempi] }}</td>
                    <td>{{ ETICHETTA_COSTI[p.statoCosti] }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </details>
        }
      } @else if (caricamento()) {
        <p class="tenue">Caricamento…</p>
      }
    </section>
  `,
  styles: `
    .piccolo { font-size: 0.8rem; }
    .numero { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .avviso { color: #9a5b00; background: #fff8e6; border: 1px solid #f3dca8; border-radius: 6px; padding: 4px 10px; margin: 0.35rem 0; }
    details { margin-top: 0.25rem; max-height: 24rem; overflow: auto; }
  `,
})
export class AndamentoEvmComponent {
  private readonly api = inject(ConsuntivazioneApiService);
  readonly id = input.required<string>();
  readonly vista = input<VistaReport>('approvata');

  protected readonly ETICHETTA_TEMPI = ETICHETTA_TEMPI;
  protected readonly ETICHETTA_COSTI = ETICHETTA_COSTI;
  protected readonly indice = indice;
  protected readonly formatoIndice = (n: number) => indice(n);

  protected readonly dati = signal<AndamentoEvm | null>(null);
  protected readonly caricamento = signal(true);
  protected readonly errore = signal('');

  /** In euro se chi guarda li vede e la serie li ha; altrimenti in giorni (il TL). */
  protected readonly inEuro = computed(() => !!this.dati()?.serie.some((p) => p.euro));
  private punto(p: AndamentoEvm['serie'][number]): PuntoEvm | null {
    return (this.inEuro() ? p.euro : p.giorni) ?? null;
  }

  protected readonly date = computed(() => (this.dati()?.serie ?? []).map((p) => p.data.slice(0, 10)));

  protected readonly formatoValori = computed(() => (this.inEuro() ? (n: number | null) => (n === null ? '—' : euro(n)) : (n: number | null) => (n === null ? '—' : gg(n))));

  protected readonly valori = computed<SerieGrafico[]>(() => {
    const s = this.dati()?.serie ?? [];
    return [
      { nome: 'PV', colore: COLORI[0], valori: s.map((p) => this.punto(p)?.pv ?? null) },
      { nome: 'EV', colore: COLORI[1], valori: s.map((p) => this.punto(p)?.ev ?? null) },
      { nome: 'AC', colore: COLORI[2], valori: s.map((p) => this.punto(p)?.ac ?? null) },
    ];
  });

  protected readonly indici = computed<SerieGrafico[]>(() => {
    const s = this.dati()?.serie ?? [];
    // SPI uguale in euro e giorni; CPI come lo stato dei costi: in euro e, se lì non calcolabile, in giorni.
    return [
      { nome: 'SPI', colore: COLORI[0], valori: s.map((p) => this.punto(p)?.spi ?? null) },
      { nome: 'CPI', colore: COLORI[1], valori: s.map((p) => this.punto(p)?.cpi ?? p.giorni?.cpi ?? null) },
    ];
  });

  /** Fasce delle soglie, con tinte leggere: le stesse dello stato (verde, blu, arancio, rosso). */
  protected readonly fasce = computed<FasciaGrafico[]>(() => {
    const s = this.dati()?.soglie;
    if (!s) return [];
    return [
      { min: s.anticipo, max: 99, colore: '#eef8f0', etichetta: 'in anticipo / sotto budget' },
      { min: s.ritardo, max: s.anticipo, colore: '#eef4fb', etichetta: 'in linea' },
      { min: s.fortementeInRitardo, max: s.ritardo, colore: '#fff6ea', etichetta: 'in ritardo / sopra budget' },
      { min: -99, max: s.fortementeInRitardo, colore: '#fdf0f0', etichetta: 'forte ritardo / fortemente sopra' },
    ];
  });

  protected readonly righeTabella = computed(() => [...(this.dati()?.serie ?? [])].reverse().map((p) => ({ ...p, v: this.punto(p) })));

  constructor() {
    effect(() => {
      this.vista();
      this.carica();
    });
  }

  private carica() {
    this.caricamento.set(true);
    this.errore.set('');
    this.api.andamentoEvm(this.id(), { vista: this.vista() }).subscribe({
      next: (d) => {
        this.dati.set(d);
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }

  protected giorno(d: string) {
    return new Date(d).toLocaleDateString('it-IT', { timeZone: 'UTC' });
  }
}
