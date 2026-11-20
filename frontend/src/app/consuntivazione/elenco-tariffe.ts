import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { giorno, inCentesimi, inEuro } from '../comuni/modelli';
import { type DatiTariffa, euroOra, type Tariffa, type TipologiaCosto } from './modelli';

interface Bozza {
  tipologiaId: string;
  validoDal: string;
  validoAl: string;
  euro: number | null;
}

/** Richiesta di modifica emessa verso la pagina, che chiama l'API giusta (standard o personalizzata). */
export interface ModificaTariffa {
  id: string;
  dati: DatiTariffa;
}

/**
 * Elenco delle tariffe di un ruolo o di una risorsa, raggruppate per tipologia, con inserimento,
 * modifica in riga e cancellazione. Non chiama le API: emette eventi verso la pagina.
 * Una correzione di importo si fa di norma chiudendo il periodo (data di fine) e aprendone un altro.
 */
@Component({
  selector: 'app-elenco-tariffe',
  imports: [FormsModule],
  template: `
    <table class="elenco">
      <thead>
        <tr>
          <th>Tipologia</th>
          <th style="width: 10rem">Valida dal</th>
          <th style="width: 10rem">Valida al</th>
          <th style="width: 9rem">€/h</th>
          <th style="width: 12rem"></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <select name="nuova-tipologia" [(ngModel)]="nuova.tipologiaId">
              <option value="">— tipologia —</option>
              @for (t of tipologieAttive(); track t._id) {
                <option [value]="t._id">{{ t.descrizione }}</option>
              }
            </select>
          </td>
          <td><input name="nuova-dal" type="date" [(ngModel)]="nuova.validoDal" /></td>
          <td><input name="nuova-al" type="date" [(ngModel)]="nuova.validoAl" title="Vuota = senza fine" /></td>
          <td><input name="nuova-euro" type="number" min="0" step="0.01" placeholder="0,00" [(ngModel)]="nuova.euro" /></td>
          <td>
            <button
              type="button"
              class="primario"
              [disabled]="!nuova.tipologiaId || !nuova.validoDal || nuova.euro === null || nuova.euro === undefined"
              (click)="aggiungi()"
            >
              Aggiungi
            </button>
          </td>
        </tr>
        @for (t of ordinate(); track t._id) {
          <tr [class.disattivo]="!valida(t)">
            <td>{{ nomeTipologia(t.tipologiaId) }}</td>
            @if (inModifica() === t._id) {
              <td><input name="dal" type="date" [(ngModel)]="bozza.validoDal" /></td>
              <td><input name="al" type="date" [(ngModel)]="bozza.validoAl" /></td>
              <td><input name="euro" type="number" min="0" step="0.01" [(ngModel)]="bozza.euro" /></td>
              <td class="azioni">
                <button type="button" class="primario" (click)="salva(t)">Salva</button>
                <button type="button" (click)="inModifica.set(null)">Annulla</button>
              </td>
            } @else {
              <td>{{ formatoData(t.validoDal) }}</td>
              <td>{{ t.validoAl ? formatoData(t.validoAl) : 'senza fine' }}</td>
              <td class="importo">{{ euroOra(t.centesimiOra) }}</td>
              <td class="azioni">
                <button type="button" (click)="avviaModifica(t)">Modifica</button>
                <button type="button" (click)="chiediElimina(t)">Elimina</button>
              </td>
            }
          </tr>
        } @empty {
          <tr><td colspan="5" class="tenue">Nessuna tariffa.</td></tr>
        }
      </tbody>
    </table>
    <p class="tenue">Le righe in grigio non valgono alla data scelta sopra. Per cambiare un importo, chiudi il periodo con una data di fine e aggiungi la nuova tariffa dal giorno dopo.</p>
  `,
  styles: `
    .importo { text-align: right; font-variant-numeric: tabular-nums; }
    input[type='number'] { width: 7rem; }
    select { min-width: 11rem; }
  `,
})
export class ElencoTariffe {
  readonly tariffe = input.required<Tariffa[]>();
  readonly tipologie = input.required<TipologiaCosto[]>();
  /** Data di riferimento "AAAA-MM-GG": le tariffe non valide in quella data sono in grigio. */
  readonly data = input.required<string>();

  readonly crea = output<DatiTariffa>();
  readonly modifica = output<ModificaTariffa>();
  readonly elimina = output<string>();

  protected readonly euroOra = euroOra;
  protected readonly inModifica = signal<string | null>(null);
  protected nuova: Bozza = { tipologiaId: '', validoDal: '', validoAl: '', euro: null };
  protected bozza: Bozza = { tipologiaId: '', validoDal: '', validoAl: '', euro: null };

  protected readonly tipologieAttive = computed(() => this.tipologie().filter((t) => t.attiva));
  /** Per tipologia (nell'ordine delle tipologie), poi dal periodo più recente. */
  protected readonly ordinate = computed(() => {
    const ordine = new Map(this.tipologie().map((t, i) => [t._id, i]));
    return [...this.tariffe()].sort(
      (a, b) => (ordine.get(a.tipologiaId) ?? 999) - (ordine.get(b.tipologiaId) ?? 999) || b.validoDal.localeCompare(a.validoDal),
    );
  });

  protected nomeTipologia(id: string) {
    return this.tipologie().find((t) => t._id === id)?.descrizione ?? '?';
  }

  protected valida(t: Tariffa) {
    const d = this.data();
    return giorno(t.validoDal) <= d && (!t.validoAl || d <= giorno(t.validoAl));
  }

  protected formatoData(v: string) {
    const [a, m, g] = giorno(v).split('-');
    return `${g}/${m}/${a}`;
  }

  protected aggiungi() {
    this.crea.emit({
      tipologiaId: this.nuova.tipologiaId,
      validoDal: this.nuova.validoDal,
      validoAl: this.nuova.validoAl || null,
      centesimiOra: inCentesimi(this.nuova.euro) ?? 0,
    });
  }

  /** Chiamato dalla pagina dopo un inserimento riuscito. */
  svuota() {
    this.nuova = { tipologiaId: '', validoDal: '', validoAl: '', euro: null };
    this.inModifica.set(null);
  }

  protected avviaModifica(t: Tariffa) {
    this.bozza = { tipologiaId: t.tipologiaId, validoDal: giorno(t.validoDal), validoAl: giorno(t.validoAl), euro: inEuro(t.centesimiOra) };
    this.inModifica.set(t._id);
  }

  protected salva(t: Tariffa) {
    this.modifica.emit({
      id: t._id,
      dati: { validoDal: this.bozza.validoDal, validoAl: this.bozza.validoAl || null, centesimiOra: inCentesimi(this.bozza.euro) ?? 0 },
    });
  }

  protected chiediElimina(t: Tariffa) {
    if (confirm(`Eliminare la tariffa ${this.nomeTipologia(t.tipologiaId)} dal ${this.formatoData(t.validoDal)}? Si può solo se non è ancora usata nei consuntivi.`)) {
      this.elimina.emit(t._id);
    }
  }
}
