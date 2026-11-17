import { Injectable, type NestMiddleware } from '@nestjs/common';
import { UTENTE_ANONIMO, eseguiNelContesto } from './contesto-utente.js';

/** Apre il contesto dell'utente per ogni richiesta HTTP; tutto ciò che segue (guard, servizi, Mongoose) lo vede. */
@Injectable()
export class ContestoUtenteMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void) {
    eseguiNelContesto({ utente: UTENTE_ANONIMO }, next);
  }
}
