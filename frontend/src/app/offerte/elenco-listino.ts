import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { giorno, inCentesimi, inEuro } from '../comuni/modelli';
import { type DatiVoceListino, euroGiorno, type VoceListino } from './modelli';

interface Bozza {
  validoDal: string;
  validoAl: string;
  euro: number | null;
}

export interface ModificaVoceListino {
  id: string;
  dati: DatiVoceListino;
}

/**
 * Periodi del listino di vendita di un ruolo (standard o di un cliente), dal più recente, con inserimento,
 * modifica in riga e cancellazione per chi può gestire il listino; in sola lettura per gli altri.
 * Non chiama le API: emette eventi verso la pagina.
 */
@Component({
  selector: 'app-elenco-listino',
  imports: [FormsModule],
  template: `
    <table class="elenco">
      <thead>
        <tr>
          <th style="width: 10rem">Valida dal</th>
          <th style="width: 10rem">Valida al</th>
          <th style="width: 10rem" class="importo">€/giorno</th>
          @if (modificabile()) {
            <th style="width: 12rem"></th>
          }
        </tr>
      </thead>
      <tbody>
        @if (modificabile()) {
          <tr>
            <td><input name="nuova-dal" type="date" [(ngModel)]="nuova.validoDal" /></td>
            <td><input name="nuova-al" type="date" [(ngModel)]="nuova.validoAl" title="Vuota = senza fine" /></td>
            <td><input name="nuova-euro" type="number" min="0" step="0.01" placeholder="0,00" [(ngModel)]="nuova.euro" /></td>
            <td>
              <button type="button" class="primario" [disabled]="!nuova.validoDal || nuova.euro === null || nuova.euro === undefined" (click)="aggiungi()">
                Aggiungi
              </button>
            </td>
          </tr>
        }
        @for (v of ordinate(); track v._id) {
          <tr [class.disattivo]="!valida(v)">
            @if (inModifica() === v._id) {
              <td><input name="dal" type="date" [(ngModel)]="bozza.validoDal" /></td>
              <td><input name="al" type="date" [(ngModel)]="bozza.validoAl" /></td>
              <td><input name="euro" type="number" min="0" step="0.01" [(ngModel)]="bozza.euro" /></td>
              <td class="azioni">
                <button type="button" class="primario" (click)="salva(v)">Salva</button>
                <button type="button" (click)="inModifica.set(null)">Annulla</button>
              </td>
            } @else {
              <td>{{ formatoData(v.validoDal) }}</td>
              <td>{{ v.validoAl ? formatoData(v.validoAl) : 'senza fine' }}</td>
              <td class="importo">{{ euroGiorno(v.centesimiGiorno) }}</td>
              @if (modificabile()) {
                <td class="azioni">
                  <button type="button" (click)="avviaModifica(v)">Modifica</button>
                  <button type="button" (click)="chiediElimina(v)">Elimina</button>
                </td>
              }
            }
          </tr>
        } @empty {
          <tr><td [attr.colspan]="modificabile() ? 4 : 3" class="tenue">Nessuna tariffa in questo listino.</td></tr>
        }
      </tbody>
    </table>
    <p class="tenue">
      Le righe in grigio non valgono alla data scelta sopra.
      @if (modificabile()) {
        Per cambiare un prezzo, chiudi il periodo con una data di fine e aggiungi la nuova tariffa dal giorno dopo: le offerte già approvate tengono i prezzi di allora.
      }
    </p>
  `,
  styles: `
    .importo { text-align: right; font-variant-numeric: tabular-nums; }
    input[type='number'] { width: 7rem; }
  `,
})
export class ElencoListino {
  readonly voci = input.required<VoceListino[]>();
  /** Data di riferimento "AAAA-MM-GG": le voci non valide in quella data sono in grigio. */
  readonly data = input.required<string>();
  readonly modificabile = input(false);

  readonly crea = output<DatiVoceListino>();
  readonly modifica = output<ModificaVoceListino>();
  readonly elimina = output<string>();

  protected readonly euroGiorno = euroGiorno;
  protected readonly inModifica = signal<string | null>(null);
  protected nuova: Bozza = { validoDal: '', validoAl: '', euro: null };
  protected bozza: Bozza = { validoDal: '', validoAl: '', euro: null };

  protected readonly ordinate = computed(() => [...this.voci()].sort((a, b) => b.validoDal.localeCompare(a.validoDal)));

  protected valida(v: VoceListino) {
    const d = this.data();
    return giorno(v.validoDal) <= d && (!v.validoAl || d <= giorno(v.validoAl));
  }

  protected formatoData(v: string) {
    const [a, m, g] = giorno(v).split('-');
    return `${g}/${m}/${a}`;
  }

  protected aggiungi() {
    this.crea.emit({ validoDal: this.nuova.validoDal, validoAl: this.nuova.validoAl || null, centesimiGiorno: inCentesimi(this.nuova.euro) ?? 0 });
  }

  /** Chiamato dalla pagina dopo un inserimento o una modifica riusciti. */
  svuota() {
    this.nuova = { validoDal: '', validoAl: '', euro: null };
    this.inModifica.set(null);
  }

  protected avviaModifica(v: VoceListino) {
    this.bozza = { validoDal: giorno(v.validoDal), validoAl: giorno(v.validoAl), euro: inEuro(v.centesimiGiorno) };
    this.inModifica.set(v._id);
  }

  protected salva(v: VoceListino) {
    this.modifica.emit({ id: v._id, dati: { validoDal: this.bozza.validoDal, validoAl: this.bozza.validoAl || null, centesimiGiorno: inCentesimi(this.bozza.euro) ?? 0 } });
  }

  protected chiediElimina(v: VoceListino) {
    if (confirm(`Eliminare la tariffa di vendita dal ${this.formatoData(v.validoDal)}? Usala solo per un inserimento sbagliato.`)) this.elimina.emit(v._id);
  }
}
