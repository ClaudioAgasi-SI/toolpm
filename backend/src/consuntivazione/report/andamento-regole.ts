/**
 * Regole pure della procedura notturna dell'andamento EVM (fase 4, blocco E3; decisioni 12 e 13).
 * Nessun accesso al database; provate in andamento-regole.spec.ts.
 */
import { piuGiorni } from '../consuntivi/regole-giornata.js';
import type { EvmProgetto } from './evm.js';

export const PROCEDURA_EVM = 'evm';
/** Un'esecuzione "inCorso" più vecchia di così si considera interrotta. */
export const SCADENZA_MS = 60 * 60 * 1000;
/** Al primo avvio si va indietro al massimo di un anno. */
export const GIORNI_MASSIMI_INDIETRO = 365;
/** Avvisi conservati nel registro di un'esecuzione. */
export const MAX_AVVISI = 100;

export type StatoEsecuzione = 'inCorso' | 'completata' | 'completataConAvvisi' | 'fallita' | 'interrotta';

/**
 * Primo giorno da elaborare: il giorno dopo l'ultimo completato; al primo avvio la data di inizio più vecchia
 * tra i progetti In corso, ma non più di un anno prima di ieri; senza progetti, ieri.
 * Un risultato dopo `ieri` vuol dire che non c'è niente da fare.
 */
export function giornoDiPartenza(x: { ultimoCompletato: Date | null; inizioPiuVecchio: Date | null; ieri: Date }): Date {
  if (x.ultimoCompletato) return piuGiorni(x.ultimoCompletato, 1);
  const limite = piuGiorni(x.ieri, -GIORNI_MASSIMI_INDIETRO);
  if (!x.inizioPiuVecchio) return x.ieri;
  return x.inizioPiuVecchio < limite ? limite : x.inizioPiuVecchio;
}

/** Giorni da `da` ad `a` compresi (vuoto se da > a). */
export function giorniDa(da: Date, a: Date): Date[] {
  const giorni: Date[] = [];
  for (let d = da; d <= a; d = piuGiorni(d, 1)) giorni.push(d);
  return giorni;
}

/** Valore salvato per un giorno e una vista: gli indicatori, o null se il progetto non ne ha. */
export function valoreDelGiorno(e: EvmProgetto) {
  if (!e.calcolabile) return null;
  const { calcolabile: _c, motivo: _m, ...resto } = e;
  return resto;
}
export type ValoreGiornaliero = NonNullable<ReturnType<typeof valoreDelGiorno>>;

/**
 * Avviso sull'andamento (decisione 13): l'ultima esecuzione non si è conclusa, oppure i dati non arrivano a ieri.
 * null se è tutto in ordine.
 */
export function avvisoAndamento(x: {
  ultima: { stato: StatoEsecuzione; inizio: Date; motivo?: string | null } | null;
  aggiornatoAl: Date | null;
  ieri: Date;
}): string | null {
  const giorno = (d: Date) => d.toLocaleDateString('it-IT', { timeZone: 'UTC' });
  if (!x.ultima) return 'La procedura dell\'andamento non è ancora stata eseguita.';
  if (x.ultima.stato === 'inCorso') return 'L\'elaborazione dell\'andamento è in corso: i dati si stanno aggiornando.';
  if (x.ultima.stato === 'fallita' || x.ultima.stato === 'interrotta') {
    const quando = x.ultima.inizio.toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' });
    return `L'ultima elaborazione (${quando}) non si è conclusa${x.ultima.motivo ? `: ${x.ultima.motivo}` : ''}.` +
      (x.aggiornatoAl ? ` I dati arrivano al ${giorno(x.aggiornatoAl)}.` : '');
  }
  if (!x.aggiornatoAl || x.aggiornatoAl < x.ieri) return `I dati non arrivano a ieri${x.aggiornatoAl ? `: sono aggiornati al ${giorno(x.aggiornatoAl)}` : ''}.`;
  return null;
}
