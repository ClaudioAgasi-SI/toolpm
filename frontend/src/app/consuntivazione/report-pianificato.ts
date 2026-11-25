import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import type { OrePianificato, ReportPianificato as Report } from './modelli';
import { oggi, totaleOre } from './ore';
import { PulsanteScarica } from './pulsante-scarica';
import { ReportSchede } from './report-schede';
import { calcolato, nomeMese } from './report-testi';

/** Tono dello scostamento: entro ±10% in linea; oltre il 25% (o ore senza pianificato) da guardare. */
export function tonoScostamento(o: OrePianificato): 'linea' | 'attenzione' | 'male' | 'nessuno' {
  if (!o.pianificati && !o.consuntivati) return o.inAttesa ? 'attenzione' : 'nessuno';
  if (o.scostamento.percentuale === null) return 'attenzione';
  const p = Math.abs(o.scostamento.percentuale);
  return p <= 10 ? 'linea' : p <= 25 ? 'attenzione' : 'male';
}

const meseApi = (v: string) => v.replace('-', '');

/**
 * Pianificato e consuntivato (fase 4, blocco E5; decisioni 2 e 3): per risorsa e mese le ore pianificate nel
 * Pianificatore contro le ore approvate, con le ore in attesa e lo scostamento; aprendo la risorsa, il dettaglio per progetto.
 */
