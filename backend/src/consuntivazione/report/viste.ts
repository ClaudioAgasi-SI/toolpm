import { BadRequestException } from '@nestjs/common';
import type { StatoRiga } from '../consuntivi/consuntivo.schema.js';

/**
 * Le due viste dei report (fase 4, decisione 11).
 * - approvata (predefinita, ufficiale): righe approvate dal PM e righe dei mesi chiusi;
 * - provvisoria: anche le righe in bozza, inviate e con via libera del TL. Le respinte mai.
 */
export type Vista = 'approvata' | 'provvisoria';

export const STATI_VISTA: Record<Vista, StatoRiga[]> = {
  approvata: ['approvata', 'chiusa'],
  provvisoria: ['approvata', 'chiusa', 'bozza', 'inviata', 'approvataTL'],
};

/** Righe che nella vista approvata non contano ma vanno segnalate (decisione 1). */
export const STATI_IN_ATTESA: StatoRiga[] = ['bozza', 'inviata', 'approvataTL', 'respinta'];

export function leggiVista(valore: unknown): Vista {
  if (valore === undefined || valore === null || valore === '') return 'approvata';
  if (valore === 'approvata' || valore === 'provvisoria') return valore;
  throw new BadRequestException('vista: approvata oppure provvisoria');
}

/** Totali di un gruppo di righe: minuti, costo (centesimi) e righe senza costo. */
export interface Totali {
  righe: number;
  minuti: number;
  costoCentesimi: number;
  /** Righe senza costo (da valorizzare): il loro tempo è nei minuti, il costo no. */
  daValorizzare: number;
  minutiDaValorizzare: number;
}

export const totaliVuoti = (): Totali => ({ righe: 0, minuti: 0, costoCentesimi: 0, daValorizzare: 0, minutiDaValorizzare: 0 });

/** Giorni dai minuti con le ore per giorno del parametro oreGiorno (decisione 9), a due decimali. */
export function giorni(minuti: number, oreGiorno: number) {
  return Math.round((minuti / 60 / oreGiorno) * 100) / 100;
}

/** Stadio di $group che produce i Totali da righe "srotolate" (campo righe). */
export const GRUPPO_TOTALI = {
  righe: { $sum: 1 },
  minuti: { $sum: '$righe.minuti' },
  costoCentesimi: { $sum: { $ifNull: ['$righe.costoCentesimi', 0] } },
  daValorizzare: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$righe.costoCentesimi', null] }, null] }, 1, 0] } },
  minutiDaValorizzare: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$righe.costoCentesimi', null] }, null] }, '$righe.minuti', 0] } },
} as const;

/** Toglie gli euro da un oggetto di totali, per chi non li vede (il TL: decisione 4). */
export function senzaEuro<T extends Partial<Totali>>(t: T): Omit<T, 'costoCentesimi'> {
  const { costoCentesimi: _escluso, ...resto } = t;
  return resto;
}
