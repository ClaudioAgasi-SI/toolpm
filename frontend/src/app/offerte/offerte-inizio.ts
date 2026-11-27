import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessioneService } from '../core/sessione.service';

interface Voce {
  titolo: string;
  descrizione: string;
  /** Pagina già disponibile; senza percorso la funzione è ancora in preparazione. */
  percorso?: string;
}

/**
 * Pagina iniziale della sezione Offerte e preventivi (fase 5, blocco F0): mostra a ciascuno le funzioni
 * che lo riguardano; arrivano con i blocchi F1–F5 del piano.
 */
@Component({
  selector: 'app-offerte-inizio',
  imports: [RouterLink],
  template: `
    <h1>Offerte e preventivi</h1>
    <p class="sottotitolo">La sezione arriva un po' alla volta con i rilasci della fase 5; le funzioni in preparazione sono segnate.</p>
    <ul class="voci">
      @for (v of voci(); track v.titolo) {
        <li>
          @if (v.percorso) {
            <a [routerLink]="v.percorso"><strong>{{ v.titolo }}</strong></a>
          } @else {
            <strong>{{ v.titolo }}</strong>
          }
          <span>{{ v.descrizione }}</span>
          @if (!v.percorso) {
            <em>In preparazione</em>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .sottotitolo { color: #5a6478; }
    .voci { list-style: none; padding: 0; display: grid; gap: 0.75rem; max-width: 720px; }
    .voci li {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.25rem 1rem;
      padding: 0.75rem 1rem;
      border: 1px solid #d5dbe7;
      border-radius: 8px;
      background: #fff;
      span { grid-column: 1; color: #5a6478; }
      em { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: #8a93a6; font-style: normal; font-size: 0.85rem; }
    }
  `,
})
export class OfferteInizio {
  private readonly sessione = inject(SessioneService);

  protected readonly voci = computed<Voce[]>(() => {
    const voci: Voce[] = [];
    voci.push({
      titolo: 'Offerte',
      descrizione: this.sessione.puo('creareOfferte')
        ? 'Nuova offerta, stima per ruolo con costo, prezzo e margine, approvazione, invio ed esito.'
        : 'Le offerte su cui sei invitato a stimare i giorni.',
    });
    if (this.sessione.puo('vedereListino')) {
      voci.push({
        titolo: 'Listino di vendita',
        descrizione: 'Tariffe giornaliere di vendita per ruolo, standard e per cliente, con validità.',
        percorso: 'listino',
      });
    }
    voci.push({ titolo: 'Pipeline', descrizione: 'Valore delle offerte aperte per stato, offerte in scadenza e tasso di successo.' });
    return voci;
  });
}
