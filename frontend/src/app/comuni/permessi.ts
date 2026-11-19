/**
 * Permessi sui progetti calcolati nel frontend, solo per mostrare o nascondere i comandi.
 * Rispecchiano backend/src/permessi/regole.ts, che resta l'unico controllo che conta.
 */
import type { UtenteSessione } from '../core/sessione.service';
import type { Attivita, Progetto } from './modelli';

export function profiloSulProgetto(u: UtenteSessione | null, p: Pick<Progetto, 'approvatori'>): 'TL' | 'PM' | null {
  if (!u?.abilitazione || !u.risorsaId) return null;
  const profili = (p.approvatori ?? []).filter((a) => a.risorsaId === u.risorsaId).map((a) => a.profilo);
  if (profili.includes('PM')) return 'PM';
  return profili.includes('TL') ? 'TL' : null;
}

/** TL e PM del progetto, PMSenior: dati, stato in avanti, attività, percentuale del progetto. */
export const gestisceProgetto = (u: UtenteSessione | null, p: Pick<Progetto, 'approvatori'>) =>
  u?.abilitazione === 'PMSenior' || profiloSulProgetto(u, p) !== null;

/** PM del progetto e PMSenior: approvatori e riapertura. */
export const eProgettoPM = (u: UtenteSessione | null, p: Pick<Progetto, 'approvatori'>) =>
  u?.abilitazione === 'PMSenior' || profiloSulProgetto(u, p) === 'PM';

/** Percentuale dell'attività: anche le risorse assegnate. */
export const puoPercentualeAttivita = (u: UtenteSessione | null, p: Pick<Progetto, 'approvatori'>, a: Pick<Attivita, 'risorseAssegnateIds'>) =>
  gestisceProgetto(u, p) || (!!u?.risorsaId && a.risorseAssegnateIds.includes(u.risorsaId));

/** Passaggi di stato ammessi a partire dallo stato attuale. */
export const PASSAGGI: Record<string, { verso: 'inCorso' | 'chiuso'; etichetta: string; soloPM?: boolean }[]> = {
  inValutazione: [{ verso: 'inCorso', etichetta: 'Avvia (In corso)' }],
  inCorso: [{ verso: 'chiuso', etichetta: 'Chiudi' }],
  chiuso: [{ verso: 'inCorso', etichetta: 'Riapri', soloPM: true }],
};
