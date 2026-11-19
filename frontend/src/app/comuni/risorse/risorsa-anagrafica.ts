import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { messaggioErrore } from '../../core/errori';
import { SessioneService } from '../../core/sessione.service';
import { ComuniApiService } from '../comuni-api.service';
import { giorno, type RisorsaAnagrafica, type VoceAnagrafica } from '../modelli';

interface Modulo {
  cognome: string;
  nome: string;
  email: string;
  cellulare: string;
  matricola: string;
  dataIngresso: string;
  dataUscita: string;
  oreContrattualiGiorno: number | null;
  storicoRuoli: { ruoloId: string; dal: string }[];
}

/** Scheda anagrafica della risorsa: dati della persona e storico dei ruoli. Modifica: PM e PMSenior. */
@Component({
  selector: 'app-risorsa-anagrafica',
  imports: [FormsModule, RouterLink],
  template: `
    <p><a routerLink="/comuni/risorse">← Tutte le risorse</a></p>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    @if (modulo(); as m) {
      <form (ngSubmit)="salva()">
        <header class="testata">
          <h1>{{ nuova() ? 'Nuova risorsa' : m.cognome + ' ' + m.nome }}</h1>
          <div class="azioni">
            @if (messaggio()) {
              <span class="ok">{{ messaggio() }}</span>
            }
            @if (!nuova()) {
              <a class="bottone" [routerLink]="['/pianificatore/risorse', id()]">Skill e pianificazione</a>
            }
            @if (modificabile()) {
              <button type="submit" class="primario" [disabled]="invio()">Salva</button>
            }
          </div>
        </header>
        @if (!modificabile()) {
          <p class="nota">Sola lettura: i dati anagrafici li modificano PM e PMSenior.</p>
        }
        <fieldset class="modulo" [disabled]="!modificabile()">
          <label>Cognome <input name="cognome" required [(ngModel)]="m.cognome" /></label>
          <label>Nome <input name="nome" required [(ngModel)]="m.nome" /></label>
          <label>Email (nome utente) <input name="email" type="email" [required]="nuova()" [(ngModel)]="m.email" /></label>
          <label>Cellulare <input name="cellulare" [(ngModel)]="m.cellulare" /></label>
          <label>Matricola <input name="matricola" [(ngModel)]="m.matricola" /></label>
          <label>Ore contrattuali al giorno <input name="ore" type="number" min="0" max="24" step="0.5" [(ngModel)]="m.oreContrattualiGiorno" /></label>
          <label>Data di ingresso <input name="ingresso" type="date" [(ngModel)]="m.dataIngresso" /></label>
          <label>Data di uscita <input name="uscita" type="date" [(ngModel)]="m.dataUscita" /></label>
        </fieldset>

        <section class="blocco">
          <h2>Ruolo professionale</h2>
          <p class="nota">Il ruolo vale dalla data di decorrenza fino al cambio successivo. Dalla fase 2 decide la tariffa standard.</p>
          <table class="elenco">
            <thead><tr><th>Ruolo</th><th style="width: 12rem">Dal</th><th style="width: 4rem"></th></tr></thead>
            <tbody>
              @for (s of m.storicoRuoli; track $index; let i = $index) {
                <tr>
                  <td>
                    <select [name]="'ruolo-' + i" [(ngModel)]="s.ruoloId" [disabled]="!modificabile()">
                      @for (r of ruoli(); track r._id) {
                        <option [value]="r._id" [disabled]="!r.attivo">{{ r.descrizione }} ({{ r.codice }})</option>
                      }
                    </select>
                  </td>
                  <td><input type="date" [name]="'dal-' + i" [(ngModel)]="s.dal" [disabled]="!modificabile()" /></td>
                  <td>
                    @if (modificabile()) {
                      <button type="button" (click)="m.storicoRuoli.splice(i, 1)" aria-label="Rimuovi">×</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="3" class="tenue">Nessun ruolo.</td></tr>
              }
            </tbody>
          </table>
          @if (modificabile()) {
            <button type="button" (click)="aggiungiRuolo()" [disabled]="!ruoli().length">+ Aggiungi ruolo</button>
            @if (!ruoli().length) {
              <span class="nota"> Nessun ruolo nell'anagrafica: li crea l'amministratore.</span>
            }
          }
        </section>
      </form>
    }
  `,
})
export class RisorsaAnagraficaDettaglio {
  private readonly api = inject(ComuniApiService);
  private readonly router = inject(Router);
  private readonly sessione = inject(SessioneService);

  /** Parametro di rotta: id della risorsa oppure "nuova". */
  readonly id = input.required<string>();

  protected readonly modulo = signal<Modulo | null>(null);
  protected readonly ruoli = signal<VoceAnagrafica[]>([]);
  protected readonly errore = signal('');
  protected readonly messaggio = signal('');
  protected readonly invio = signal(false);
  protected readonly nuova = computed(() => this.id() === 'nuova');
  protected readonly modificabile = computed(() => this.sessione.puo('gestireRisorse'));

  ngOnInit() {
    forkJoin({
      risorsa: this.nuova() ? of(null) : this.api.risorsa(this.id()),
      ruoli: this.api.voci('ruoli'),
    }).subscribe({
      next: ({ risorsa, ruoli }) => {
        this.ruoli.set(ruoli);
        this.modulo.set(this.daRisorsa(risorsa));
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  private daRisorsa(r: RisorsaAnagrafica | null): Modulo {
    return {
      cognome: r?.cognome ?? '',
      nome: r?.nome ?? '',
      email: r?.email ?? '',
      cellulare: r?.cellulare ?? '',
      matricola: r?.matricola ?? '',
      dataIngresso: giorno(r?.dataIngresso),
      dataUscita: giorno(r?.dataUscita),
      oreContrattualiGiorno: r?.oreContrattualiGiorno ?? null,
      storicoRuoli: (r?.storicoRuoli ?? []).map((s) => ({ ruoloId: s.ruoloId, dal: giorno(s.dal) })),
    };
  }

  protected aggiungiRuolo() {
    const attivo = this.ruoli().find((r) => r.attivo);
    this.modulo()!.storicoRuoli.push({ ruoloId: attivo?._id ?? '', dal: new Date().toISOString().slice(0, 10) });
  }

  protected salva() {
    const m = this.modulo()!;
    this.errore.set('');
    this.messaggio.set('');
    const corpo = {
      cognome: m.cognome,
      nome: m.nome,
      ...(m.email || this.nuova() ? { email: m.email } : {}),
      cellulare: m.cellulare || null,
      matricola: m.matricola || null,
      dataIngresso: m.dataIngresso || null,
      dataUscita: m.dataUscita || null,
      oreContrattualiGiorno: m.oreContrattualiGiorno ?? null,
      storicoRuoli: m.storicoRuoli,
    } as unknown as Partial<RisorsaAnagrafica>;
    this.invio.set(true);
    const richiesta = this.nuova() ? this.api.creaRisorsa(corpo) : this.api.modificaRisorsa(this.id(), corpo);
    richiesta.subscribe({
      next: (r) => {
        this.invio.set(false);
        this.modulo.set(this.daRisorsa(r));
        this.messaggio.set('Salvato.');
        if (this.nuova()) void this.router.navigate(['/comuni/risorse', r._id]);
      },
      error: (e) => {
        this.invio.set(false);
        this.errore.set(messaggioErrore(e));
      },
    });
  }
}
