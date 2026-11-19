import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { messaggioErrore } from '../core/errori';
import { SessioneService } from '../core/sessione.service';

/** Pagina di accesso: email e password (fase 1, blocco B6). */
@Component({
  selector: 'app-accesso',
  imports: [FormsModule],
  template: `
    <form class="scheda-accesso" (ngSubmit)="entra()">
      <h1>Accesso a ToolPM</h1>
      <label>Email <input name="email" type="email" autocomplete="username" required [(ngModel)]="email" /></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required [(ngModel)]="password" /></label>
      @if (errore()) {
        <p class="errore">{{ errore() }}</p>
      }
      <button type="submit" class="primario" [disabled]="invio() || !email || !password">Entra</button>
      <p class="nota">Password dimenticata? Chiedi all'amministratore una password provvisoria.</p>
    </form>
  `,
  styles: `
    .scheda-accesso {
      max-width: 360px;
      margin: 4rem auto;
      padding: 1.5rem 1.75rem;
      border: 1px solid var(--bordo);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      h1 { margin: 0 0 0.25rem; font-size: 1.3rem; }
      label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; }
      .nota { font-size: 0.8rem; color: var(--testo-tenue); margin: 0; }
    }
  `,
})
export class Accesso {
  private readonly sessione = inject(SessioneService);
  private readonly router = inject(Router);

  /** Pagina da riaprire dopo l'accesso (parametro ?ritorno=). */
  readonly ritorno = input<string>();

  protected email = '';
  protected password = '';
  protected readonly errore = signal('');
  protected readonly invio = signal(false);

  protected entra() {
    this.errore.set('');
    this.invio.set(true);
    this.sessione.login(this.email.trim(), this.password).subscribe({
      next: (u) => {
        this.invio.set(false);
        const destinazione = u.deveCambiarePassword ? '/cambia-password' : this.ritorno() || '/';
        void this.router.navigateByUrl(destinazione);
      },
      error: (e) => {
        this.invio.set(false);
        this.password = '';
        this.errore.set(e?.status === 401 ? 'Email o password non validi.' : messaggioErrore(e));
      },
    });
  }
}
