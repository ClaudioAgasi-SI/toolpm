/** Modelli della sezione Offerte e preventivi (fase 5). */

// ---- Listino di vendita (blocco F1) ----

/** Voce del listino: tariffa giornaliera di vendita di un ruolo, standard (clienteId null) o per cliente. */
export interface VoceListino {
  _id: string;
  ruoloId: string;
  clienteId: string | null;
  validoDal: string;
  validoAl: string | null;
  centesimiGiorno: number;
}

export interface DatiVoceListino {
  validoDal: string;
  validoAl: string | null;
  centesimiGiorno: number;
}

export type FonteVendita = 'cliente' | 'standard';

export interface RuoloApplicabile {
  ruoloId: string;
  ruoloCodice: string;
  ruoloDescrizione: string;
  vendita: { fonte: FonteVendita | null; voceId: string | null; centesimiGiorno: number | null };
  costoPresente: boolean;
  costoCentesimiGiorno: number | null;
  /** Periodo della tariffa di costo usata ("AAAA-MM-GG"; al null = senza fine). */
  costoValidoDal: string | null;
  costoValidoAl: string | null;
}

export interface ListinoApplicabile {
  data: string;
  clienteId: string | null;
  oreGiorno: number;
  ruoli: RuoloApplicabile[];
  senzaVendita: number;
  senzaCosto: number;
}

/** "dal 01/01/2026" oppure "dal 01/01/2026 al 31/12/2026". */
export function periodoBreve(dal: string | null, al: string | null): string {
  if (!dal) return '';
  const it = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
  return al ? `dal ${it(dal)} al ${it(al)}` : `dal ${it(dal)}`;
}

export const euroGiorno = (c: number | null | undefined) =>
  c === null || c === undefined ? '—' : `${(c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/gg`;

/** Margine percentuale di una giornata venduta a listino rispetto al costo (un decimale), null se manca un importo. */
export function margineGiorno(venditaCentesimi: number | null | undefined, costoCentesimi: number | null | undefined): number | null {
  if (venditaCentesimi == null || costoCentesimi == null || venditaCentesimi === 0) return null;
  return Math.round(((venditaCentesimi - costoCentesimi) / venditaCentesimi) * 1000) / 10;
}
