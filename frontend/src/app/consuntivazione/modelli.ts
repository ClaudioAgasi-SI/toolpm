/** Tipi dei dati della sezione Consuntivazione (come restituiti da /api/consuntivazione). */

export type CategoriaTipologia = 'ordinaria' | 'straordinaria';

export interface TipologiaCosto {
  _id: string;
  codice: string;
  descrizione: string;
  ordine: number;
  categoria: CategoriaTipologia;
  attiva: boolean;
  /** Tipologia proposta sulle righe nuove: una sola. */
  predefinita: boolean;
  modificatoIl?: string;
  modificatoDa?: string;
}

/** Tariffa (standard per ruolo o personalizzata per risorsa): importo in centesimi di euro all'ora. */
export interface Tariffa {
  _id: string;
  tipologiaId: string;
  validoDal: string;
  validoAl: string | null;
  centesimiOra: number;
  ruoloId?: string;
  risorsaId?: string;
}

export type FonteTariffa = 'personalizzata' | 'standard';

export interface TariffaApplicabile {
  tipologiaId: string;
  tipologiaCodice: string;
  tipologiaDescrizione: string;
  tipologiaAttiva: boolean;
  fonte: FonteTariffa | null;
  tariffaId: string | null;
  centesimiOra: number | null;
}

export interface TariffeApplicabili {
  risorsaId: string;
  data: string;
  ruolo: { _id: string; codice: string; descrizione: string } | null;
  tariffe: TariffaApplicabile[];
}

/** Dati di una tariffa nuova o modificata, come li manda la pagina. */
export interface DatiTariffa {
  tipologiaId?: string;
  validoDal?: string;
  validoAl?: string | null;
  centesimiOra?: number;
}

/** La tariffa vale nella data "AAAA-MM-GG" (estremi compresi). */
export const tariffaValida = (t: Tariffa, data: string) =>
  t.validoDal.slice(0, 10) <= data && (!t.validoAl || data <= t.validoAl.slice(0, 10));

/** Centesimi all'ora → "39,00 €/h". */
export const euroOra = (c: number | null | undefined) =>
  c === null || c === undefined ? '—' : `${(c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h`;
