import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import type { LivelloCosti, NodoCosti, ReportCosti as Report, TotaliReport, VistaReport } from './modelli';
import { oggi, totaleOre } from './ore';
import { avvisoValorizzare, calcolato, euro, gg } from './report-testi';

export const NOMI_LIVELLO: Record<LivelloCosti, string> = {
  cdc: 'Centro di costo',
  progetto: 'Progetto',
  attivita: 'Attività',
  risorsa: 'Risorsa',
  ruolo: 'Ruolo',
  tipologia: 'Tipologia di costo',
  mese: 'Mese',
};

/** Raggruppamenti pronti; "personalizzato" apre le quattro scelte. */
export const RAGGRUPPAMENTI: { nome: string; livelli: LivelloCosti[] }[] = [
  { nome: 'Centro di costo › Progetto › Attività', livelli: ['cdc', 'progetto', 'attivita'] },
  { nome: 'Centro di costo › Progetto', livelli: ['cdc', 'progetto'] },
  { nome: 'Progetto › Attività › Risorsa', livelli: ['progetto', 'attivita', 'risorsa'] },
  { nome: 'Progetto › Risorsa', livelli: ['progetto', 'risorsa'] },
  { nome: 'Risorsa › Progetto', livelli: ['risorsa', 'progetto'] },
  { nome: 'Ruolo › Risorsa', livelli: ['ruolo', 'risorsa'] },
  { nome: 'Progetto › Mese', livelli: ['progetto', 'mese'] },
  { nome: 'Mese › Tipologia di costo', livelli: ['mese', 'tipologia'] },
];

interface RigaVisibile {
  nodo: NodoCosti;
  percorso: string;
  profondita: number;
  apribile: boolean;
  aperta: boolean;
}

/** Righe della tabella: i nodi aperti mostrano i figli. */
export function righeVisibili(nodi: NodoCosti[], aperti: ReadonlySet<string>, profondita = 0, padre = ''): RigaVisibile[] {
  return nodi.flatMap((n) => {
    const percorso = `${padre}/${n.livello}:${n.chiave}`;
    const aperta = aperti.has(percorso);
    const riga = { nodo: n, percorso, profondita, apribile: n.figli.length > 0, aperta };
    return [riga, ...(aperta ? righeVisibili(n.figli, aperti, profondita + 1, percorso) : [])];
  });
}

/** Percorsi di tutti i nodi con figli (per "Espandi tutto"). */
export function tuttiIPercorsi(nodi: NodoCosti[], padre = ''): string[] {
  return nodi.flatMap((n) => {
    const p = `${padre}/${n.livello}:${n.chiave}`;
    return n.figli.length ? [p, ...tuttiIPercorsi(n.figli, p)] : [];
  });
}

