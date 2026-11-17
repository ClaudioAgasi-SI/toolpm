import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contesto della richiesta in corso: chi sta salvando i dati.
 * Il valore è l'id dell'utente (stringa) oppure un utente tecnico "sistema:..." per script e procedure.
 * Il middleware ContestoUtenteMiddleware apre un contesto per ogni richiesta HTTP; dal blocco B2
 * la guard di autenticazione vi scrive l'utente che ha fatto l'accesso.
 */
export interface ContestoUtente {
  utente: string;
}

/** Utente usato quando non c'è un contesto o la richiesta non è autenticata. */
export const UTENTE_ANONIMO = 'anonimo';

const archivio = new AsyncLocalStorage<ContestoUtente>();

/** Esegue `fn` con il contesto indicato; il contesto è un oggetto modificabile durante l'esecuzione. */
export function eseguiNelContesto<T>(contesto: ContestoUtente, fn: () => T): T {
  return archivio.run(contesto, fn);
}

/** Esegue `fn` come utente tecnico, es. eseguiCome('sistema:migrazione', ...). */
export function eseguiCome<T>(utente: string, fn: () => T): T {
  return archivio.run({ utente }, fn);
}

/** Contesto corrente, se esiste (serve alla guard di autenticazione per impostare l'utente). */
export function contestoCorrente(): ContestoUtente | undefined {
  return archivio.getStore();
}

/** Utente corrente: quello del contesto oppure "anonimo". */
export function utenteCorrente(): string {
  return archivio.getStore()?.utente ?? UTENTE_ANONIMO;
}
