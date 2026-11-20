import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';
import type { CategoriaTipologia, TipologiaCosto } from './modelli';

interface Bozza {
  descrizione: string;
  ordine: number | null;
  categoria: CategoriaTipologia;
  attiva: boolean;
}

/**
 * Tipologie di costo (fase 2, blocco C1), pagina del controller.
 * Il codice non si modifica; le tipologie non si cancellano, si disattivano. Una sola è la
 * predefinita, proposta sulle righe nuove del consuntivo: si cambia scegliendo la nuova.
 */
@Component({
  selector: 'app-tipologie-costo',
  imports: [FormsModule],
  template: `
    <header class="testata">
      <h1>Tipologie di costo</h1>
      <label class="azioni"><input type="checkbox" [ngModel]="soloAttive()" (ngModelChange)="soloAttive.set($event)" /> solo attive</label>
    </header>
    <p class="nota">
      La tipologia <strong>predefinita</strong> è quella proposta su ogni riga nuova del consuntivo; la risorsa può cambiarla.
      Le ore di categoria <em>ordinaria</em> si confrontano con l'orario contrattuale della risorsa.
    </p>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    <table class="elenco">
      <thead>
        <tr>
          <th style="width: 5rem">Ordine</th>
          <th style="width: 13rem">Codice</th>
          <th>Descrizione</th>
          <th style="width: 9rem">Categoria</th>
          <th style="width: 5rem">Attiva</th>
          <th style="width: 10rem">Predefinita</th>
          <th style="width: 9rem"></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><input name="nuovo-ordine" type="number" min="0" step="1" placeholder="auto" [(ngModel)]="nuova.ordine" /></td>
          <td><input name="nuovo-codice" placeholder="es. REPERIBILITA" [(ngModel)]="nuova.codice" /></td>
          <td><input name="nuova-descrizione" placeholder="Descrizione" [(ngModel)]="nuova.descrizione" (keyup.enter)="crea()" /></td>
          <td>
            <select name="nuova-categoria" [(ngModel)]="nuova.categoria">
              <option value="ordinaria">ordinaria</option>
              <option value="straordinaria">straordinaria</option>
            </select>
          </td>
          <td></td>
          <td></td>
          <td><button type="button" class="primario" [disabled]="!nuova.codice || !nuova.descrizione" (click)="crea()">Aggiungi</button></td>
        </tr>
        @for (t of visibili(); track t._id) {
          <tr [class.disattivo]="!t.attiva">
            @if (inModifica() === t._id) {
              <td><input name="ordine" type="number" min="0" step="1" [(ngModel)]="bozza.ordine" /></td>
              <td><strong>{{ t.codice }}</strong></td>
              <td><input name="descrizione" [(ngModel)]="bozza.descrizione" (keyup.enter)="salva(t)" /></td>
              <td>
                <select name="categoria" [(ngModel)]="bozza.categoria">
                  <option value="ordinaria">ordinaria</option>
                  <option value="straordinaria">straordinaria</option>
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  name="attiva"
                  [(ngModel)]="bozza.attiva"
                  [disabled]="t.predefinita"
                  [title]="t.predefinita ? 'La predefinita non si disattiva: scegli prima un\\'altra predefinita' : ''"
                />
              </td>
              <td>{{ t.predefinita ? 'sì' : '' }}</td>
              <td class="azioni">
                <button type="button" class="primario" (click)="salva(t)">Salva</button>
                <button type="button" (click)="inModifica.set(null)">Annulla</button>
              </td>
            } @else {
              <td>{{ t.ordine }}</td>
              <td><strong>{{ t.codice }}</strong></td>
              <td>{{ t.descrizione }}</td>
              <td>{{ t.categoria }}</td>
              <td>{{ t.attiva ? 'sì' : 'no' }}</td>
              <td>
                @if (t.predefinita) {
                  <span class="etichetta-predefinita">predefinita</span>
                } @else if (t.attiva) {
                  <button type="button" (click)="rendiPredefinita(t)">Rendi predefinita</button>
                }
              </td>
              <td><button type="button" (click)="modifica(t)">Modifica</button></td>
            }
          </tr>
        } @empty {
          <tr><td colspan="7" class="tenue">{{ caricato() ? 'Nessuna tipologia.' : 'Caricamento…' }}</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    input[type='number'] { width: 4.5rem; }
    .etichetta-predefinita {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 10px;
      background: #e7f1fb;
      color: #1f4f8f;
      font-size: 0.85rem;
    }
  `,
})
export class TipologieCosto {
  private readonly api = inject(ConsuntivazioneApiService);

  protected readonly tipologie = signal<TipologiaCosto[]>([]);
  protected readonly soloAttive = signal(false);
  protected readonly errore = signal('');
  protected readonly caricato = signal(false);
  protected readonly inModifica = signal<string | null>(null);
  protected nuova = { codice: '', descrizione: '', categoria: 'straordinaria' as CategoriaTipologia, ordine: null as number | null };
  protected bozza: Bozza = { descrizione: '', ordine: null, categoria: 'ordinaria', attiva: true };

  protected readonly visibili = computed(() => (this.soloAttive() ? this.tipologie().filter((t) => t.attiva) : this.tipologie()));

  constructor() {
    this.carica();
  }

  private carica() {
    this.api.tipologie().subscribe({
      next: (t) => {
        this.tipologie.set(t);
        this.caricato.set(true);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  private esito() {
    return {
      next: () => {
        this.inModifica.set(null);
        this.carica();
      },
      error: (e: unknown) => this.errore.set(messaggioErrore(e)),
    };
  }

  protected crea() {
    this.errore.set('');
    const t: Partial<TipologiaCosto> = {
      codice: this.nuova.codice.trim(),
      descrizione: this.nuova.descrizione,
      categoria: this.nuova.categoria,
    };
    if (this.nuova.ordine !== null && String(this.nuova.ordine) !== '') t.ordine = Number(this.nuova.ordine);
    this.api.creaTipologia(t).subscribe({
      ...this.esito(),
      next: () => {
        this.nuova = { codice: '', descrizione: '', categoria: 'straordinaria', ordine: null };
        this.carica();
      },
    });
  }

  protected modifica(t: TipologiaCosto) {
    this.errore.set('');
    this.bozza = { descrizione: t.descrizione, ordine: t.ordine, categoria: t.categoria, attiva: t.attiva };
    this.inModifica.set(t._id);
  }

  protected salva(t: TipologiaCosto) {
    this.errore.set('');
    const modifiche: Partial<TipologiaCosto> = { descrizione: this.bozza.descrizione, categoria: this.bozza.categoria, attiva: this.bozza.attiva };
    if (this.bozza.ordine !== null && String(this.bozza.ordine) !== '') modifiche.ordine = Number(this.bozza.ordine);
    this.api.modificaTipologia(t._id, modifiche).subscribe(this.esito());
  }

  protected rendiPredefinita(t: TipologiaCosto) {
    this.errore.set('');
    this.api.modificaTipologia(t._id, { predefinita: true }).subscribe(this.esito());
  }
}
