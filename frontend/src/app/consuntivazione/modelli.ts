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
