import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import { ETICHETTA_COSTI, ETICHETTA_TEMPI, indice, spiegazione, toneStato } from './evm-testi';
import type { EvmScheda, IndicatoriEvm, VistaReport } from './modelli';
import { oggi, totaleOre } from './ore';
import { calcolato, euro, gg } from './report-testi';

interface Voce {
  chiave: keyof IndicatoriEvm;
  nome: string;
  tipo: 'valore' | 'indice';
  spiega: string;
}

const VOCI: Voce[] = [
  { chiave: 'bac', nome: 'BAC — budget', tipo: 'valore', spiega: 'Stima definitiva, altrimenti manageriale' },
  { chiave: 'pv', nome: 'PV — valore pianificato', tipo: 'valore', spiega: 'Budget × quota della durata trascorsa' },
  { chiave: 'ev', nome: 'EV — valore guadagnato', tipo: 'valore', spiega: 'Budget × percentuale di completamento' },
  { chiave: 'ac', nome: 'AC — costo effettivo', tipo: 'valore', spiega: 'Consuntivato fino alla data' },
  { chiave: 'sv', nome: 'SV — scostamento tempi', tipo: 'valore', spiega: 'EV − PV' },
  { chiave: 'cv', nome: 'CV — scostamento costi', tipo: 'valore', spiega: 'EV − AC' },
  { chiave: 'spi', nome: 'SPI — indice tempi', tipo: 'indice', spiega: 'EV / PV' },
  { chiave: 'cpi', nome: 'CPI — indice costi', tipo: 'indice', spiega: 'EV / AC' },
  { chiave: 'eac', nome: 'EAC — previsto a finire', tipo: 'valore', spiega: 'BAC / CPI' },
  { chiave: 'etc', nome: 'ETC — ancora da sostenere', tipo: 'valore', spiega: 'EAC − AC' },
  { chiave: 'vac', nome: 'VAC — scostamento a finire', tipo: 'valore', spiega: 'BAC − EAC' },
  { chiave: 'tcpi', nome: 'TCPI — efficienza necessaria', tipo: 'indice', spiega: '(BAC − EV) / (BAC − AC)' },
];

/**
 * Indicatori EVM del progetto e delle attività a una data (fase 4, blocco E2; RF-29, RF-30, RF-32),
 * nella scheda del progetto. Il TL vede giorni, indici e stati, non gli euro.
 */
