import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { Observable } from 'rxjs';
import { ComuniApiService } from '../comuni/comuni-api.service';
import type { RisorsaAnagrafica, VoceAnagrafica } from '../comuni/modelli';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import { ElencoTariffe, type ModificaTariffa } from './elenco-tariffe';
import { type DatiTariffa, euroOra, type Tariffa, tariffaValida, type TariffeApplicabili, type TipologiaCosto } from './modelli';

type Vista = 'standard' | 'personalizzate';

/**
 * Tariffe (fase 2, blocco C2), pagina del controller.
 * - Standard per ruolo: tabella ruolo × tipologia con le tariffe in vigore alla data scelta; cliccando un
 *   ruolo si gestiscono tutti i suoi periodi.
 * - Personalizzate per risorsa: periodi della risorsa e, accanto, la tariffa che si applica alla data per
 *   ogni tipologia con la provenienza (personalizzata, standard del ruolo, da valorizzare).
 */
@Component({
  selector: 'app-tariffe',
  imports: [FormsModule, ElencoTariffe],
  template: `
    <header class="testata">
      <h1>Tariffe</h1>
      <label class="azioni">Tariffe in vigore al <input type="date" name="data" [ngModel]="data()" (ngModelChange)="cambiaData($event)" /></label>
    </header>
    <nav class="schede">
      <button type="button" [class.attiva]="vista() === 'standard'" (click)="vai('standard')">Standard per ruolo</button>
      <button type="button" [class.attiva]="vista() === 'personalizzate'" (click)="vai('personalizzate')">Personalizzate per risorsa</button>
    </nav>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }

    @if (vista() === 'standard') {
      <p class="nota">Costo orario di ogni ruolo per tipologia. Vale per le risorse con quel ruolo, salvo le tipologie con una tariffa personalizzata.</p>
      <table class="elenco matrice">
        <thead>
          <tr>
            <th>Ruolo</th>
            @for (t of tipologieAttive(); track t._id) {
              <th class="importo">{{ t.descrizione }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (r of ruoliAttivi(); track r._id) {
            <tr class="cliccabile" [class.scelto]="ruoloScelto() === r._id" (click)="scegliRuolo(r._id)">
              <td><strong>{{ r.codice }}</strong> {{ r.descrizione }}</td>
              @for (t of tipologieAttive(); track t._id) {
                <td class="importo" [class.mancante]="!inVigore(r._id, t._id)">{{ euroOra(inVigore(r._id, t._id)?.centesimiOra) }}</td>
              }
            </tr>
          } @empty {
            <tr><td [attr.colspan]="tipologieAttive().length + 1" class="tenue">Nessun ruolo: i ruoli si creano in Anagrafiche.</td></tr>
          }
        </tbody>
      </table>
      @if (ruoloScelto(); as id) {
        <h2>Periodi del ruolo {{ nomeRuolo(id) }}</h2>
        <app-elenco-tariffe
          [tariffe]="standardDelRuolo()"
          [tipologie]="tipologie()"
          [data]="data()"
          (crea)="creaStandard(id, $event)"
          (modifica)="modificaStandard($event)"
          (elimina)="eliminaStandard($event)"
        />
      } @else {
        <p class="tenue">Clicca un ruolo per vederne e modificarne le tariffe.</p>
      }
    } @else {
      <p class="nota">Una tariffa personalizzata prevale su quella standard del ruolo, solo per la sua tipologia.</p>
      <label class="scelta-risorsa">
        Risorsa
        <select name="risorsa" [ngModel]="risorsaScelta()" (ngModelChange)="scegliRisorsa($event)">
          <option value="">— scegli —</option>
          @for (r of risorse(); track r._id) {
            <option [value]="r._id">{{ r.cognome }} {{ r.nome }}</option>
          }
        </select>
      </label>
      @if (risorsaScelta(); as id) {
        <div class="due-colonne">
          <section>
            <h2>Tariffe personalizzate</h2>
            <app-elenco-tariffe
              [tariffe]="personalizzate()"
              [tipologie]="tipologie()"
              [data]="data()"
              (crea)="creaPersonalizzata(id, $event)"
              (modifica)="modificaPersonalizzata(id, $event)"
              (elimina)="eliminaPersonalizzata(id, $event)"
            />
          </section>
          <section>
            <h2>Si applica al {{ dataLeggibile() }}</h2>
            @if (applicabili(); as a) {
              <p class="tenue">Ruolo alla data: {{ a.ruolo ? a.ruolo.descrizione : 'nessuno (manca nello storico dei ruoli)' }}</p>
              <table class="elenco">
                <thead><tr><th>Tipologia</th><th class="importo">€/h</th><th>Provenienza</th></tr></thead>
                <tbody>
                  @for (t of a.tariffe; track t.tipologiaId) {
                    @if (t.tipologiaAttiva) {
                      <tr>
                        <td>{{ t.tipologiaDescrizione }}</td>
                        <td class="importo">{{ euroOra(t.centesimiOra) }}</td>
                        <td>
                          @switch (t.fonte) {
                            @case ('personalizzata') { personalizzata }
                            @case ('standard') { standard del ruolo }
                            @default { <span class="mancante">da valorizzare</span> }
                          }
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            }
          </section>
        </div>
      }
    }
  `,
  styles: `
    .schede { display: flex; gap: 0.5rem; margin: 0 0 1rem; border-bottom: 1px solid #d5dbe7; }
    .schede button { border: none; background: none; padding: 6px 4px; border-bottom: 2px solid transparent; border-radius: 0; color: #44506a; cursor: pointer; }
    .schede button.attiva { color: #1f2a44; border-bottom-color: #1f6feb; font-weight: 600; }
    .importo { text-align: right; font-variant-numeric: tabular-nums; }
    .mancante { color: #b4561f; }
    .cliccabile { cursor: pointer; }
    .cliccabile:hover td { background: #f4f7fc; }
    .scelto td { background: #e7f1fb; }
    h2 { font-size: 1.05rem; margin: 1.5rem 0 0.5rem; }
    .scelta-risorsa { display: inline-flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
    .due-colonne { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 2rem; align-items: start; }
    @media (max-width: 1100px) { .due-colonne { grid-template-columns: 1fr; } }
  `,
})
export class Tariffe {
  private readonly api = inject(ConsuntivazioneApiService);
  private readonly comuni = inject(ComuniApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elenco = viewChild(ElencoTariffe);

  protected readonly euroOra = euroOra;
  protected readonly vista = signal<Vista>('standard');
  protected readonly data = signal(new Date().toISOString().slice(0, 10));
  protected readonly errore = signal('');
  protected readonly tipologie = signal<TipologiaCosto[]>([]);
  protected readonly ruoli = signal<VoceAnagrafica[]>([]);
  protected readonly risorse = signal<RisorsaAnagrafica[]>([]);
  protected readonly standard = signal<Tariffa[]>([]);
  protected readonly ruoloScelto = signal<string | null>(null);
  protected readonly risorsaScelta = signal('');
  protected readonly personalizzate = signal<Tariffa[]>([]);
  protected readonly applicabili = signal<TariffeApplicabili | null>(null);

  protected readonly tipologieAttive = computed(() => this.tipologie().filter((t) => t.attiva));
  protected readonly ruoliAttivi = computed(() => this.ruoli().filter((r) => r.attivo));
  protected readonly standardDelRuolo = computed(() => this.standard().filter((t) => t.ruoloId === this.ruoloScelto()));
  protected readonly dataLeggibile = computed(() => this.data().split('-').reverse().join('/'));

  /** Tariffa standard in vigore alla data per ruolo e tipologia (indice calcolato una volta per data). */
  private readonly matrice = computed(() => {
    const m = new Map<string, Tariffa>();
    for (const t of this.standard()) if (tariffaValida(t, this.data())) m.set(`${t.ruoloId}|${t.tipologiaId}`, t);
    return m;
  });

  constructor() {
    this.route.queryParamMap.subscribe((q) => {
      this.vista.set(q.get('vista') === 'personalizzate' ? 'personalizzate' : 'standard');
      this.risorsaScelta.set(q.get('risorsa') ?? '');
    });
    this.carica(this.api.tipologie(), (t) => this.tipologie.set(t));
    this.carica(this.comuni.voci('ruoli'), (r) => this.ruoli.set(r));
    this.carica(this.comuni.risorse(), (r) => this.risorse.set([...r].sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`))));
    this.caricaStandard();
    effect(() => {
      const id = this.risorsaScelta();
      if (id) this.caricaRisorsa(id, this.data());
    });
  }

  protected inVigore(ruoloId: string, tipologiaId: string) {
    return this.matrice().get(`${ruoloId}|${tipologiaId}`);
  }

  protected nomeRuolo(id: string) {
    const r = this.ruoli().find((x) => x._id === id);
    return r ? `${r.codice} — ${r.descrizione}` : '';
  }

  protected vai(vista: Vista) {
    this.router.navigate([], { queryParams: { vista, risorsa: vista === 'personalizzate' ? this.risorsaScelta() || null : null }, queryParamsHandling: 'merge' });
  }

  protected cambiaData(d: string) {
    if (d) this.data.set(d);
  }

  protected scegliRuolo(id: string) {
    this.errore.set('');
    this.ruoloScelto.set(this.ruoloScelto() === id ? null : id);
  }

  protected scegliRisorsa(id: string) {
    this.errore.set('');
    this.router.navigate([], { queryParams: { vista: 'personalizzate', risorsa: id || null } });
  }

  // ---- Standard ----
  protected creaStandard(ruoloId: string, dati: DatiTariffa) {
    this.esegui(this.api.creaTariffaStandard(ruoloId, dati), () => this.caricaStandard(), true);
  }
  protected modificaStandard(m: ModificaTariffa) {
    this.esegui(this.api.modificaTariffaStandard(m.id, m.dati), () => this.caricaStandard(), true);
  }
  protected eliminaStandard(id: string) {
    this.esegui(this.api.eliminaTariffaStandard(id), () => this.caricaStandard());
  }

  // ---- Personalizzate ----
  protected creaPersonalizzata(risorsaId: string, dati: DatiTariffa) {
    this.esegui(this.api.creaTariffaPersonalizzata(risorsaId, dati), () => this.caricaRisorsa(risorsaId, this.data()), true);
  }
  protected modificaPersonalizzata(risorsaId: string, m: ModificaTariffa) {
    this.esegui(this.api.modificaTariffaPersonalizzata(risorsaId, m.id, m.dati), () => this.caricaRisorsa(risorsaId, this.data()), true);
  }
  protected eliminaPersonalizzata(risorsaId: string, id: string) {
    this.esegui(this.api.eliminaTariffaPersonalizzata(risorsaId, id), () => this.caricaRisorsa(risorsaId, this.data()));
  }

  private caricaStandard() {
    this.carica(this.api.tariffeStandard(), (t) => this.standard.set(t));
  }

  private caricaRisorsa(id: string, data: string) {
    this.carica(this.api.tariffePersonalizzate(id), (t) => this.personalizzate.set(t));
    this.carica(this.api.tariffeApplicabili(id, data), (a) => this.applicabili.set(a));
  }

  private carica<T>(richiesta: Observable<T>, fatto: (v: T) => void) {
    richiesta.subscribe({ next: fatto, error: (e) => this.errore.set(messaggioErrore(e)) });
  }

  /** Esegue una scrittura; se riesce ricarica e, per inserimenti e modifiche, svuota il form dell'elenco. */
  private esegui<T>(richiesta: Observable<T>, ricarica: () => void, svuota = false) {
    this.errore.set('');
    richiesta.subscribe({
      next: () => {
        if (svuota) this.elenco()?.svuota();
        ricarica();
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }
}