@Component({
  selector: 'app-report-pianificato',
  imports: [FormsModule, NgTemplateOutlet, ReportSchede, PulsanteScarica],
  template: `
    <header class="testata"><h1>Report</h1></header>
    <app-report-schede />

    <form class="filtri" (ngSubmit)="carica()">
      <label>dal mese <input type="month" name="da" [(ngModel)]="da" /></label>
      <label>al mese <input type="month" name="a" [(ngModel)]="a" /></label>
      @if (dati(); as d) {
        <label>
          Risorsa
          <select name="risorsa" [(ngModel)]="risorsa">
            <option value="">tutte</option>
            @for (o of d.opzioni.risorse; track o._id) {
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
      }
      <button type="submit">Aggiorna</button>
      @if (dati(); as d) {
        <app-pulsante-scarica percorso="report/pianificato" [filtri]="{ da: d.periodo.da, a: d.periodo.a, risorsa: risorsa, progetto: progetto }" />
      }
    </form>

    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    @if (dati(); as d) {
      @if (!d.risorse.length) {
        <p class="tenue">Nessuna allocazione e nessuna ora nel periodo{{ d.opzioni.progetti.length ? '' : ': non ci sono progetti che puoi vedere' }}.</p>
      } @else {
        <p class="tenue piccolo legenda">
          In ogni casella: ore approvate / ore pianificate, sotto lo scostamento.
          <span class="pallino" data-tono="linea">entro ±10%</span>
          <span class="pallino" data-tono="attenzione">oltre ±10% o senza pianificato</span>
          <span class="pallino" data-tono="male">oltre ±25%</span>
        </p>
        <div class="scorre">
          <table class="elenco griglia-pian">
            <thead>
              <tr>
                <th>Risorsa</th>
                @for (m of d.mesi; track m) {
                  <th class="numero">{{ nomeMese(m) }}</th>
                }
                @if (d.mesi.length > 1) {
                  <th class="numero">Totale</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of d.risorse; track r.risorsaId) {
                <tr class="risorsa">
                  <td>
                    <button type="button" class="apri" (click)="alterna(r.risorsaId)" [attr.aria-expanded]="aperte().has(r.risorsaId)">{{ aperte().has(r.risorsaId) ? '▾' : '▸' }}</button>
                    {{ r.risorsa }}
                    @if (r.oreGiorno !== d.oreGiorno) {
                      <span class="tenue piccolo">({{ r.oreGiorno }} h/giorno)</span>
                    }
                  </td>
                  @for (m of r.mesi; track m.mese) {
                    <td class="numero cella" [attr.data-scost]="tono(m)" [title]="m.giorniLavorativi + ' giorni lavorativi'">
                      <ng-container *ngTemplateOutlet="casella; context: { $implicit: m }" />
                    </td>
                  }
                  @if (d.mesi.length > 1) {
                    <td class="numero cella" [attr.data-scost]="tono(r)"><ng-container *ngTemplateOutlet="casella; context: { $implicit: r }" /></td>
                  }
                </tr>
                @if (aperte().has(r.risorsaId)) {
                  @for (p of progettiDi(r); track p.progettoId) {
                    <tr class="progetto">
                      <td class="nome-progetto">
                        {{ p.progetto }}
                        @if (p.nonAllocato) {
                          <span class="pallino" data-tono="attenzione">non allocata</span>
                        }
                      </td>
                      @for (m of r.mesi; track m.mese) {
                        @if (voce(m, p.progettoId); as v) {
                          <td class="numero cella" [attr.data-scost]="tono(v)">
                            <ng-container *ngTemplateOutlet="casella; context: { $implicit: v }" />
                            @if (v.percentuale !== null) {
                              <div class="tenue piccolo">{{ v.percentuale }}%</div>
                            } @else if (v.nonAllocato) {
                              <div class="piccolo">non allocata</div>
                            }
                          </td>
                        } @else {
                          <td></td>
                        }
                      }
                      @if (d.mesi.length > 1) {
                        <td class="numero cella" [attr.data-scost]="tono(p)"><ng-container *ngTemplateOutlet="casella; context: { $implicit: p }" /></td>
                      }
                    </tr>
                  }
                }
              }
            </tbody>
            <tfoot>
              <tr>
                <th>Totale</th>
                @for (m of d.mesi; track m) {
                  <th class="numero"><ng-container *ngTemplateOutlet="casella; context: { $implicit: totaleMese(m) }" /></th>
                }
                @if (d.mesi.length > 1) {
                  <th class="numero"><ng-container *ngTemplateOutlet="casella; context: { $implicit: d.totali }" /></th>
                }
              </tr>
            </tfoot>
          </table>
        </div>
      }
      <p class="tenue piccolo">
        Pianificato = percentuale di allocazione del Pianificatore × giorni lavorativi del mese (da lunedì a venerdì, meno le festività nazionali, entro le date
        di ingresso e uscita) × ore contrattuali al giorno (altrimenti {{ d.oreGiorno }}); le ferie non sono tolte. Consuntivato = ore approvate dal PM (e dei mesi
        chiusi); le ore non ancora approvate sono indicate a parte. Calcolato il {{ calcolato(d.calcolatoIl) }}.
      </p>
    } @else if (caricamento()) {
      <p class="tenue">Caricamento…</p>
    }

    <ng-template #casella let-o>
      <div><strong>{{ ore(o.consuntivati) }}</strong> / {{ ore(o.pianificati) }}</div>
      <div class="piccolo scost">
        @if (o.pianificati || o.consuntivati) {
          {{ segno(o.scostamento.minuti) }}{{ ore(o.scostamento.minuti) }}{{ o.scostamento.percentuale !== null ? ' (' + segno(o.scostamento.percentuale) + abs(o.scostamento.percentuale) + '%)' : '' }}
        }
      </div>
      @if (o.inAttesa) {
        <div class="piccolo tenue">+{{ ore(o.inAttesa) }} in attesa</div>
      }
    </ng-template>
  `,
  styles: `
    .filtri { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; margin: 0.5rem 0 1rem;
      label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; color: #5a6478; } }
    .legenda { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .scorre { overflow-x: auto; }
    .numero { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .piccolo { font-size: 0.78rem; }
    .griglia-pian td.cella { background: transparent; border-color: #e9ecf1; }
    .griglia-pian td.cella[data-scost='attenzione'] { background: #fffaf1; }
    .griglia-pian td.cella[data-scost='male'] { background: #fdf5f5; }
    .griglia-pian td.cella[data-scost='attenzione'] .scost { color: #9a5b00; }
    .griglia-pian td.cella[data-scost='male'] .scost { color: #b42318; }
    .griglia-pian td.cella[data-scost='linea'] .scost { color: #1c5d99; }
    tr.risorsa td { font-weight: 600; }
    tr.risorsa td .piccolo { font-weight: 400; }
    tr.progetto td { background: #fafbfc; }
    .nome-progetto { padding-left: 2.2rem; }
    .apri { width: 1.3rem; background: none; border: none; cursor: pointer; padding: 0; }
    tfoot th { border-top: 2px solid #c9d1de; }
  `,
})
export class ReportPianificato {
  private readonly api = inject(ConsuntivazioneApiService);
  protected readonly nomeMese = nomeMese;
  protected readonly calcolato = calcolato;

