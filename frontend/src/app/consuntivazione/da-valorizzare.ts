import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ComuniApiService } from '../comuni/comuni-api.service';
import type { RisorsaAnagrafica } from '../comuni/modelli';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import { type AnteprimaRicalcolo, type MotivoDaValorizzare, type RigaDaValorizzare, euroOra } from './modelli';
import { oggi, piuGiorni, totaleOre } from './ore';

interface Gruppo {
  chiave: string;
  risorsaId: string;
  risorsa: string;
  ruolo: string;
  tipologia: string;
  motivo: MotivoDaValorizzare;
  righe: number;
  minuti: number;
  dal: string;
  al: string;
}

export const MOTIVI: Record<MotivoDaValorizzare, string> = {
  ruoloMancante: 'La risorsa non ha un ruolo alla data',
  tariffaMancante: 'Nessuna tariffa per questa tipologia (né personalizzata né del ruolo)',
  tariffaDisponibile: 'La tariffa ora c\'è: basta ricalcolare',
};

/** "1 riga", "3 righe". */
const quante = (n: number, una: string, tante: string) => `${n} ${n === 1 ? una : tante}`;

const euro = (c: number | null | undefined) =>
  c === null || c === undefined ? '—' : `${(c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Righe da valorizzare e ricalcolo (fase 2, blocco C6), pagina del controller.
 * In alto le righe senza costo, raggruppate per risorsa, ruolo, tipologia e motivo, con il collegamento a
 * dove si sistemano (ruolo in Anagrafiche, tariffe). Sotto il ricalcolo: anteprima prima/dopo, poi conferma.
 */
@Component({
  selector: 'app-da-valorizzare',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="testata">
      <h1>Righe da valorizzare e ricalcolo</h1>
      <div class="azioni">
        <label>dal <input type="date" name="da" [(ngModel)]="da" /></label>
        <label>al <input type="date" name="a" [(ngModel)]="a" /></label>
        <button type="button" (click)="carica()">Aggiorna</button>
      </div>
    </header>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    @if (messaggio()) {
      <p class="ok">{{ messaggio() }}</p>
    }

    <section>
      <h2>Righe senza costo</h2>
      <p class="nota">Ore consuntivate per cui non c'è una tariffa applicabile. Sistemato il motivo, il ricalcolo qui sotto le valorizza.</p>
      <table class="elenco">
        <thead>
          <tr><th>Risorsa</th><th>Ruolo alla data</th><th>Tipologia</th><th>Motivo</th><th class="numero">Righe</th><th class="numero">Ore</th><th>Periodo</th><th></th></tr>
        </thead>
        <tbody>
          @for (g of gruppi(); track g.chiave) {
            <tr>
              <td><strong>{{ g.risorsa }}</strong></td>
              <td>{{ g.ruolo }}</td>
              <td>{{ g.tipologia }}</td>
              <td [class.da-fare]="g.motivo !== 'tariffaDisponibile'" [class.pronta]="g.motivo === 'tariffaDisponibile'">{{ motivi[g.motivo] }}</td>
              <td class="numero">{{ g.righe }}</td>
              <td class="numero">{{ totaleOre(g.minuti) }}</td>
              <td>{{ periodo(g) }}</td>
              <td class="azioni">
                @switch (g.motivo) {
                  @case ('ruoloMancante') { <a [routerLink]="['/comuni/risorse', g.risorsaId]">Imposta il ruolo</a> }
                  @case ('tariffaMancante') {
                    <a routerLink="../tariffe">Tariffe del ruolo</a>
                    <a routerLink="../tariffe" [queryParams]="{ vista: 'personalizzate', risorsa: g.risorsaId }">della risorsa</a>
                  }
                  @default { <button type="button" (click)="anteprima(g.risorsaId)">Anteprima</button> }
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="tenue">{{ caricamento() ? 'Caricamento…' : 'Nessuna riga da valorizzare nel periodo.' }}</td></tr>
          }
        </tbody>
      </table>
    </section>

    <section>
      <h2>Ricalcolo dei costi</h2>
      <p class="nota">
        Applica le tariffe in vigore oggi alle ore del periodo: utile dopo una correzione di tariffa o per valorizzare le righe sistemate.
        Prima guardi l'anteprima, poi confermi; cambiano solo le righe con un valore diverso (non quelle di periodi chiusi).
      </p>
      <div class="azioni riga-comandi">
        <label>Risorsa
          <select name="risorsa" [(ngModel)]="risorsaRicalcolo">
            <option value="">— tutte —</option>
            @for (r of risorse(); track r._id) {
              <option [value]="r._id">{{ r.cognome }} {{ r.nome }}</option>
            }
          </select>
        </label>
        <button type="button" (click)="anteprima()">Anteprima</button>
      </div>
      @if (prova(); as p) {
        <p class="riepilogo">
          <strong>{{ quante(p.totali.righe, 'riga', 'righe') }}</strong> in <strong>{{ quante(p.totali.giornate, 'giornata', 'giornate') }}</strong>
          {{ p.totali.righe === 1 ? 'cambierebbe' : 'cambierebbero' }}:
          costo da <strong>{{ euro(p.totali.primaCentesimi) }}</strong> a <strong>{{ euro(p.totali.dopoCentesimi) }}</strong>;
          righe da valorizzare da {{ p.totali.daValorizzarePrima }} a {{ p.totali.daValorizzareDopo }}.
          @if (p.troncato) { <span class="tenue">(elencate le prime 1000)</span> }
        </p>
        @if (p.totali.righe) {
          <table class="elenco">
            <thead>
              <tr><th>Data</th><th>Risorsa</th><th>Voce</th><th>Tipologia</th><th class="numero">Ore</th><th class="numero">Prima</th><th class="numero">Dopo</th></tr>
            </thead>
            <tbody>
              @for (r of p.righe; track r.rigaId) {
                <tr>
                  <td>{{ r.data.split('-').reverse().join('/') }}</td>
                  <td>{{ r.risorsa }}</td>
                  <td>{{ r.progetto }}{{ r.attivita ? ' › ' + r.attivita : '' }}</td>
                  <td>{{ r.tipologia }}</td>
                  <td class="numero">{{ totaleOre(r.minuti) }}</td>
                  <td class="numero">{{ euro(r.prima.costo) }} <span class="tenue">{{ r.prima.centesimiOra === null ? '' : euroOra(r.prima.centesimiOra) }}</span></td>
                  <td class="numero">{{ euro(r.dopo.costo) }} <span class="tenue">{{ r.dopo.centesimiOra === null ? '' : euroOra(r.dopo.centesimiOra) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
          <button type="button" class="primario" [disabled]="applicazione()" (click)="applica(p)">Applica il ricalcolo ({{ quante(p.totali.righe, 'riga', 'righe') }})</button>
        }
      }
    </section>
  `,
  styles: `
    .testata .azioni { display: flex; gap: 0.75rem; align-items: center; }
    h2 { font-size: 1.05rem; margin: 1.5rem 0 0.25rem; }
    .numero { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .da-fare { color: #b4561f; }
    .pronta { color: #1a7f37; }
    .ok { color: #1a7f37; }
    .riga-comandi { display: flex; gap: 0.75rem; align-items: flex-end; margin: 0.5rem 0; label { display: flex; flex-direction: column; font-size: 0.85rem; color: #5a6478; } }
    .riepilogo { margin: 0.75rem 0; }
    td.azioni { display: flex; gap: 0.6rem; }
  `,
})
export class DaValorizzare {
  private readonly api = inject(ConsuntivazioneApiService);
  private readonly comuni = inject(ComuniApiService);

