import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, messaggioErrore } from '../api.service';
import { Rate } from '../models';

/**
 * Modifica di una scala di valutazione: nome, valori, ordine (dal più alto al più basso).
 * Le modifiche restano in bozza finché non si preme "Salva".
 */
@Component({
  selector: 'app-scala-editor',
  imports: [FormsModule],
  template: `
    <div class="scala" [class.modificata]="modificata()">
      <div class="intestazione">
        @if (nuova()) {
          <input class="nome" placeholder="Nome della scala (es. competenzaTecnica)" [(ngModel)]="nome" />
        } @else {
          <strong>{{ scala().rateType }}</strong>
        }
        <span class="spazio"></span>
        @if (modificata()) {
          <button type="button" (click)="annulla()">Annulla</button>
          <button type="button" class="primario" [disabled]="salvataggio()" (click)="salva()">Salva</button>
        }
        @if (!nuova()) {
          <button type="button" class="pericolo" title="Elimina la scala" (click)="elimina()">Elimina</button>
        }
      </div>

      <ol>
        @for (v of valori(); track $index; let i = $index, primo = $first, ultimo = $last) {
          <li>
            <input [ngModel]="v" (ngModelChange)="rinomina(i, $event)" [attr.aria-label]="'Valore ' + (i + 1)" />
            <button type="button" [disabled]="primo" (click)="sposta(i, -1)" title="Sposta più in alto">↑</button>
            <button type="button" [disabled]="ultimo" (click)="sposta(i, 1)" title="Sposta più in basso">↓</button>
            <button type="button" class="rimuovi" (click)="rimuovi(i)" title="Rimuovi">×</button>
          </li>
        }
      </ol>
      <form class="aggiungi" (ngSubmit)="aggiungi()">
        <input name="nuovo" placeholder="Nuovo valore" [(ngModel)]="nuovoValore" />
        <button type="submit">+ Aggiungi</button>
      </form>
      @if (errore()) {
        <p class="errore">{{ errore() }}</p>
      }
    </div>
  `,
  styles: `
    .scala { border: 1px solid var(--bordo); border-radius: 8px; padding: 0.6rem 0.75rem; margin-bottom: 0.75rem; }
    .scala.modificata { border-color: #fab005; background: #fffbeb; }
    .intestazione { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
    .spazio { flex: 1; }
    .nome { flex: 1; }
    ol { margin: 0; padding-left: 1.6rem; }
    li { margin: 3px 0; }
    li input { width: calc(100% - 8.5rem); }
    li button { padding: 2px 8px; margin-left: 2px; }
    .aggiungi { display: flex; gap: 0.4rem; margin-top: 0.4rem; }
    .aggiungi input { flex: 1; }
    .errore { margin: 0.5rem 0 0; }
  `,
})
export class ScalaEditor {
  private readonly api = inject(ApiService);

  /** Scala da modificare; senza _id è una scala nuova da creare. */
  readonly scala = input.required<Rate>();
  readonly salvata = output<void>();

  protected readonly valori = signal<string[]>([]);
  protected readonly errore = signal('');
  protected readonly salvataggio = signal(false);
  protected nome = '';
  protected nuovoValore = '';

  protected readonly nuova = computed(() => !this.scala()._id);
  protected readonly modificata = computed(
    () => this.nuova() || JSON.stringify(this.valori()) !== JSON.stringify(this.scala().rate),
  );

  constructor() {
    // Riparte dai valori salvati ogni volta che la scala in ingresso cambia.
    effect(() => this.reimposta(this.scala()));
  }

  protected rinomina(i: number, valore: string) {
    this.valori.update((v) => v.map((x, j) => (j === i ? valore : x)));
  }

  protected sposta(i: number, delta: number) {
    this.valori.update((v) => {
      const copia = [...v];
      [copia[i], copia[i + delta]] = [copia[i + delta], copia[i]];
      return copia;
    });
  }

  protected rimuovi(i: number) {
    this.valori.update((v) => v.filter((_, j) => j !== i));
  }

  protected aggiungi() {
    const v = this.nuovoValore.trim();
    if (!v) return;
    this.valori.update((x) => [...x, v]);
    this.nuovoValore = '';
  }

  protected annulla() {
    this.reimposta(this.scala());
    this.salvata.emit(); // per una scala nuova: la chiude
  }

  protected salva() {
    const scala: Rate = {
      rateType: this.nuova() ? this.nome.trim() : this.scala().rateType,
      rate: this.valori().map((v) => v.trim()).filter(Boolean),
    };
    this.errore.set('');
    this.salvataggio.set(true);
    const id = this.scala()._id;
    const richiesta = id ? this.api.aggiornaRate(id, scala) : this.api.creaRate(scala);
    richiesta.subscribe({
      next: () => {
        this.salvataggio.set(false);
        this.salvata.emit();
      },
      error: (e) => {
        this.salvataggio.set(false);
        this.errore.set(messaggioErrore(e));
      },
    });
  }

  protected elimina() {
    const s = this.scala();
    if (!s._id || !confirm(`Eliminare la scala "${s.rateType}"? I valori già usati nelle risorse non cambiano.`)) return;
    this.api.eliminaRate(s._id).subscribe({
      next: () => this.salvata.emit(),
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  private reimposta(s: Rate) {
    this.valori.set([...s.rate]);
    this.nome = s.rateType;
    this.errore.set('');
  }
}
