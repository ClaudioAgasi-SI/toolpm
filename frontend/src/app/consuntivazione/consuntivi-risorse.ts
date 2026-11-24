import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ComuniApiService } from '../comuni/comuni-api.service';
import type { RisorsaAnagrafica } from '../comuni/modelli';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import { CronologiaRiga } from './cronologia-riga';
import { type Giornata, euroOra } from './modelli';
import { etichettaGiorno, etichettaSettimana, fineSettimana, oggi, piuGiorni, settimana, totaleOre } from './ore';

/** Riga del riepilogo: voce + tipologia, ore e costo per giorno. */
interface Riepilogo {
  chiave: string;
  voce: string;
  dettaglio: string;
  tipologia: string;
  minuti: Record<string, number>;
  totaleMinuti: number;
  costo: number;
  daValorizzare: number;
  tariffe: Set<string>;
}

const euro = (c: number) => `${(c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const STATI: Record<string, string> = { bozza: 'bozza', inviata: 'inviata', approvataTL: 'via libera TL', approvata: 'approvata', respinta: 'respinta', chiusa: 'chiusa' };

/**
 * Consuntivi delle risorse (fase 2, blocco C7), pagina in sola lettura del controller: per una risorsa e una
 * settimana, le ore per voce e tipologia, la tariffa usata e il costo di ogni riga, con i totali.
 */
@Component({
  selector: 'app-consuntivi-risorse',
  imports: [FormsModule, RouterLink, CronologiaRiga],
  template: `
    <header class="testata">
      <h1>Consuntivi delle risorse</h1>
      <div class="azioni">
        <select name="risorsa" [ngModel]="risorsaId()" (ngModelChange)="vai({ risorsa: $event })" aria-label="Risorsa">
          <option value="">— scegli la risorsa —</option>
          @for (r of risorse(); track r._id) {
            <option [value]="r._id">{{ r.cognome }} {{ r.nome }}</option>
          }
        </select>
        <button type="button" (click)="vai({ data: piuGiorni(data(), -7) })" aria-label="Settimana precedente">‹</button>
        <strong class="periodo">{{ titolo() }}</strong>
        <button type="button" (click)="vai({ data: piuGiorni(data(), 7) })" aria-label="Settimana successiva">›</button>
        <button type="button" (click)="vai({ data: oggi })">Oggi</button>
      </div>
    </header>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    @if (!risorsaId()) {
      <p class="tenue">Scegli una risorsa per vedere le ore consuntivate e il loro costo.</p>
    } @else {
      <table class="elenco">
        <thead>
          <tr>
            <th>Progetto / attività</th>
            <th>Tipologia</th>
            @for (g of giorni(); track g) {
              <th class="numero" [class.festivo]="fineSettimana(g)">{{ etichettaGiorno(g) }}</th>
            }
            <th class="numero">Ore</th>
            <th class="numero">Tariffa</th>
            <th class="numero">Costo</th>
          </tr>
        </thead>
        <tbody>
          @for (r of riepilogo(); track r.chiave) {
            <tr>
              <td><strong>{{ r.voce }}</strong><div class="tenue piccolo">{{ r.dettaglio }}</div></td>
              <td>{{ r.tipologia }}</td>
              @for (g of giorni(); track g) {
                <td class="numero" [class.festivo]="fineSettimana(g)">{{ r.minuti[g] ? totaleOre(r.minuti[g]) : '' }}</td>
              }
              <td class="numero">{{ totaleOre(r.totaleMinuti) }}</td>
              <td class="numero tenue">{{ [...r.tariffe].join(', ') }}</td>
              <td class="numero">
                {{ euro(r.costo) }}
                @if (r.daValorizzare) {
                  <div class="da-valorizzare">{{ r.daValorizzare === 1 ? '1 riga' : r.daValorizzare + ' righe' }} da valorizzare</div>
                }
              </td>
            </tr>
          } @empty {
            <tr><td [attr.colspan]="giorni().length + 5" class="tenue">{{ caricamento() ? 'Caricamento…' : 'Nessuna ora consuntivata nella settimana.' }}</td></tr>
          }
        </tbody>
        @if (riepilogo().length) {
          <tfoot>
            <tr>
              <th colspan="2">Totale</th>
              @for (g of giorni(); track g) {
                <th class="numero">{{ totaleOre(totaliGiorno()[g] ?? 0) }}</th>
              }
              <th class="numero">{{ totaleOre(totale().minuti) }}</th>
              <th></th>
              <th class="numero">{{ euro(totale().costo) }}</th>
            </tr>
          </tfoot>
        }
      </table>
      @if (righe().length) {
        <h2>Dettaglio delle righe</h2>
        <table class="elenco">
          <thead>
            <tr><th>Data</th><th>Voce</th><th>Tipologia</th><th class="numero">Ore</th><th>Stato</th><th>Tariffa usata</th><th class="numero">Costo</th><th>Nota</th><th></th></tr>
          </thead>
          <tbody>
            @for (x of righe(); track x.id) {
              <tr>
                <td>{{ etichettaGiorno(x.data) }}</td>
                <td>{{ x.voce }}</td>
                <td>{{ x.tipologia }}</td>
                <td class="numero">{{ totaleOre(x.minuti) }}</td>
                <td>{{ x.stato }}</td>
                <td>
                  @if (x.fonte) {
                    {{ euroOra(x.centesimiOra) }} <span class="tenue">({{ x.fonte === 'personalizzata' ? 'personalizzata' : 'standard del ruolo' }})</span>
                  } @else {
                    <span class="da-valorizzare">da valorizzare</span>&nbsp;·&nbsp;<a routerLink="../da-valorizzare">vedi il motivo</a>
                  }
                </td>
                <td class="numero">{{ x.costo === null ? '—' : euro(x.costo) }}</td>
                <td class="tenue">{{ x.nota }}</td>
                <td>
                  <button type="button" class="link" [attr.aria-expanded]="aperta() === x.id" (click)="aperta.set(aperta() === x.id ? null : x.id)">Cronologia</button>
                </td>
              </tr>
              @if (aperta() === x.id) {
                <tr class="riga-cronologia">
                  <td colspan="9"><app-cronologia-riga [rigaId]="x.id" /></td>
                </tr>
              }
            }
          </tbody>
        </table>
      }
    }
  `,
  styles: `
    button.link { background: none; border: none; padding: 0; color: #1f6feb; cursor: pointer; font-size: 0.85rem; }
    .riga-cronologia td { background: #fafbfc; }
    .testata .azioni { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .periodo { min-width: 11rem; text-align: center; }
    .numero { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .festivo { background: #f6f7fa; }
    .piccolo { font-size: 0.8rem; }
    .da-valorizzare { color: #b4561f; font-size: 0.85rem; }
    tfoot th { font-variant-numeric: tabular-nums; }
    h2 { font-size: 1.05rem; margin: 1.5rem 0 0.25rem; }
  `,
})
export class ConsuntiviRisorse {
  private readonly api = inject(ConsuntivazioneApiService);
  private readonly comuni = inject(ComuniApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly oggi = oggi();
  protected readonly piuGiorni = piuGiorni;
  protected readonly totaleOre = totaleOre;
  protected readonly etichettaGiorno = etichettaGiorno;
  protected readonly fineSettimana = fineSettimana;
  protected readonly euro = euro;
  protected readonly euroOra = euroOra;

  protected readonly risorse = signal<RisorsaAnagrafica[]>([]);
  /** Riga di cui si vede la cronologia (fase 3, D5). */
  protected readonly aperta = signal<string | null>(null);
  protected readonly risorsaId = signal('');
  protected readonly data = signal(this.oggi);
  protected readonly giornate = signal<Giornata[]>([]);
  /** Descrizioni delle tipologie (anche disattivate), per nome. */
  private readonly nomiTipologie = signal(new Map<string, string>());
  protected readonly caricamento = signal(false);
  protected readonly errore = signal('');

  protected readonly giorni = computed(() => settimana(this.data()));
  protected readonly titolo = computed(() => etichettaSettimana(this.data()));

  protected readonly righe = computed(() =>
    this.giornate().flatMap((g) =>
      g.righe.map((r) => ({
        id: r._id,
        data: g.data,
        voce: r.attivita ? `${r.progetto?.codice ?? '?'} › ${r.attivita.codice}` : (r.progetto?.codice ?? '?'),
        dettaglio: r.attivita ? r.attivita.descrizione : (r.progetto?.titolo ?? ''),
        tipologia: this.nomiTipologie().get(r.tipologiaId) ?? r.tipologiaCodice,
        minuti: r.minuti,
        stato: STATI[r.stato] ?? r.stato,
        fonte: r.fonteTariffa ?? null,
        centesimiOra: r.tariffaCentesimiOra ?? null,
        costo: r.costoCentesimi ?? null,
        nota: r.nota ?? '',
      })),
    ),
  );

  protected readonly riepilogo = computed(() => {
    const mappa = new Map<string, Riepilogo>();
    for (const x of this.righe()) {
      const chiave = `${x.voce}|${x.tipologia}`;
      const r = mappa.get(chiave) ?? {
        chiave,
        voce: x.voce,
        dettaglio: x.dettaglio,
        tipologia: x.tipologia,
        minuti: {},
        totaleMinuti: 0,
        costo: 0,
        daValorizzare: 0,
        tariffe: new Set<string>(),
      };
      r.minuti[x.data] = (r.minuti[x.data] ?? 0) + x.minuti;
      r.totaleMinuti += x.minuti;
      r.costo += x.costo ?? 0;
      if (x.costo === null) r.daValorizzare++;
      if (x.centesimiOra !== null) r.tariffe.add(euroOra(x.centesimiOra));
      mappa.set(chiave, r);
    }
    return [...mappa.values()].sort((a, b) => a.voce.localeCompare(b.voce) || a.tipologia.localeCompare(b.tipologia));
  });

  protected readonly totaliGiorno = computed(() => {
    const t: Record<string, number> = {};
    for (const x of this.righe()) t[x.data] = (t[x.data] ?? 0) + x.minuti;
    return t;
  });
  protected readonly totale = computed(() => ({
    minuti: this.righe().reduce((s, x) => s + x.minuti, 0),
    costo: this.righe().reduce((s, x) => s + (x.costo ?? 0), 0),
  }));

  constructor() {
    this.comuni.risorse().subscribe({
      next: (r) => this.risorse.set([...r].sort((x, y) => `${x.cognome} ${x.nome}`.localeCompare(`${y.cognome} ${y.nome}`))),
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
    this.api.tipologie().subscribe((t) => this.nomiTipologie.set(new Map(t.map((x) => [x._id, x.descrizione]))));
    this.route.queryParamMap.subscribe((q) => {
      this.risorsaId.set(q.get('risorsa') ?? '');
      const d = q.get('data');
      this.data.set(d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : this.oggi);
      this.carica();
    });
  }

  protected vai(cambio: { risorsa?: string; data?: string }) {
    this.router.navigate([], { queryParams: { risorsa: cambio.risorsa ?? (this.risorsaId() || null), data: cambio.data ?? this.data() } });
  }

  private carica() {
    this.giornate.set([]);
    this.errore.set('');
    if (!this.risorsaId()) return;
    const g = this.giorni();
    this.caricamento.set(true);
    this.api.consuntiviDi(this.risorsaId(), g[0], g[6]).subscribe({
      next: (x) => {
        this.giornate.set(x);
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }
}
