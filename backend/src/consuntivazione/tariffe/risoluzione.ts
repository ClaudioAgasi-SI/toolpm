/**
 * Regole pure delle tariffe (fase 2, blocco C2): nessun accesso al database, testate a parte.
 *
 * Ordine di ricerca della tariffa di una riga, per la sua tipologia e alla sua data:
 * 1. tariffa personalizzata della risorsa;
 * 2. altrimenti tariffa standard del ruolo che la risorsa aveva in quella data;
 * 3. altrimenti nessuna: la riga resta "da valorizzare".
 * Il costo è minuti × centesimi all'ora / 60, arrotondato al centesimo (un solo arrotondamento per riga).
 */

/** Identificativo confrontabile: ObjectId o stringa. */
type Id = { toString(): string } | string;

export interface Periodo {
  validoDal: Date;
  /** null o assente = senza fine. */
  validoAl?: Date | null;
}

export interface TariffaPeriodo extends Periodo {
  _id: Id;
  tipologiaId: Id;
  centesimiOra: number;
}

export interface VoceStoricoRuolo {
  ruoloId: Id;
  dal: Date;
}

export type FonteTariffa = 'personalizzata' | 'standard';

export interface TariffaRisolta {
  fonte: FonteTariffa | null;
  tariffaId: string | null;
  centesimiOra: number | null;
}

const giorno = (d: Date) => d.getTime();

/** La data cade nel periodo (estremi compresi; senza fine = sempre valido dopo l'inizio). */
export function inPeriodo(p: Periodo, data: Date): boolean {
  return giorno(p.validoDal) <= giorno(data) && (p.validoAl == null || giorno(data) <= giorno(p.validoAl));
}

/** Due periodi hanno almeno un giorno in comune. */
export function periodiSovrapposti(a: Periodo, b: Periodo): boolean {
  const fineA = a.validoAl == null ? Infinity : giorno(a.validoAl);
  const fineB = b.validoAl == null ? Infinity : giorno(b.validoAl);
  return giorno(a.validoDal) <= fineB && giorno(b.validoDal) <= fineA;
}

/** Ruolo della risorsa alla data: l'ultima voce dello storico con decorrenza non successiva. */
export function ruoloAllaData(storico: readonly VoceStoricoRuolo[] | undefined, data: Date): string | null {
  let scelta: VoceStoricoRuolo | null = null;
  for (const v of storico ?? []) {
    if (giorno(v.dal) <= giorno(data) && (!scelta || giorno(v.dal) >= giorno(scelta.dal))) scelta = v;
  }
  return scelta ? String(scelta.ruoloId) : null;
}

function tariffaInVigore(tariffe: readonly TariffaPeriodo[], tipologiaId: string, data: Date) {
  return tariffe.find((t) => String(t.tipologiaId) === tipologiaId && inPeriodo(t, data)) ?? null;
}

/**
 * Tariffa di una tipologia a una data, dati la personalizzate della risorsa e le standard del ruolo
 * che aveva in quella data (già filtrate per ruolo).
 */
export function risolviTariffa(
  tipologiaId: Id,
  data: Date,
  personalizzate: readonly TariffaPeriodo[],
  standardDelRuolo: readonly TariffaPeriodo[],
): TariffaRisolta {
  const tip = String(tipologiaId);
  const p = tariffaInVigore(personalizzate, tip, data);
  if (p) return { fonte: 'personalizzata', tariffaId: String(p._id), centesimiOra: p.centesimiOra };
  const s = tariffaInVigore(standardDelRuolo, tip, data);
  if (s) return { fonte: 'standard', tariffaId: String(s._id), centesimiOra: s.centesimiOra };
  return { fonte: null, tariffaId: null, centesimiOra: null };
}

/** Costo di una riga in centesimi: null se manca la tariffa. */
export function costoCentesimi(minuti: number, centesimiOra: number | null): number | null {
  if (centesimiOra == null) return null;
  return Math.round((minuti * centesimiOra) / 60);
}