  protected readonly motivi = MOTIVI;
  protected readonly totaleOre = totaleOre;
  protected readonly euro = euro;
  protected readonly quante = quante;
  protected readonly euroOra = euroOra;

  protected da = `${piuGiorni(`${oggi().slice(0, 8)}01`, -60).slice(0, 8)}01`;
  protected a = oggi();
  protected risorsaRicalcolo = '';

  protected readonly righe = signal<RigaDaValorizzare[]>([]);
  protected readonly risorse = signal<RisorsaAnagrafica[]>([]);
  protected readonly prova = signal<AnteprimaRicalcolo | null>(null);
  protected readonly caricamento = signal(true);
  protected readonly applicazione = signal(false);
  protected readonly errore = signal('');
  protected readonly messaggio = signal('');

  protected readonly gruppi = computed(() => {
    const mappa = new Map<string, Gruppo>();
    for (const r of this.righe()) {
      const chiave = `${r.risorsaId}|${r.ruolo?._id ?? '-'}|${r.tipologiaId}|${r.motivo}`;
      const g = mappa.get(chiave) ?? {
        chiave,
        risorsaId: r.risorsaId,
        risorsa: r.risorsa,
        ruolo: r.ruolo ? r.ruolo.descrizione : '—',
        tipologia: r.tipologia,
        motivo: r.motivo,
        righe: 0,
        minuti: 0,
        dal: r.data,
        al: r.data,
      };
      g.righe++;
      g.minuti += r.minuti;
      if (r.data < g.dal) g.dal = r.data;
      if (r.data > g.al) g.al = r.data;
      mappa.set(chiave, g);
    }
    return [...mappa.values()].sort((x, y) => x.risorsa.localeCompare(y.risorsa) || x.tipologia.localeCompare(y.tipologia));
  });

  constructor() {
    this.comuni.risorse().subscribe((r) => this.risorse.set([...r].sort((x, y) => `${x.cognome} ${x.nome}`.localeCompare(`${y.cognome} ${y.nome}`))));
    this.carica();
  }

  protected periodo(g: Gruppo) {
    const f = (s: string) => s.split('-').reverse().join('/');
    return g.dal === g.al ? f(g.dal) : `${f(g.dal)} – ${f(g.al)}`;
  }

  protected carica() {
    this.caricamento.set(true);
    this.errore.set('');
    this.prova.set(null);
    this.api.daValorizzare(this.da, this.a).subscribe({
      next: (x) => {
        this.righe.set(x.righe);
        this.caricamento.set(false);
      },
      error: (e) => {
        this.errore.set(messaggioErrore(e));
        this.caricamento.set(false);
      },
    });
  }

  protected anteprima(risorsaId?: string) {
    if (risorsaId !== undefined) this.risorsaRicalcolo = risorsaId;
    this.errore.set('');
    this.messaggio.set('');
    this.api.anteprimaRicalcolo(this.da, this.a, this.risorsaRicalcolo || null).subscribe({
      next: (p) => this.prova.set(p),
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected applica(p: AnteprimaRicalcolo) {
    if (!confirm(`Aggiornare il costo di ${quante(p.totali.righe, 'riga', 'righe')} con le tariffe attuali?`)) return;
    this.applicazione.set(true);
    this.api.applicaRicalcolo(this.da, this.a, this.risorsaRicalcolo || null).subscribe({
      next: (esito) => {
        this.applicazione.set(false);
        this.messaggio.set(`Ricalcolo applicato a ${quante(esito.totali.righe, 'riga', 'righe')} in ${quante(esito.totali.giornate, 'giornata', 'giornate')}.`);
        this.carica();
      },
      error: (e) => {
        this.applicazione.set(false);
        this.errore.set(messaggioErrore(e));
      },
    });
  }
}
