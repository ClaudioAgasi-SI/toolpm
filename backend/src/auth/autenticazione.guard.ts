import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { contestoCorrente } from '../infrastruttura/contesto-utente.js';
import { AuthService } from './auth.service.js';
import { CHIAVE_PUBBLICA, CHIAVE_RUOLI, type UtenteAutenticato } from './decoratori.js';
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
 * Guard globale (fase 1, blocco B2).
 * - Riconosce l'utente dal token e lo scrive nella richiesta e nel contesto (per il tracciamento).
 * - Gli endpoint @Pubblica() passano sempre.
 * - Gli endpoint @Ruoli(...) richiedono l'accesso e uno dei ruoli indicati.
 * - Gli altri richiedono l'accesso solo se AUTH_OBBLIGATORIA=true. Finché il frontend non ha la
 *   pagina di accesso (blocco B6) il valore predefinito è false: le richieste anonime passano come "anonimo".
 */
@Injectable()
export class AutenticazioneGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
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
    if (!utente) {
      if (ruoli.length || this.config.get<string>('AUTH_OBBLIGATORIA') === 'true') {
        throw new UnauthorizedException('Accesso richiesto');
      }
      return true;
    }
    if (ruoli.length && !ruoli.some((r) => utente.ruoli.includes(r))) {
      throw new ForbiddenException(`Operazione riservata a: ${ruoli.join(', ')}`);
    }
    return true;
  }
}
