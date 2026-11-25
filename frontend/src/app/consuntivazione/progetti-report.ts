import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { etichettaStato, STATI_PROGETTO } from '../comuni/modelli';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import type { ProgettoReport, VistaReport } from './modelli';
import { totaleOre } from './ore';
import { ETICHETTA_COSTI, ETICHETTA_TEMPI, indice, toneStato } from './evm-testi';
import { calcolato, euro, gg, quota } from './report-testi';

/**
 * Progetti: costi e avanzamento (fase 4, blocchi E1 ed E2). Elenco dei progetti visibili all'utente con stime,
 * consuntivato dall'inizio e ore in attesa; porta alla scheda. Due viste (decisione 11).
 */
@Component({
  selector: 'app-progetti-report',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="testata">
      <h1>Progetti: costi e avanzamento</h1>
      <div class="azioni filtri">
        <label>
          Stato
          <select name="stato" [(ngModel)]="stato" (ngModelChange)="carica()">
            <option value="">tutti</option>
            @for (s of stati; track s.valore) {
              <option [value]="s.valore">{{ s.etichetta }}</option>
            }
          </select>
        </label>
        <label>Cerca <input name="testo" placeholder="codice o titolo" [(ngModel)]="testo" (keyup.enter)="carica()" /></label>
        <label class="spunta">
          <input type="checkbox" name="provvisoria" [(ngModel)]="provvisoria" (ngModelChange)="carica()" />
          Includi le ore non ancora approvate
        </label>
      </div>
    </header>
    @if (provvisoria) {
      <p class="provvisori">Dati provvisori: comprendono le ore in bozza, inviate e con il via libera del TL, non ancora approvate dal PM.</p>
    }
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    @if (caricamento()) {
      <p class="tenue">Caricamento…</p>
    } @else if (!progetti().length) {
      <p class="tenue">Nessun progetto. Vedi i progetti di cui sei TL o PM; controller e PMSenior li vedono tutti.</p>
    } @else {
      <table class="elenco">
        <thead>
          <tr>
            <th>Progetto</th>
            <th>Stato</th>
            <th class="numero">Completato</th>
            <th>Tempi</th>
            <th>Costi</th>
            <th class="numero">Stima (gg)</th>
            <th class="numero">Consuntivato (gg)</th>
            <th class="numero">Della stima</th>
            @if (conEuro()) {
              <th class="numero">Stima (€)</th>
              <th class="numero">Costo</th>
            }
            <th class="numero">In attesa</th>
          </tr>
        </thead>
        <tbody>
          @for (p of progetti(); track p._id) {
            <tr>
              <td>
                <a [routerLink]="[p._id]"><strong>{{ p.codice }}</strong> — {{ p.titolo }}</a>
                <div class="tenue piccolo">{{ p.cliente ?? 'Interno' }} · {{ p.centroCosto }}</div>
              </td>
              <td><span class="stato" [class]="p.stato">{{ etichettaStato(p.stato) }}</span></td>
              <td class="numero">{{ p.percentualeCompletamento }}%</td>
              <td>
                @if (p.evm.calcolabile) {
                  <span class="pallino" [attr.data-tono]="toneStato(p.evm.statoTempi)" [title]="'SPI ' + indice(p.evm.spi)">{{ ETICHETTA_TEMPI[p.evm.statoTempi] }}</span>
                }
              </td>
              <td>
                @if (p.evm.calcolabile) {
                  <span class="pallino" [attr.data-tono]="toneStato(p.evm.statoCosti)" [title]="'CPI ' + indice(p.evm.cpi)">{{ ETICHETTA_COSTI[p.evm.statoCosti] }}</span>
                }
              </td>
              <td class="numero">{{ gg(stimaGiorni(p)) }}</td>
              <td class="numero">{{ gg(p.consuntivato.giorni) }}</td>
              <td class="numero" [class.oltre]="(quota(p.consuntivato.giorni, stimaGiorni(p)) ?? 0) > 100">{{ percento(quota(p.consuntivato.giorni, stimaGiorni(p))) }}</td>
              @if (conEuro()) {
                <td class="numero">{{ p.vedeEuro ? euro(p.stime.definitivaCentesimi ?? p.stime.managerialeCentesimi) : '' }}</td>
                <td class="numero">
                  {{ p.vedeEuro ? euro(p.consuntivato.costoCentesimi) : '' }}
                  @if (p.consuntivato.daValorizzare) {
                    <span class="segno" title="Righe senza costo: da valorizzare">*</span>
                  }
                </td>
              }
              <td class="numero tenue">{{ p.inAttesa.righe ? totaleOre(p.inAttesa.minuti) + ' h' : '' }}</td>
            </tr>
          }
        </tbody>
      </table>
      <p class="tenue piccolo">
        Tempi e costi: stato a oggi dagli indici SPI e CPI (passa sopra per vederli). Stima: la definitiva, altrimenti la manageriale. "In attesa": ore inserite ma non ancora approvate dal PM. * righe senza costo (da valorizzare).
        Calcolato il {{ calcolatoIl() }}.
      </p>
    }
  `,
  styles: `
    .filtri { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap;
      label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; color: #5a6478; }
      label.spunta { flex-direction: row; align-items: center; gap: 0.4rem; }
    }
    .numero { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .piccolo { font-size: 0.8rem; }
    .oltre { color: #d1242f; font-weight: 600; }
    .segno { color: #b4561f; margin-left: 2px; }
    .provvisori { background: #fff8e6; border: 1px solid #f3dca8; color: #8a5a00; border-radius: 6px; padding: 4px 10px; }
  `,
})
export class ProgettiReport {
  private readonly api = inject(ConsuntivazioneApiService);
  protected readonly stati = STATI_PROGETTO;
  protected readonly etichettaStato = etichettaStato;
  protected readonly euro = euro;
  protected readonly ETICHETTA_TEMPI = ETICHETTA_TEMPI;
  protected readonly ETICHETTA_COSTI = ETICHETTA_COSTI;
  protected readonly toneStato = toneStato;
  protected readonly indice = indice;
  protected readonly gg = gg;
  protected readonly quota = quota;
  protected readonly totaleOre = totaleOre;

  protected stato = '';
  protected testo = '';
  protected provvisoria = false;
  protected readonly progetti = signal<ProgettoReport[]>([]);
  protected readonly conEuro = signal(false);
  protected readonly calcolatoIl = signal('');
  protected readonly caricamento = signal(true);
  protected readonly errore = signal('');

  constructor() {
    this.carica();
  }

  protected carica() {
    this.caricamento.set(true);
    this.errore.set('');
    const vista: VistaReport = this.provvisoria ? 'provvisoria' : 'approvata';
    this.api.progettiReport({ vista, stato: this.stato, testo: this.testo.trim() }).subscribe({
      next: (e) => {
        this.progetti.set(e.progetti);
        this.conEuro.set(e.progetti.some((p) => p.vedeEuro));
        this.calcolatoIl.set(calcolato(e.calcolatoIl));
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }

  protected stimaGiorni(p: ProgettoReport) {
    return p.stime.definitivaGiorni ?? p.stime.managerialeGiorni;
  }

  protected percento(v: number | null) {
    return v === null ? '—' : `${v}%`;
  }
}
