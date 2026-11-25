import { Component, ElementRef, inject, input, signal } from '@angular/core';
import { messaggioErrore } from '../core/errori';
import { ConsuntivazioneApiService } from './consuntivazione-api.service';

/** Nome del file dall'intestazione Content-Disposition (attachment; filename="..."). */
export function nomeDaIntestazione(valore: string | null, ripiego: string) {
  return /filename="?([^";]+)"?/.exec(valore ?? '')?.[1] ?? ripiego;
}

/**
 * Pulsante "Scarica" dei report (fase 4, blocco E6): Excel o CSV con gli stessi filtri della pagina.
 * Il file arriva dal backend già con la riservatezza degli euro e il nome giusto ("provvisorio" se serve).
 */
@Component({
  selector: 'app-pulsante-scarica',
  host: { '(document:click)': 'chiudiFuori($event)' },
  template: `
    <span class="scarica">
      <button type="button" (click)="aperto.set(!aperto())" [disabled]="lavoro()" [attr.aria-expanded]="aperto()">
        {{ lavoro() ? 'Preparazione…' : etichetta() }} ▾
      </button>
      @if (aperto()) {
        <span class="menu" role="menu">
          <button type="button" role="menuitem" (click)="scarica('xlsx')">Excel (.xlsx)</button>
          <button type="button" role="menuitem" (click)="scarica('csv')">CSV (separato da ;)</button>
        </span>
      }
      @if (errore()) {
        <span class="errore piccolo">{{ errore() }}</span>
      }
    </span>
  `,
  styles: `
    .scarica { position: relative; display: inline-flex; gap: 0.5rem; align-items: center; }
    .menu { position: absolute; top: 100%; right: 0; z-index: 5; display: flex; flex-direction: column; background: #fff; border: 1px solid #d8dde6;
      border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); padding: 4px; margin-top: 4px; min-width: 12rem;
      button { background: none; border: none; text-align: left; padding: 6px 10px; cursor: pointer; border-radius: 4px; white-space: nowrap; }
      button:hover { background: #eef3fa; } }
    .piccolo { font-size: 0.8rem; }
  `,
})
export class PulsanteScarica {
  private readonly api = inject(ConsuntivazioneApiService);
  /** Percorso sotto /api/consuntivazione, es. "report/costi". */
  readonly percorso = input.required<string>();
  readonly filtri = input<Record<string, string | undefined>>({});
  readonly etichetta = input('Scarica');

  protected readonly aperto = signal(false);
  protected readonly lavoro = signal(false);
  protected readonly errore = signal('');

  private readonly elemento = inject(ElementRef<HTMLElement>);

  /** Un clic fuori dal pulsante chiude il menu. */
  protected chiudiFuori(e: Event) {
    if (this.aperto() && !(this.elemento.nativeElement as HTMLElement).contains(e.target as Node)) this.aperto.set(false);
  }

  protected scarica(formato: 'xlsx' | 'csv') {
    this.aperto.set(false);
    this.lavoro.set(true);
    this.errore.set('');
    this.api.scarica(this.percorso(), this.filtri(), formato).subscribe({
      next: (r) => {
        const url = URL.createObjectURL(r.body!);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeDaIntestazione(r.headers.get('Content-Disposition'), `toolpm.${formato}`);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        this.lavoro.set(false);
      },
      error: async (e) => {
        // L'errore arriva come blob: si legge il messaggio JSON.
        let messaggio = messaggioErrore(e);
        try {
          const corpo = JSON.parse(await (e.error as Blob).text()) as { message?: string | string[] };
          if (corpo.message) messaggio = Array.isArray(corpo.message) ? corpo.message.join('; ') : corpo.message;
        } catch {
          /* resta il messaggio generico */
        }
        this.errore.set(messaggio);
        this.lavoro.set(false);
      },
    });
  }
}