  protected da = oggi().slice(0, 7);
  protected a = oggi().slice(0, 7);
  protected risorsa = '';
  protected progetto = '';

  protected readonly dati = signal<Report | null>(null);
  protected readonly aperte = signal<ReadonlySet<string>>(new Set());
  protected readonly caricamento = signal(true);
  protected readonly errore = signal('');

  /** Totali di ogni mese su tutte le risorse. */
  private readonly perMese = computed(() => {
    const m = new Map<string, OrePianificato>();
    for (const r of this.dati()?.risorse ?? []) {
      for (const x of r.mesi) {
        const t = m.get(x.mese) ?? { pianificati: 0, consuntivati: 0, inAttesa: 0, scostamento: { minuti: 0, percentuale: null } };
        t.pianificati += x.pianificati;
        t.consuntivati += x.consuntivati;
        t.inAttesa += x.inAttesa;
        const s = t.consuntivati - t.pianificati;
        t.scostamento = { minuti: s, percentuale: t.pianificati ? Math.round((s / t.pianificati) * 100) : null };
        m.set(x.mese, t);
      }
    }
    return m;
  });

  constructor() {
    this.carica();
  }

  protected carica() {
    this.caricamento.set(true);
    this.errore.set('');
    this.api.reportPianificato({ da: meseApi(this.da), a: meseApi(this.a || this.da), risorsa: this.risorsa, progetto: this.progetto }).subscribe({
      next: (r) => {
        this.dati.set(r);
        this.aperte.set(new Set(r.risorse.length <= 3 ? r.risorse.map((x) => x.risorsaId) : []));
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }

  protected alterna(id: string) {
    const s = new Set(this.aperte());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.aperte.set(s);
  }

  /** Progetti della risorsa nel periodo, con i totali del periodo. */
  protected progettiDi(r: Report['risorse'][number]) {
    const m = new Map<string, OrePianificato & { progettoId: string; progetto: string; nonAllocato: boolean }>();
    for (const x of r.mesi) {
      for (const p of x.progetti) {
        const t = m.get(p.progettoId) ?? { progettoId: p.progettoId, progetto: p.progetto, pianificati: 0, consuntivati: 0, inAttesa: 0, nonAllocato: true, scostamento: { minuti: 0, percentuale: null } };
        t.pianificati += p.pianificati;
        t.consuntivati += p.consuntivati;
        t.inAttesa += p.inAttesa;
        t.nonAllocato = t.nonAllocato && p.nonAllocato;
        const s = t.consuntivati - t.pianificati;
        t.scostamento = { minuti: s, percentuale: t.pianificati ? Math.round((s / t.pianificati) * 100) : null };
        m.set(p.progettoId, t);
      }
    }
    return [...m.values()].sort((x, y) => x.progetto.localeCompare(y.progetto, 'it'));
  }

  protected voce(m: Report['risorse'][number]['mesi'][number], progettoId: string) {
    return m.progetti.find((p) => p.progettoId === progettoId) ?? null;
  }

  protected totaleMese(m: string) {
    return this.perMese().get(m) ?? { pianificati: 0, consuntivati: 0, inAttesa: 0, scostamento: { minuti: 0, percentuale: null } };
  }

  protected tono(o: OrePianificato) {
    return tonoScostamento(o);
  }

  protected ore(minuti: number) {
    return totaleOre(Math.abs(minuti));
  }

  protected abs(n: number) {
    return Math.abs(n);
  }

  protected segno(n: number) {
    return n > 0 ? '+' : n < 0 ? '−' : '';
  }

}
