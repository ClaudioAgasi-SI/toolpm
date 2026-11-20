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
 * Pagina iniziale della sezione Consuntivazione (fase 2, blocco C0): mostra a ciascuno le funzioni
 * che lo riguardano. Le singole pagine si aggiungono con i blocchi C1, C2, C5 e C6.
 */
@Component({
  selector: 'app-consuntivazione-inizio',
  imports: [RouterLink],
  template: `
    <h1>Consuntivazione</h1>
    <p class="sottotitolo">Le funzioni della sezione arrivano un po' alla volta con i rilasci della fase 2.</p>
    @if (voci().length) {
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
    } @else {
      <p class="nota">Il tuo utente non è collegato a una risorsa e non ha il ruolo di controller: in questa sezione non ci sono funzioni per te.</p>
    }
  `,
  styles: `
    .sottotitolo, .nota { color: #5a6478; }
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
export class ConsuntivazioneInizio {
  private readonly sessione = inject(SessioneService);

  protected readonly voci = computed<Voce[]>(() => {
    const voci: Voce[] = [];
    if (this.sessione.puo('consuntivare')) {
      voci.push({ titolo: 'Il mio consuntivo', descrizione: 'Ore lavorate per giorno o per settimana, su progetti e attività.', percorso: 'settimana' });
    }
    if (this.sessione.puo('gestireTipologieCosto')) {
      voci.push({ titolo: 'Tipologie di costo', descrizione: 'Ordinaria, straordinaria, notturna, festiva e le altre; quella proposta di default.', percorso: 'tipologie' });
    }
    if (this.sessione.puo('gestireTariffe')) {
      voci.push(
        { titolo: 'Tariffe', descrizione: 'Tariffe standard per ruolo e personalizzate per risorsa, con validità.', percorso: 'tariffe' },
        { titolo: 'Righe da valorizzare', descrizione: 'Ore senza tariffa applicabile e ricalcolo dei costi.', percorso: 'da-valorizzare' },
      );
    }
    return voci;
  });
}
