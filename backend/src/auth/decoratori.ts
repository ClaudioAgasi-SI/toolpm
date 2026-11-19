import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermessoGlobale } from '../permessi/regole.js';
import type { Abilitazione, Ruolo } from './utente.schema.js';

export const CHIAVE_PUBBLICA = 'toolpm:pubblica';
export const CHIAVE_RUOLI = 'toolpm:ruoli';
export const CHIAVE_PERMESSI = 'toolpm:permessi';

/** Endpoint accessibile senza accesso (login, health). */
export const Pubblica = () => SetMetadata(CHIAVE_PUBBLICA, true);

/** Endpoint riservato a chi ha almeno uno dei ruoli indicati; richiede sempre l'accesso. */
export const Ruoli = (...ruoli: Ruolo[]) => SetMetadata(CHIAVE_RUOLI, ruoli);

/**
 * Endpoint riservato a chi ha tutti i permessi globali indicati (fase 1, blocco B3; vedi permessi/regole.ts),
 * es. @Permesso('gestireClienti'). Senza argomenti richiede solo l'accesso, anche con AUTH_OBBLIGATORIA=false.
 * I permessi che dipendono da un progetto o da una risorsa si controllano nei servizi con PermessiService.
 */
export const Permesso = (...permessi: PermessoGlobale[]) => SetMetadata(CHIAVE_PERMESSI, permessi);

/** Utente che ha fatto l'accesso, come lo vede il resto del backend. */
export interface UtenteAutenticato {
  id: string;
  email: string;
  nome?: string;
  risorsaId?: string;
  abilitazione: Abilitazione | null;
  ruoli: Ruolo[];
  deveCambiarePassword: boolean;
}

/** Parametro del controller con l'utente autenticato (undefined se la richiesta è anonima). */
export const UtenteRichiesta = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ utente?: UtenteAutenticato }>().utente,
);
