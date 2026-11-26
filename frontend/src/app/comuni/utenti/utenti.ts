import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { messaggioErrore } from '../../core/errori';
import { type Abilitazione, type RuoloApplicativo, SessioneService } from '../../core/sessione.service';
import { ComuniApiService } from '../comuni-api.service';
import type { RisorsaAnagrafica, UtenteAdmin } from '../modelli';

interface Bozza {
  email: string;
  nome: string;
  risorsaId: string;
  abilitazione: Abilitazione | '';
  ruoli: RuoloApplicativo[];
  attivo: boolean;
}

const RUOLI: RuoloApplicativo[] = ['risorsa', 'controller', 'admin', 'commerciale'];

/** Password provvisoria di 12 caratteri senza caratteri ambigui. */
function passwordProvvisoria() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const casuali = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(casuali, (n) => alfabeto[n % alfabeto.length]).join('');
}

/** Gestione degli utenti (solo amministratore): abilitazione, ruoli, risorsa collegata, password provvisorie. */
@Component({
  selector: 'app-utenti',
  imports: [FormsModule],
  template: `
    <header class="testata">
      <h1>Utenti</h1>
      <input type="search" placeholder="Cerca email o nome…" [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" />
    </header>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }
    @if (messaggio()) {
      <p class="ok">{{ messaggio() }}</p>
    }

    <details class="blocco" [open]="false">
      <summary><strong>+ Nuovo utente</strong></summary>
      <div class="modulo">
        <label>Email <input name="n-email" type="email" [(ngModel)]="nuovo.email" /></label>
        <label>Nome mostrato <input name="n-nome" [(ngModel)]="nuovo.nome" /></label>
        <label>Risorsa collegata
          <select name="n-risorsa" [(ngModel)]="nuovo.risorsaId" (ngModelChange)="proponiDaRisorsa()">
            <option value="">— nessuna —</option>
            @for (r of risorse(); track r._id) {
              <option [value]="r._id">{{ r.cognome }} {{ r.nome }}</option>
            }
          </select>
        </label>
        <label>Abilitazione
          <select name="n-abil" [(ngModel)]="nuovo.abilitazione">
            <option value="">nessuna</option><option value="TL">TL</option><option value="PM">PM</option><option value="PMSenior">PMSenior</option>
          </select>
        </label>
        <label>Password provvisoria
          <span class="azioni"><input name="n-pw" [(ngModel)]="passwordNuovo" /><button type="button" (click)="passwordNuovo = genera()">Genera</button></span>
        </label>
        <div class="ruoli">
          @for (r of ruoliApplicativi; track r) {
            <label class="spunta"><input type="checkbox" [checked]="nuovo.ruoli.includes(r)" (change)="alterna(nuovo, r)" /> {{ r }}</label>
          }
        </div>
      </div>
      <button type="button" class="primario" [disabled]="!nuovo.email || passwordNuovo.length < 10" (click)="crea()">Crea l'utente</button>
      <span class="nota"> Comunica la password alla persona: al primo accesso dovrà cambiarla.</span>
    </details>

    <table class="elenco">
      <thead>
        <tr><th>Email</th><th>Nome</th><th>Risorsa</th><th style="width: 8rem">Abilitazione</th><th style="width: 15rem">Ruoli</th><th style="width: 5rem">Attivo</th><th>Ultimo accesso</th><th style="width: 13rem"></th></tr>
      </thead>
      <tbody>
        @for (u of filtrati(); track u._id) {
          <tr [class.disattivo]="!u.attivo">
            @if (inModifica() === u._id) {
              <td><input name="e" [(ngModel)]="bozza.email" /></td>
              <td><input name="n" [(ngModel)]="bozza.nome" /></td>
              <td>
                <select name="r" [(ngModel)]="bozza.risorsaId">
                  <option value="">— nessuna —</option>
                  @for (r of risorse(); track r._id) {
                    <option [value]="r._id">{{ r.cognome }} {{ r.nome }}</option>
                  }
                </select>
              </td>
              <td>
                <select name="a" [(ngModel)]="bozza.abilitazione">
                  <option value="">nessuna</option><option value="TL">TL</option><option value="PM">PM</option><option value="PMSenior">PMSenior</option>
                </select>
              </td>
              <td>
                @for (r of ruoliApplicativi; track r) {
                  <label class="spunta"><input type="checkbox" [checked]="bozza.ruoli.includes(r)" (change)="alterna(bozza, r)" /> {{ r }}</label>
                }
              </td>
              <td><input type="checkbox" name="att" [(ngModel)]="bozza.attivo" /></td>
              <td></td>
              <td class="azioni">
                <button type="button" class="primario" (click)="salva(u)">Salva</button>
                <button type="button" (click)="inModifica.set(null)">Annulla</button>
              </td>
            } @else {
              <td>{{ u.email }} @if (u.deveCambiarePassword) { <span class="etichetta">password provvisoria</span> }</td>
              <td>{{ u.nome }}</td>
              <td>{{ nomeRisorsa(u.risorsaId) }}</td>
              <td>{{ u.abilitazione ?? '—' }}</td>
              <td>{{ u.ruoli.join(', ') }}</td>
              <td>{{ u.attivo ? 'sì' : 'no' }}</td>
              <td>{{ u.ultimoAccesso?.slice(0, 16)?.replace('T', ' ') }}</td>
              <td class="azioni">
                <button type="button" (click)="modifica(u)">Modifica</button>
                <button type="button" (click)="reimposta(u)">Nuova password</button>
              </td>
            }
          </tr>
        } @empty {
          <tr><td colspan="8" class="tenue">{{ caricato() ? 'Nessun utente.' : 'Caricamento…' }}</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    details.blocco { border: 1px solid var(--bordo); border-radius: 8px; padding: 0.6rem 1rem; margin: 0.75rem 0 1rem; }
    .ruoli { display: flex; gap: 1rem; align-items: center; }
    td .spunta { display: inline-flex; gap: 0.25rem; margin-right: 0.5rem; }
  `,
})
export class Utenti {
  private readonly api = inject(ComuniApiService);
  private readonly sessione = inject(SessioneService);
  protected readonly ruoliApplicativi = RUOLI;
  protected readonly genera = passwordProvvisoria;