@Component({
  selector: 'app-evm-progetto',
  imports: [FormsModule],
  template: `
    <section class="blocco evm" aria-label="Indicatori EVM">
      <header class="riga-titolo">
        <h2>Tempi e costi (Earned Value)</h2>
        <label>alla data <input type="date" name="al" [max]="massimo" [(ngModel)]="al" (change)="carica()" /></label>
      </header>
      @if (errore()) {
        <p class="errore">{{ errore() }}</p>
      }
      @if (dati(); as d) {
        @let e = d.evm;
        @let testi = spiegazione(e);
        @if (e.calcolabile) {
          <div class="stati">
            <div class="stato-evm" [attr.data-tono]="toneStato(e.statoTempi)">
              <span class="tenue piccolo">Tempi</span><strong>{{ ETICHETTA_TEMPI[e.statoTempi] }}</strong>
            </div>
            <div class="stato-evm" [attr.data-tono]="toneStato(e.statoCosti)">
              <span class="tenue piccolo">Costi</span><strong>{{ ETICHETTA_COSTI[e.statoCosti] }}</strong>
            </div>
          </div>
          <p class="spiegazione">{{ testi.tempi }}<br />{{ testi.costi }}</p>
          @if (e.euro && e.daValorizzare.righe) {
            <p class="avviso">
              AC in euro incompleto: {{ e.daValorizzare.righe === 1 ? '1 riga' : e.daValorizzare.righe + ' righe' }} ({{ totaleOre(e.daValorizzare.minuti) }} h) senza costo, da valorizzare.
            </p>
          }
          <table class="elenco indicatori">
            <thead>
              <tr>
                <th>Indicatore</th>
                @if (e.euro) {
                  <th class="numero">Euro</th>
                }
                @if (e.giorni) {
                  <th class="numero">Giorni</th>
                }
                <th class="tenue">Come si calcola</th>
              </tr>
            </thead>
            <tbody>
              @for (v of voci; track v.chiave) {
                <tr [class.indice]="v.tipo === 'indice'">
                  <td>{{ v.nome }}</td>
                  @if (e.euro) {
                    <td class="numero" [class.negativo]="negativo(e.euro, v)">{{ valore(e.euro, v, 'euro') }}</td>
                  }
                  @if (e.giorni) {
                    <td class="numero" [class.negativo]="negativo(e.giorni, v)">{{ valore(e.giorni, v, 'giorni') }}</td>
                  }
                  <td class="tenue piccolo">{{ v.spiega }}</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="tenue piccolo">
            Completato al {{ e.percentuale }}% alla data{{ e.trascorso !== null ? ', durata trascorsa ' + percento(e.trascorso) : '' }}.
            Budget: stima {{ fonte(e.fonteBacEuro ?? e.fonteBacGiorni) }}.
            @if (e.costiDa === 'giorni' && e.euro) {
              Stato dei costi dagli indici in giorni (il CPI in euro non è calcolabile).
            }
            Stati: SPI e CPI ≥ {{ indice(d.soglie.anticipo) }} In anticipo / Sotto budget; ≥ {{ indice(d.soglie.ritardo) }} In linea; ≥ {{ indice(d.soglie.fortementeInRitardo) }} In ritardo / Sopra budget; sotto, In forte ritardo / Fortemente sopra budget.
          </p>

          @if (d.attivita.length) {
            <h3>Attività <span class="tenue piccolo">in giorni, con la stima dell'attività</span></h3>
            <table class="elenco">
              <thead>
                <tr>
                  <th>Attività</th>
                  <th class="numero">Stima (gg)</th>
                  <th class="numero">Completato</th>
                  <th class="numero">EV (gg)</th>
                  <th class="numero">AC (gg)</th>
                  <th class="numero">CPI</th>
                  <th class="numero">SPI</th>
                  <th>Tempi</th>
                  <th>Costi</th>
                </tr>
              </thead>
              <tbody>
                @for (a of d.attivita; track a.attivitaId) {
                  <tr>
                    <td><strong>{{ a.codice }}</strong> — {{ a.descrizione }}</td>
                    <td class="numero">{{ gg(a.stimaGiorni) }}</td>
                    <td class="numero">{{ a.percentuale }}%</td>
                    @if (a.giorni; as g) {
                      <td class="numero">{{ gg(g.ev) }}</td>
                      <td class="numero">{{ gg(g.ac) }}</td>
                      <td class="numero">{{ indice(g.cpi) }}</td>
                      <td class="numero">{{ indice(g.spi) }}</td>
                      <td><span class="pallino" [attr.data-tono]="toneStato(a.statoTempi)">{{ ETICHETTA_TEMPI[a.statoTempi] }}</span></td>
                      <td><span class="pallino" [attr.data-tono]="toneStato(a.statoCosti)">{{ ETICHETTA_COSTI[a.statoCosti] }}</span></td>
                    } @else {
                      <td colspan="6" class="tenue piccolo">Senza stima in giorni: nessun indicatore.</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
            <p class="tenue piccolo">SPI e stato dei tempi solo per le attività con data di inizio e di fine.</p>
          }
        } @else {
          <p class="tenue">{{ testi.tempi }}</p>
        }
        <p class="tenue piccolo">Calcolati il {{ calcolato(d.calcolatoIl) }}{{ d.vista === 'provvisoria' ? ', con le ore non ancora approvate (dati provvisori)' : '' }}.</p>
      } @else if (caricamento()) {
        <p class="tenue">Caricamento…</p>
      }
    </section>
  `,
  styles: `
    .riga-titolo { display: flex; justify-content: space-between; align-items: center; gap: 1rem;
      label { font-size: 0.85rem; color: #5a6478; display: flex; gap: 0.4rem; align-items: center; } }
    h3 { font-size: 0.95rem; margin: 1rem 0 0.35rem; }
    .stati { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 0.35rem 0; }
    .stato-evm { border-radius: 8px; padding: 6px 14px; border: 1px solid; display: flex; gap: 0.5rem; align-items: baseline; }
    .spiegazione { margin: 0.35rem 0 0.6rem; line-height: 1.5; }
    .indicatori tr.indice td { font-weight: 600; }
    .negativo { color: #b42318; }
    .numero { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .piccolo { font-size: 0.8rem; }
    .avviso { color: #9a5b00; background: #fff8e6; border: 1px solid #f3dca8; border-radius: 6px; padding: 4px 10px; margin: 0.35rem 0; }
  `,
})
export class EvmProgettoComponent {
  private readonly api = inject(ConsuntivazioneApiService);
  readonly id = input.required<string>();
  readonly vista = input<VistaReport>('approvata');

  protected readonly voci = VOCI;
  protected readonly ETICHETTA_TEMPI = ETICHETTA_TEMPI;
  protected readonly ETICHETTA_COSTI = ETICHETTA_COSTI;
  protected readonly toneStato = toneStato;
  protected readonly spiegazione = spiegazione;
  protected readonly indice = indice;
  protected readonly gg = gg;
  protected readonly totaleOre = totaleOre;
  protected readonly calcolato = calcolato;
  protected readonly massimo = oggi();

  protected al = oggi();
  protected readonly dati = signal<EvmScheda | null>(null);
  protected readonly caricamento = signal(true);
  protected readonly errore = signal('');

  constructor() {
    // Ricarica quando cambia la vista della scheda.
    effect(() => {
      this.vista();
      this.carica();
    });
  }

  protected carica() {
    this.caricamento.set(true);
    this.errore.set('');
    this.api.evmProgetto(this.id(), { vista: this.vista(), al: this.al }).subscribe({
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

  protected valore(i: IndicatoriEvm, v: Voce, unita: 'euro' | 'giorni') {
    const n = i[v.chiave];
    if (v.tipo === 'indice') return indice(n);
    if (n === null) return '—';
    return unita === 'euro' ? euro(n) : gg(n);
  }

  protected negativo(i: IndicatoriEvm, v: Voce) {
    const n = i[v.chiave];
    return (v.chiave === 'sv' || v.chiave === 'cv' || v.chiave === 'vac') && n !== null && n < 0;
  }

  protected percento(n: number) {
    return `${Math.round(n).toLocaleString('it-IT')}%`;
  }

  protected fonte(f: 'definitiva' | 'manageriale' | null | undefined) {
    return f === 'manageriale' ? 'manageriale (manca la definitiva)' : 'definitiva';
  }
}
