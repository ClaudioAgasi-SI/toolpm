import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { contestoCorrente } from '../infrastruttura/contesto-utente.js';
import { AuthService } from './auth.service.js';
import { permessoGlobale, type PermessoGlobale } from '../permessi/regole.js';
import { CHIAVE_PERMESSI, CHIAVE_PUBBLICA, CHIAVE_RUOLI, type UtenteAutenticato } from './decoratori.js';
import type { Ruolo } from './utente.schema.js';

/** Nome del cookie con il token di accesso. */
export const COOKIE_TOKEN = 'toolpm_token';

interface RichiestaHttp {
  headers: Record<string, string | string[] | undefined>;
  utente?: UtenteAutenticato;
}

/** Token dal cookie toolpm_token oppure dall'intestazione "Authorization: Bearer ..." (Swagger, strumenti). */
export function estraiToken(headers: RichiestaHttp['headers']): string | null {
  const auth = headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  const cookie = headers['cookie'];
  if (typeof cookie !== 'string') return null;
  for (const parte of cookie.split(';')) {
    const [nome, ...valore] = parte.trim().split('=');
    if (nome === COOKIE_TOKEN) return decodeURIComponent(valore.join('=')) || null;
  }
  return null;
}

/**
 * Guard globale (fase 1, blocchi B2 e B6).
 * - Riconosce l'utente dal token e lo scrive nella richiesta e nel contesto (per il tracciamento).
 * - Gli endpoint @Pubblica() passano sempre (login, logout, health).
 * - Tutti gli altri richiedono l'accesso (401); dal blocco B6 non ci sono più richieste anonime.
 * - Gli endpoint @Ruoli(...) richiedono uno dei ruoli indicati, quelli @Permesso(...) tutti i permessi
 *   globali indicati (403).
 */
@Injectable()
export class AutenticazioneGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RichiestaHttp>();
    const token = estraiToken(req.headers);
    const utente = token ? await this.auth.utenteDaToken(token) : null;
    if (utente) {
      req.utente = utente;
      const contesto = contestoCorrente();
      if (contesto) contesto.utente = utente.id;
    }

    const bersagli = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CHIAVE_PUBBLICA, bersagli)) return true;

    const ruoli = this.reflector.getAllAndOverride<Ruolo[] | undefined>(CHIAVE_RUOLI, bersagli) ?? [];
    const permessi = this.reflector.getAllAndOverride<PermessoGlobale[] | undefined>(CHIAVE_PERMESSI, bersagli);
    if (!utente) throw new UnauthorizedException('Accesso richiesto');
    if (ruoli.length && !ruoli.some((r) => utente.ruoli.includes(r))) {
      throw new ForbiddenException(`Operazione riservata a: ${ruoli.join(', ')}`);
    }
    const negato = permessi?.find((p) => !permessoGlobale(utente, p));
    if (negato) throw new ForbiddenException(`Permesso mancante: ${negato}`);
    return true;
  }
}
