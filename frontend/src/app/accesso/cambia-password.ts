import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { messaggioErrore } from '../core/errori';
import { SessioneService } from '../core/sessione.service';

/** Cambio della propria password; obbligatorio dopo una password provvisoria. */
@Component({
  selector: 'app-cambia-password',
  imports: [FormsModule],
  template: `
    <form class="scheda-accesso" (ngSubmit)="salva()">
      <h1>Cambia password</h1>
      @if (obbligatorio()) {
        <p class="avviso">Hai una password provvisoria: scegline una nuova per continuare.</p>
      }
      <label>Password attuale <input name="attuale" type="password" autocomplete="current-password" required [(ngModel)]="attuale" /></label>
      <label>Nuova password <input name="nuova" type="password" autocomplete="new-password" required [(ngModel)]="nuova" /></label>
      <label>Ripeti la nuova password <input name="conferma" type="password" autocomplete="new-password" required [(ngModel)]="conferma" /></label>
      <p class="nota">Almeno 10 caratteri, diversa da quella attuale.</p>
      @if (errore()) {
        <p class="errore">{{ errore() }}</p>
      }
      <button type="submit" class="primario" [disabled]="invio()">Salva la nuova password</button>
    </form>
  `,
  styles: `
    .scheda-accesso {
      max-width: 380px;
      margin: 3rem auto;
      padding: 1.5rem 1.75rem;
      border: 1px solid var(--bordo);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      h1 { margin: 0; font-size: 1.3rem; }
      label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; }
      .nota { font-size: 0.8rem; color: var(--testo-tenue); margin: 0; }
      .avviso { background: #fff9db; border: 1px solid #ffe066; padding: 0.5rem 0.75rem; border-radius: 6px; margin: 0; }
    }
  `,
})
export class CambiaPassword {
  private readonly sessione = inject(SessioneService);
  private readonly router = inject(Router);

  protected attuale = '';
  protected nuova = '';
  protected conferma = '';
  protected readonly errore = signal('');
  protected readonly invio = signal(false);
  protected readonly obbligatorio = computed(() => !!this.sessione.utente()?.deveCambiarePassword);

  protected async salva() {
    this.errore.set('');
    if (this.nuova.length < 10) return this.errore.set('La nuova password deve avere almeno 10 caratteri.');
    if (this.nuova !== this.conferma) return this.errore.set('Le due password nuove non coincidono.');
    this.invio.set(true);
    try {
      await this.sessione.cambiaPassword(this.attuale, this.nuova);
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.errore.set(messaggioErrore(e));
    } finally {
      this.invio.set(false);
    }
  }
}
