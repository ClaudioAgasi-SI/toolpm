import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, tap } from 'rxjs';

export type Abilitazione = 'TL' | 'PM' | 'PMSenior';
export type RuoloApplicativo = 'risorsa' | 'controller' | 'admin';

/** Permessi globali calcolati dal backend (permessi/regole.ts), restituiti da /api/auth/me. */
export type PermessoGlobale =
  | 'gestireClienti'
  | 'gestireCentriDiCosto'
  | 'creareProgetto'
  | 'gestireRisorse'
  | 'gestireCaratteristicheTutteLeRisorse'
  | 'gestireRuoli'
  | 'gestireParametri'
  | 'gestireUtenti'
  | 'gestireTipologieCosto'
  | 'gestireTariffe'
  | 'consuntivare'
  | 'approvare'
  | 'gestirePeriodi'
  | 'consultareStorico';

/** Utente che ha fatto l'accesso, come lo restituisce GET /api/auth/me. */
export interface UtenteSessione {
  id: string;
  email: string;
  nome?: string;
  risorsaId?: string;
  abilitazione: Abilitazione | null;
  ruoli: RuoloApplicativo[];
  deveCambiarePassword: boolean;
  permessi: Partial<Record<PermessoGlobale, boolean>>;
}

/**
 * Sessione dell'utente (fase 1, blocco B6). Il token sta in un cookie httpOnly impostato dal backend:
 * il frontend non lo vede, conosce solo il profilo restituito da /api/auth/me.
 */
@Injectable({ providedIn: 'root' })
export class SessioneService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly utente = signal<UtenteSessione | null>(null);
  readonly autenticato = computed(() => this.utente() !== null);
  readonly nomeMostrato = computed(() => this.utente()?.nome || this.utente()?.email || '');

  /** Legge il profilo all'avvio dell'applicazione; senza accesso valido l'utente resta null. */
  async carica(): Promise<void> {
    try {
      this.utente.set(await firstValueFrom(this.http.get<UtenteSessione>('/api/auth/me')));
    } catch {
      this.utente.set(null);
    }
  }

  login(email: string, password: string) {
    return this.http.post<UtenteSessione>('/api/auth/login', { email, password }).pipe(tap((u) => this.utente.set(u)));
  }

  async logout() {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } finally {
      this.utente.set(null);
      await this.router.navigate(['/accesso']);
    }
  }

  async cambiaPassword(attuale: string, nuova: string) {
    await firstValueFrom(this.http.post('/api/auth/cambia-password', { attuale, nuova }));
    await this.carica();
  }

  /** Accesso scaduto o revocato (risposta 401): si torna alla pagina di accesso. */
  accessoScaduto(ritorno: string) {
    if (!this.utente() && this.router.url.startsWith('/accesso')) return;
    this.utente.set(null);
    void this.router.navigate(['/accesso'], { queryParams: ritorno && ritorno !== '/' ? { ritorno } : {} });
  }

  puo(permesso: PermessoGlobale): boolean {
    return !!this.utente()?.permessi[permesso];
  }

  haRuolo(ruolo: RuoloApplicativo): boolean {
    return !!this.utente()?.ruoli.includes(ruolo);
  }

  /** PMSenior: gestisce tutti i progetti. */
  ePMSenior(): boolean {
    return this.utente()?.abilitazione === 'PMSenior';
  }
}
