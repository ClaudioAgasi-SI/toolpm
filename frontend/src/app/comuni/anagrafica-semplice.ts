import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { messaggioErrore } from '../core/errori';
import { SessioneService } from '../core/sessione.service';
import { ComuniApiService } from './comuni-api.service';
import type { DefinizioneAnagrafica, VoceAnagrafica } from './modelli';

/**
 * Anagrafica semplice (clienti, centri di costo, ruoli): elenco con modifica in riga.
 * La configurazione arriva dalla rotta (data.definizione). Il codice non si modifica; le voci non si
 * cancellano, si disattivano.
 */
@Component({
  selector: 'app-anagrafica-semplice',
  imports: [FormsModule],
  template: `
    @if (definizione(); as d) {
      <header class="testata">
        <h1>{{ d.titolo }}</h1>
        <label class="azioni"><input type="checkbox" [ngModel]="soloAttive()" (ngModelChange)="soloAttive.set($event)" /> solo attivi</label>
      </header>
      @if (!modificabile()) {
        <p class="nota">Sola lettura: le modifiche spettano a {{ chiModifica() }}.</p>
      }
      @if (errore()) {
        <p class="errore">{{ errore() }}</p>
      }
      <table class="elenco">
        <thead>
          <tr><th style="width: 14rem">Codice</th><th>{{ d.etichettaCampo }}</th><th style="width: 6rem">Attivo</th><th style="width: 8rem"></th></tr>
        </thead>
        <tbody>
          @if (modificabile()) {
            <tr>
              <td><input name="nuovo-codice" placeholder="es. TIM" [(ngModel)]="nuova.codice" /></td>
              <td><input name="nuovo-testo" [placeholder]="d.etichettaCampo" [(ngModel)]="nuova.testo" (keyup.enter)="crea()" /></td>
              <td></td>
              <td><button type="button" class="primario" [disabled]="!nuova.codice || !nuova.testo" (click)="crea()">Aggiungi</button></td>
            </tr>
          }
          @for (v of visibili(); track v._id) {
            <tr [class.disattivo]="!v.attivo">
              <td><strong>{{ v.codice }}</strong></td>
              @if (inModifica() === v._id) {
                <td><input name="testo" [(ngModel)]="bozza.testo" (keyup.enter)="salva(v)" /></td>
                <td><input type="checkbox" name="attivo" [(ngModel)]="bozza.attivo" /></td>
                <td class="azioni">
                  <button type="button" class="primario" (click)="salva(v)">Salva</button>
                  <button type="button" (click)="inModifica.set(null)">Annulla</button>
                </td>
              } @else {
                <td>{{ v[d.campo] }}</td>
                <td>{{ v.attivo ? 'sì' : 'no' }}</td>
                <td>
                  @if (modificabile()) {
                    <button type="button" (click)="modifica(v)">Modifica</button>
                  }
                </td>
              }
            </tr>
          } @empty {
            <tr><td colspan="4" class="tenue">{{ caricato() ? 'Nessuna voce.' : 'Caricamento…' }}</td></tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class AnagraficaSemplice {
  private readonly api = inject(ComuniApiService);
  private readonly sessione = inject(SessioneService);

  /** Dalla rotta (data.definizione). */
  readonly definizione = input.required<DefinizioneAnagrafica>();

  protected readonly voci = signal<VoceAnagrafica[]>([]);
  protected readonly soloAttive = signal(false);
  protected readonly errore = signal('');
  protected readonly caricato = signal(false);
  protected readonly inModifica = signal<string | null>(null);
  protected nuova = { codice: '', testo: '' };
  protected bozza = { testo: '', attivo: true };

  protected readonly modificabile = computed(() => this.sessione.puo(this.definizione().permesso));
  protected readonly chiModifica = computed(() => (this.definizione().permesso === 'gestireRuoli' ? "l'amministratore" : 'i PMSenior'));
  protected readonly visibili = computed(() => (this.soloAttive() ? this.voci().filter((v) => v.attivo) : this.voci()));

  constructor() {
    effect(() => this.carica(this.definizione().percorso));
  }

  private carica(percorso: string) {
    this.api.voci(percorso).subscribe({
      next: (v) => {
        this.voci.set(v);
        this.caricato.set(true);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected crea() {
    const d = this.definizione();
    this.errore.set('');
    this.api.creaVoce(d.percorso, { codice: this.nuova.codice.trim(), [d.campo]: this.nuova.testo }).subscribe({
      next: () => {
        this.nuova = { codice: '', testo: '' };
        this.carica(d.percorso);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected modifica(v: VoceAnagrafica) {
    this.bozza = { testo: v[this.definizione().campo] ?? '', attivo: v.attivo };
    this.inModifica.set(v._id);
  }

  protected salva(v: VoceAnagrafica) {
    const d = this.definizione();
    this.errore.set('');
    this.api.modificaVoce(d.percorso, v._id, { [d.campo]: this.bozza.testo, attivo: this.bozza.attivo }).subscribe({
      next: () => {
        this.inModifica.set(null);
        this.carica(d.percorso);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }
}
