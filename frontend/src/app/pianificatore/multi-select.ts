import { Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';

/**
 * Tendina a selezione multipla con caselle di spunta.
 * Uso: <app-multi-select [opzioni]="..." [(selezionate)]="..." />
 */
@Component({
  selector: 'app-multi-select',
  host: {
    '(document:click)': 'clickFuori($event)',
    '(keydown.escape)': 'aperta.set(false)',
  },
  template: `
    <button
      type="button"
      class="apri"
      [disabled]="disabilitata()"
      [attr.aria-expanded]="aperta()"
      aria-haspopup="listbox"
      [title]="selezionate().join(', ')"
      (click)="aperta.set(!aperta())"
    >
      <span class="testo">{{ riepilogo() }}</span>
      <span class="freccia">▾</span>
    </button>
    @if (aperta() && !disabilitata()) {
      <div class="pannello" role="listbox" aria-multiselectable="true">
        <div class="comandi">
          <button type="button" (click)="selezionate.set([...opzioni()])">Tutte</button>
          <button type="button" (click)="selezionate.set([])">Nessuna</button>
        </div>
        @for (o of opzioni(); track o) {
          <label class="opzione">
            <input type="checkbox" [checked]="selezionate().includes(o)" (change)="alterna(o)" />
            {{ o }}
          </label>
        } @empty {
          <p class="vuoto">Nessuna opzione</p>
        }
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-block; }
    .apri { display: flex; align-items: center; gap: 0.5rem; min-width: 11rem; max-width: 16rem; text-align: left; }
    .testo { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .freccia { color: var(--testo-tenue); font-size: 0.8rem; }
    .pannello {
      position: absolute;
      z-index: 20;
      top: calc(100% + 4px);
      left: 0;
      min-width: 100%;
      max-height: 18rem;
      overflow-y: auto;
      background: #fff;
      border: 1px solid #ced4da;
      border-radius: 6px;
      box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
      padding: 0.3rem 0;
    }
    .comandi { display: flex; gap: 0.3rem; padding: 0.2rem 0.5rem 0.4rem; border-bottom: 1px solid var(--bordo); }
    .comandi button { padding: 1px 8px; font-size: 0.8rem; }
    .opzione { display: flex; align-items: center; gap: 0.45rem; padding: 0.3rem 0.75rem; cursor: pointer; white-space: nowrap; }
    .opzione:hover { background: #f1f3f5; }
    .vuoto { margin: 0.4rem 0.75rem; color: var(--testo-tenue); }
  `,
})
export class MultiSelect {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly opzioni = input<string[]>([]);
  readonly selezionate = model<string[]>([]);
  readonly disabilitata = input(false);
  /** Testo mostrato quando non è selezionato nulla. */
  readonly vuota = input('Qualsiasi');

  protected readonly aperta = signal(false);

  protected readonly riepilogo = computed(() => {
    const s = this.selezionate();
    if (this.disabilitata()) return '—';
    if (!s.length) return this.vuota();
    if (s.length <= 2) return s.join(', ');
    return `${s.length} selezionate`;
  });

  protected alterna(o: string) {
    this.selezionate.update((s) => (s.includes(o) ? s.filter((x) => x !== o) : [...s, o]));
  }

  protected clickFuori(e: MouseEvent) {
    if (this.aperta() && !this.host.nativeElement.contains(e.target as Node)) this.aperta.set(false);
  }
}