  protected readonly utenti = signal<UtenteAdmin[]>([]);
  protected readonly risorse = signal<RisorsaAnagrafica[]>([]);
  protected readonly filtro = signal('');
  protected readonly errore = signal('');
  protected readonly messaggio = signal('');
  protected readonly caricato = signal(false);
  protected readonly inModifica = signal<string | null>(null);
  protected nuovo: Bozza = this.bozzaVuota();
  protected passwordNuovo = passwordProvvisoria();
  protected bozza: Bozza = this.bozzaVuota();

  protected readonly filtrati = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    return this.utenti().filter((u) => !f || `${u.email} ${u.nome ?? ''}`.toLowerCase().includes(f));
  });

  constructor() {
    this.carica();
  }

  private bozzaVuota(): Bozza {
    return { email: '', nome: '', risorsaId: '', abilitazione: '', ruoli: ['risorsa'], attivo: true };
  }

  private carica() {
    forkJoin({ utenti: this.api.utenti(), risorse: this.api.risorse() }).subscribe({
      next: ({ utenti, risorse }) => {
        this.utenti.set(utenti);
        this.risorse.set(risorse);
        this.caricato.set(true);
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected nomeRisorsa(id?: string | null) {
    const r = id ? this.risorse().find((x) => x._id === id) : undefined;
    return r ? `${r.cognome} ${r.nome}` : '';
  }

  protected alterna(b: Bozza, ruolo: RuoloApplicativo) {
    b.ruoli = b.ruoli.includes(ruolo) ? b.ruoli.filter((r) => r !== ruolo) : [...b.ruoli, ruolo];
  }

  /** Scegliendo la risorsa si propongono email e nome dalla sua anagrafica. */
  protected proponiDaRisorsa() {
    const r = this.risorse().find((x) => x._id === this.nuovo.risorsaId);
    if (!r) return;
    if (!this.nuovo.email && r.email) this.nuovo.email = r.email;
    if (!this.nuovo.nome) this.nuovo.nome = `${r.nome} ${r.cognome}`;
  }

  private corpo(b: Bozza) {
    return { email: b.email.trim(), nome: b.nome || undefined, risorsaId: b.risorsaId || null, abilitazione: b.abilitazione || null, ruoli: b.ruoli, attivo: b.attivo };
  }

  private esito(messaggio: string) {
    return {
      next: () => {
        this.messaggio.set(messaggio);
        this.carica();
      },
      error: (e: unknown) => this.errore.set(messaggioErrore(e)),
    };
  }

  protected crea() {
    this.errore.set('');
    this.messaggio.set('');
    const email = this.nuovo.email.trim();
    const password = this.passwordNuovo;
    this.api.creaUtente({ ...this.corpo(this.nuovo), passwordIniziale: password }).subscribe(
      this.esito(`Creato ${email} con la password provvisoria ${password}: comunicala alla persona.`),
    );
    this.nuovo = this.bozzaVuota();
    this.passwordNuovo = passwordProvvisoria();
  }

  protected modifica(u: UtenteAdmin) {
    this.bozza = { email: u.email, nome: u.nome ?? '', risorsaId: u.risorsaId ?? '', abilitazione: u.abilitazione ?? '', ruoli: [...u.ruoli], attivo: u.attivo };
    this.inModifica.set(u._id);
  }

  protected salva(u: UtenteAdmin) {
    this.errore.set('');
    this.messaggio.set('');
    this.api.modificaUtente(u._id, this.corpo(this.bozza)).subscribe({
      ...this.esito('Utente aggiornato.'),
      next: () => {
        this.inModifica.set(null);
        this.messaggio.set(u._id === this.sessione.utente()?.id ? 'Utente aggiornato: i tuoi permessi cambiano dal prossimo accesso.' : 'Utente aggiornato.');
        this.carica();
      },
    });
  }

  protected reimposta(u: UtenteAdmin) {
    const password = passwordProvvisoria();
    if (!confirm(`Impostare una nuova password provvisoria per ${u.email}?`)) return;
    this.errore.set('');
    this.api.reimpostaPassword(u._id, password).subscribe(this.esito(`Nuova password provvisoria per ${u.email}: ${password} — comunicala alla persona.`));
  }
}