const primoDelMese = (d: string) => `${d.slice(0, 8)}01`;
const ultimoDelMese = (d: string) => {
  const [a, m] = d.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

/**
 * Report dei costi (fase 4, blocco E4; RF-21, RF-22): ore, giorni e costi del periodo annidati per i livelli
 * scelti (es. centro di costo › progetto › attività), con i totali di ogni livello. Due viste (decisione 11).
 */
@Component({
  selector: 'app-report-costi',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="testata">
      <h1>Report dei costi</h1>
    </header>

    <form class="filtri" (ngSubmit)="carica()">
      <div class="gruppo">
        <label>dal <input type="date" name="da" [(ngModel)]="da" /></label>
        <label>al <input type="date" name="a" [(ngModel)]="a" /></label>
        <span class="rapidi">
          <button type="button" class="link" (click)="periodo('mese')">mese corrente</button>
          <button type="button" class="link" (click)="periodo('scorso')">mese scorso</button>
          <button type="button" class="link" (click)="periodo('anno')">anno in corso</button>
        </span>
      </div>
      <div class="gruppo">
        <label>
          Raggruppa per
          <select name="raggruppamento" [(ngModel)]="raggruppamento" (ngModelChange)="sceltoRaggruppamento()">
            @for (r of raggruppamenti; track r.nome; let i = $index) {
              <option [ngValue]="i">{{ r.nome }}</option>
            }
            <option [ngValue]="-1">Personalizzato…</option>
          </select>
        </label>
        @if (raggruppamento === -1) {
          @for (i of [0, 1, 2, 3]; track i) {
            <label>
              {{ i + 1 }}° livello
              <select [name]="'livello' + i" [attr.name]="'livello' + i" [(ngModel)]="livelli[i]">
                <option value="">{{ i === 0 ? '—' : 'nessuno' }}</option>
                @for (l of tuttiLivelli; track l) {
                  <option [value]="l" [disabled]="usato(l, i)">{{ nomiLivello[l] }}</option>
                }
              </select>
            </label>
          }
        }
      </div>
      @if (dati(); as d) {
        <div class="gruppo">
          <label>
            Centro di costo
            <select name="centroCosto" [(ngModel)]="centroCosto">
              <option value="">tutti</option>
              @for (o of d.opzioni.centriCosto; track o._id) {
                <option [value]="o._id">{{ o.etichetta }}</option>
              }
            </select>
          </label>
          <label>
            Cliente
            <select name="cliente" [(ngModel)]="cliente">
              <option value="">tutti</option>
              @for (o of d.opzioni.clienti; track o._id) {
                <option [value]="o._id">{{ o.etichetta }}</option>
              }
            </select>
          </label>
          <label>
            Progetto
            <select name="progetto" [(ngModel)]="progetto">
              <option value="">tutti</option>
              @for (o of d.opzioni.progetti; track o._id) {
                <option [value]="o._id">{{ o.etichetta }}</option>
              }
            </select>
          </label>
        </div>
      }
      <div class="gruppo">
        <label class="spunta"><input type="checkbox" name="provvisoria" [(ngModel)]="provvisoria" /> Includi le ore non ancora approvate</label>
        <button type="submit">Aggiorna</button>
      </div>
    </form>

    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    @if (dati(); as d) {
      @if (d.vista === 'provvisoria') {
        <p class="provvisori">Dati provvisori: comprendono le ore in bozza, inviate e con il via libera del TL, non ancora approvate dal PM.</p>
      } @else if (d.inAttesa.righe) {
        <p class="avviso">
          {{ d.inAttesa.righe === 1 ? '1 riga' : d.inAttesa.righe + ' righe' }} ({{ totaleOre(d.inAttesa.minuti) }} h) del periodo non ancora approvate: non sono nei totali.
        </p>
      }
      @if (d.vedeEuro && avvisoValorizzare(d.totali); as av) {
        <p class="avviso">Costo incompleto: {{ av }}.</p>
      }
      @if (d.euroNascostiInParte) {
        <p class="tenue">Gli importi in euro non compaiono perché il report comprende progetti di cui non vedi i costi (dove sei TL): scegli un progetto di cui sei PM per vederli.</p>
      }

      @if (!d.righe.length) {
        <p class="tenue">Nessuna ora nel periodo{{ d.opzioni.progetti.length ? '' : ': non ci sono progetti di cui vedi i costi' }}.</p>
      } @else {
        <div class="comandi">
          <span class="tenue piccolo">{{ percorsoLivelli(d) }}</span>
          <span>
            <button type="button" class="link" (click)="espandi(true)">Espandi tutto</button> ·
            <button type="button" class="link" (click)="espandi(false)">Comprimi tutto</button>
          </span>
        </div>
        <table class="elenco albero">
          <thead>
            <tr>
              <th>Voce</th>
              <th class="numero">Ore</th>
              <th class="numero">Giorni</th>
              @if (d.vedeEuro) {
                <th class="numero">Costo</th>
              }
              <th class="quota">{{ suCosto(d) ? 'Del costo totale' : 'Delle ore totali' }}</th>
              @if (d.vedeEuro) {
                <th class="numero" title="Righe senza costo: da valorizzare">Da valorizzare</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (r of righe(); track r.percorso) {
              <tr [class]="'liv' + r.profondita">
                <td [style.padding-left.rem]="0.5 + r.profondita * 1.4">
                  @if (r.apribile) {
                    <button type="button" class="apri" (click)="alterna(r.percorso)" [attr.aria-expanded]="r.aperta" [attr.aria-label]="(r.aperta ? 'Comprimi ' : 'Espandi ') + r.nodo.etichetta">{{ r.aperta ? '▾' : '▸' }}</button>
                  } @else {
                    <span class="apri vuoto"></span>
                  }
                  <span class="tenue piccolo livello">{{ nomiLivello[r.nodo.livello] }}</span>
                  {{ r.nodo.etichetta }}
                  @if (r.nodo.progettoId) {
                    <a class="piccolo" [routerLink]="['/consuntivazione/progetti', r.nodo.progettoId]" title="Scheda del progetto">scheda →</a>
                  }
                </td>
                <td class="numero">{{ totaleOre(r.nodo.minuti) }}</td>
                <td class="numero">{{ gg(r.nodo.giorni) }}</td>
                @if (d.vedeEuro) {
                  <td class="numero">{{ euro(r.nodo.costoCentesimi) }}</td>
                }
                <td class="quota">
                  <span class="barra"><span [style.width.%]="quota(r.nodo, d)"></span></span>
                  <span class="piccolo">{{ quota(r.nodo, d) }}%</span>
                </td>
                @if (d.vedeEuro) {
                  <td class="numero tenue">{{ r.nodo.daValorizzare || '' }}</td>
                }
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <th>Totale</th>
              <th class="numero">{{ totaleOre(d.totali.minuti) }}</th>
              <th class="numero">{{ gg(d.totali.giorni) }}</th>
              @if (d.vedeEuro) {
                <th class="numero">{{ euro(d.totali.costoCentesimi) }}</th>
              }
              <th></th>
              @if (d.vedeEuro) {
                <th class="numero">{{ d.totali.daValorizzare || '' }}</th>
              }
            </tr>
          </tfoot>
        </table>
      }
      <p class="tenue piccolo">
        Periodo dal {{ giorno(d.periodo.da) }} al {{ giorno(d.periodo.a) }}. Un giorno vale {{ d.oreGiorno }} ore. Ogni riga di consuntivo conta una volta per livello:
        le ore di un'attività sono nel suo progetto e nel centro di costo del progetto. {{ d.vista === 'provvisoria' ? 'Dati provvisori' : 'Dati approvati dal PM (e dei mesi chiusi)' }},
        calcolati il {{ calcolato(d.calcolatoIl) }}.
      </p>
    } @else if (caricamento()) {
      <p class="tenue">Caricamento…</p>
    }
  `,
  styles: `
    .filtri { display: flex; flex-wrap: wrap; gap: 0.6rem 2rem; align-items: flex-end; margin: 0.5rem 0 1rem; }
    .gruppo { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap;
      label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; color: #5a6478; }
      label.spunta { flex-direction: row; align-items: center; gap: 0.4rem; } }
    .rapidi { display: flex; gap: 0.6rem; padding-bottom: 0.35rem; font-size: 0.85rem; }
    button.link { background: none; border: none; padding: 0; color: #1c63b7; cursor: pointer; text-decoration: underline; font: inherit; }
    .comandi { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; font-size: 0.85rem; }
    .numero { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .piccolo { font-size: 0.8rem; }
    .provvisori, .avviso { background: #fff8e6; border: 1px solid #f3dca8; color: #8a5a00; border-radius: 6px; padding: 4px 10px; margin: 0.35rem 0; }
    .albero tr.liv0 td { font-weight: 600; }
    .albero tfoot th { border-top: 2px solid #c9d1de; }
    .apri { display: inline-block; width: 1.3rem; background: none; border: none; cursor: pointer; padding: 0; color: #3d4556; font-size: 0.9rem; }
    .livello { display: inline-block; min-width: 0; margin-right: 0.35rem; font-weight: 400; }
    .quota { white-space: nowrap; width: 11rem; }
    .barra { display: inline-block; vertical-align: middle; width: 6rem; height: 0.55rem; background: #e8ecf2; border-radius: 4px; overflow: hidden; margin-right: 0.35rem;
      span { display: block; height: 100%; background: #257de0; border-radius: 4px; } }
  `,
})
export class ReportCosti {
  private readonly api = inject(ConsuntivazioneApiService);

  protected readonly raggruppamenti = RAGGRUPPAMENTI;
  protected readonly nomiLivello = NOMI_LIVELLO;
  protected readonly tuttiLivelli = Object.keys(NOMI_LIVELLO) as LivelloCosti[];
  protected readonly euro = euro;
  protected readonly gg = gg;
  protected readonly totaleOre = totaleOre;
  protected readonly calcolato = calcolato;
  protected readonly avvisoValorizzare = avvisoValorizzare;

  protected da = primoDelMese(oggi());
  protected a = oggi();
  protected raggruppamento = 0;
  protected livelli: (LivelloCosti | '')[] = [...RAGGRUPPAMENTI[0].livelli, ''];
  protected centroCosto = '';
  protected cliente = '';
  protected progetto = '';
  protected provvisoria = false;

  protected readonly dati = signal<Report | null>(null);
  protected readonly aperti = signal<ReadonlySet<string>>(new Set());
  protected readonly caricamento = signal(true);
  protected readonly errore = signal('');
  protected readonly righe = computed(() => righeVisibili(this.dati()?.righe ?? [], this.aperti()));

  constructor() {
    this.carica();
  }

  protected carica() {
    const livelli = this.livelliScelti();
    if (!livelli.length) {
      this.errore.set('Scegli almeno un livello');
      return;
    }
    this.caricamento.set(true);
    this.errore.set('');
    const vista: VistaReport = this.provvisoria ? 'provvisoria' : 'approvata';
    this.api
      .reportCosti({ vista, da: this.da, a: this.a, raggruppa: livelli.join(','), centroCosto: this.centroCosto, cliente: this.cliente, progetto: this.progetto })
      .subscribe({
        next: (r) => {
          this.dati.set(r);
          // Aperto il primo livello quando ha poche voci.
          this.aperti.set(new Set(r.righe.length <= 5 ? r.righe.filter((n) => n.figli.length).map((n) => `/${n.livello}:${n.chiave}`) : []));
          this.caricamento.set(false);
        },
        error: (e) => {
          this.errore.set(messaggioErrore(e));
          this.caricamento.set(false);
        },
      });
  }

  private livelliScelti(): LivelloCosti[] {
    if (this.raggruppamento >= 0) return RAGGRUPPAMENTI[this.raggruppamento].livelli;
    const scelti: LivelloCosti[] = [];
    for (const l of this.livelli) {
      if (!l) break;
      scelti.push(l);
    }
    return scelti;
  }

  protected sceltoRaggruppamento() {
    if (this.raggruppamento >= 0) {
      const l = RAGGRUPPAMENTI[this.raggruppamento].livelli;
      this.livelli = [0, 1, 2, 3].map((i) => l[i] ?? '');
      this.carica();
    }
  }

  protected usato(l: LivelloCosti, i: number) {
    return this.livelli.some((x, j) => j !== i && x === l);
  }

  protected periodo(quale: 'mese' | 'scorso' | 'anno') {
    const o = oggi();
    if (quale === 'mese') [this.da, this.a] = [primoDelMese(o), o];
    if (quale === 'anno') [this.da, this.a] = [`${o.slice(0, 4)}-01-01`, o];
    if (quale === 'scorso') {
      const fineScorso = new Date(`${primoDelMese(o)}T00:00:00Z`);
      fineScorso.setUTCDate(0);
      const f = fineScorso.toISOString().slice(0, 10);
      [this.da, this.a] = [primoDelMese(f), ultimoDelMese(f)];
    }
    this.carica();
  }

  protected alterna(percorso: string) {
    const s = new Set(this.aperti());
    if (s.has(percorso)) s.delete(percorso);
    else s.add(percorso);
    this.aperti.set(s);
  }

  protected espandi(tutto: boolean) {
    this.aperti.set(new Set(tutto ? tuttiIPercorsi(this.dati()?.righe ?? []) : []));
  }

  /** Quote sul costo quando c'è (e si vede), altrimenti sulle ore. */
  protected suCosto(d: Report) {
    return d.vedeEuro && (d.totali.costoCentesimi ?? 0) > 0;
  }

  protected quota(n: TotaliReport, d: Report) {
    const [x, tot] = this.suCosto(d) ? [n.costoCentesimi ?? 0, d.totali.costoCentesimi ?? 0] : [n.minuti, d.totali.minuti];
    return tot ? Math.round((x / tot) * 100) : 0;
  }

  protected percorsoLivelli(d: Report) {
    return d.livelli.map((l) => NOMI_LIVELLO[l]).join(' › ');
  }

  protected giorno(d: string) {
    return new Date(d).toLocaleDateString('it-IT', { timeZone: 'UTC' });
  }
}
