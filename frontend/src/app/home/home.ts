import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SEZIONI } from '../sezioni';

/** Pagina iniziale di ToolPM: elenco delle sezioni del prodotto. */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <h1>ToolPM</h1>
    <p class="sottotitolo">Strumenti di project management per sviluppo prodotti e manutenzione evolutiva.</p>
    <div class="sezioni">
      @for (s of sezioni; track s.percorso) {
        <a class="scheda" [routerLink]="['/', s.percorso]">
          <h2>{{ s.nome }}</h2>
          <p>{{ s.descrizione }}</p>
        </a>
      }
    </div>
  `,
  styles: `
    h1 { margin-bottom: 0.25rem; }
    .sottotitolo { color: #5a6478; margin-top: 0; }
    .sezioni { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
    .scheda {
      display: block;
      padding: 1rem 1.25rem;
      border: 1px solid #d5dbe7;
      border-radius: 8px;
      background: #fff;
      color: inherit;
      text-decoration: none;
      h2 { font-size: 1.1rem; margin: 0 0 0.5rem; color: #1f2a44; }
      p { margin: 0; color: #5a6478; }
    }
    .scheda:hover { border-color: #1f6feb; box-shadow: 0 2px 8px rgba(31, 42, 68, 0.08); }
  `,
})
export class Home {
  readonly sezioni = SEZIONI;
}
